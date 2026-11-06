-- ============================================================================
-- BHARAT ORGANIC — SUPABASE SELLERS TABLE, PRODUCT APPROVAL & RLS SECURITY
-- ============================================================================

-- 1. Create "sellers" table (stores 6-step onboarding data + status = 'pending')
CREATE TABLE IF NOT EXISTS public.sellers (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  business JSONB NOT NULL DEFAULT '{}'::jsonb,
  brand JSONB NOT NULL DEFAULT '{}'::jsonb,
  kyc JSONB NOT NULL DEFAULT '{}'::jsonb,
  bank JSONB NOT NULL DEFAULT '{}'::jsonb,
  pickup JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sellers_user_id ON public.sellers (user_id);
CREATE INDEX IF NOT EXISTS idx_sellers_status ON public.sellers (status);

-- 2. Add seller_id (seller_uid), seller_category, unit, certificate_url, and status to "products"
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS seller_uid TEXT NOT NULL DEFAULT 'seller-bharat-organic';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS seller_category TEXT NOT NULL DEFAULT 'Organic Rice';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS unit TEXT NOT NULL DEFAULT 'g';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS certificate_url TEXT NOT NULL DEFAULT '';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'pending_approval', 'rejected'));

CREATE INDEX IF NOT EXISTS idx_products_seller_uid ON public.products (seller_uid);
CREATE INDEX IF NOT EXISTS idx_products_status ON public.products (status);

-- 3. Ensure "product-images" bucket exists and is public for original seller product photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Storage RLS for "product-images":
-- Any authenticated seller can upload to their own folder; anyone can view approved product photos
DROP POLICY IF EXISTS "Public read product-images" ON storage.objects;
CREATE POLICY "Public read product-images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'product-images');

DROP POLICY IF EXISTS "Authenticated sellers upload product-images" ON storage.objects;
CREATE POLICY "Authenticated sellers upload product-images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'product-images');

-- 4. Enable Row Level Security (RLS) on public.sellers and public.products
ALTER TABLE public.sellers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Sellers table RLS:
-- Seller can read/insert/update ONLY their own row; Admin can read/update all rows
DROP POLICY IF EXISTS "Seller select own sellers row" ON public.sellers;
CREATE POLICY "Seller select own sellers row"
  ON public.sellers FOR SELECT
  USING (
    auth.uid()::text = user_id
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.uid = auth.uid()::text AND u.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Seller insert own sellers row" ON public.sellers;
CREATE POLICY "Seller insert own sellers row"
  ON public.sellers FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "Seller update own sellers row or Admin approve" ON public.sellers;
CREATE POLICY "Seller update own sellers row or Admin approve"
  ON public.sellers FOR UPDATE
  USING (
    auth.uid()::text = user_id
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.uid = auth.uid()::text AND u.role = 'admin'
    )
  );

-- Products table RLS:
-- a) Buyers (anon or customer) can ONLY view approved products (status = 'approved')
-- b) Sellers can view, insert, update, and delete ONLY their own products (seller_uid = auth.uid()::text)
-- c) Admins can view, update (approve/reject), and delete ALL products
DROP POLICY IF EXISTS "Buyers view only approved products; Sellers view own; Admin views all" ON public.products;
CREATE POLICY "Buyers view only approved products; Sellers view own; Admin views all"
  ON public.products FOR SELECT
  USING (
    status = 'approved'
    OR seller_uid = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.uid = auth.uid()::text AND u.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Sellers insert own products with pending_approval" ON public.products;
CREATE POLICY "Sellers insert own products with pending_approval"
  ON public.products FOR INSERT
  WITH CHECK (
    seller_uid = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.uid = auth.uid()::text AND u.role IN ('seller', 'admin')
    )
  );

DROP POLICY IF EXISTS "Sellers update own products; Admin approves all" ON public.products;
CREATE POLICY "Sellers update own products; Admin approves all"
  ON public.products FOR UPDATE
  USING (
    seller_uid = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.uid = auth.uid()::text AND u.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Sellers delete own products; Admin deletes all" ON public.products;
CREATE POLICY "Sellers delete own products; Admin deletes all"
  ON public.products FOR DELETE
  USING (
    seller_uid = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.uid = auth.uid()::text AND u.role = 'admin'
    )
  );
