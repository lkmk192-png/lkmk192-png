-- ============================================================================
-- BHARAT ORGANIC — SELLER HUB & MULTI-VENDOR SUPABASE SQL SCHEMA & RLS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.seller_profiles (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  phone_verified BOOLEAN NOT NULL DEFAULT false,
  email_verified BOOLEAN NOT NULL DEFAULT false,
  current_step INTEGER NOT NULL DEFAULT 1 CHECK (current_step BETWEEN 1 AND 7),
  categories_sold JSONB NOT NULL DEFAULT '[]'::jsonb,
  retail_channels JSONB NOT NULL DEFAULT '[]'::jsonb,
  social_channels JSONB NOT NULL DEFAULT '[]'::jsonb,
  spoc_name TEXT NOT NULL DEFAULT '',
  spoc_designation TEXT NOT NULL DEFAULT 'Founder / Owner',
  brand_name TEXT NOT NULL DEFAULT '',
  brand_logo_url TEXT NOT NULL DEFAULT '',
  short_description TEXT NOT NULL DEFAULT '',
  brand_story TEXT NOT NULL DEFAULT '',
  brand_photos JSONB NOT NULL DEFAULT '[]'::jsonb,
  website_url TEXT NOT NULL DEFAULT '',
  business_type TEXT NOT NULL DEFAULT 'Proprietorship',
  legal_business_name TEXT NOT NULL DEFAULT '',
  pan_number TEXT NOT NULL DEFAULT '',
  gstin_number TEXT NOT NULL DEFAULT '',
  gst_below_threshold BOOLEAN NOT NULL DEFAULT false,
  fssai_number TEXT NOT NULL DEFAULT '',
  fssai_expiry_date TEXT NOT NULL DEFAULT '',
  fssai_certificate_url TEXT NOT NULL DEFAULT '',
  registered_state TEXT NOT NULL DEFAULT '',
  registered_district TEXT NOT NULL DEFAULT '',
  registered_pincode TEXT NOT NULL DEFAULT '',
  signature_data_url TEXT NOT NULL DEFAULT '',
  accepted_terms BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.seller_documents (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  bucket_name TEXT NOT NULL DEFAULT 'seller-documents',
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  is_private BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.seller_bank_details (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  account_holder_name TEXT NOT NULL DEFAULT '',
  account_number_internal TEXT NOT NULL DEFAULT '',
  account_number_masked TEXT NOT NULL DEFAULT '',
  ifsc_code TEXT NOT NULL DEFAULT '',
  bank_name TEXT NOT NULL DEFAULT '',
  branch_name TEXT NOT NULL DEFAULT '',
  cancelled_cheque_url TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.seller_pickup_locations (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  warehouse_name TEXT NOT NULL DEFAULT 'Primary Organic Hub',
  pickup_address TEXT NOT NULL DEFAULT '',
  pincode TEXT NOT NULL DEFAULT '',
  contact_person TEXT NOT NULL DEFAULT '',
  contact_phone TEXT NOT NULL DEFAULT '',
  pickup_time_slots JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_primary BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.seller_applications (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'under_review', 'approved', 'rejected')),
  review_note TEXT NOT NULL DEFAULT '',
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  reviewed_by_uid UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.seller_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_bank_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_pickup_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_applications ENABLE ROW LEVEL SECURITY;

-- Each seller can read/write ONLY rows where user_id = auth.uid(); Admin can read all & update status; Buyers have no access
CREATE POLICY "Sellers manage own seller_profiles" ON public.seller_profiles
  FOR ALL USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

CREATE POLICY "Sellers manage own seller_documents" ON public.seller_documents
  FOR ALL USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

CREATE POLICY "Sellers manage own seller_bank_details" ON public.seller_bank_details
  FOR ALL USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

CREATE POLICY "Sellers manage own seller_pickup_locations" ON public.seller_pickup_locations
  FOR ALL USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

CREATE POLICY "Sellers read own application and Admin manages status" ON public.seller_applications
  FOR ALL USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- Storage Buckets: seller-logos (public read), product-images (public read), seller-documents (private)
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('seller-logos', 'seller-logos', true),
  ('product-images', 'product-images', true),
  ('seller-documents', 'seller-documents', false)
ON CONFLICT (id) DO NOTHING;
