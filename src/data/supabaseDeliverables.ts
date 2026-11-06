export const SUPABASE_SQL_SCHEMA = `-- ============================================================================
-- BHARAT ORGANIC — PRODUCTION SUPABASE / POSTGRESQL SCHEMA, INDEXES, RLS & STORAGE
-- ============================================================================

-- 1. PROFILES (Roles: customer, seller, admin — single admin enforced via partial index)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone TEXT UNIQUE,
  full_name TEXT DEFAULT 'Bharat Organic Member',
  role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'seller', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_single_admin_profile
  ON public.profiles ((role))
  WHERE role = 'admin';

-- 2. ADDRESSES
CREATE TABLE IF NOT EXISTS public.addresses (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT 'Home' CHECK (label IN ('Home', 'Work', 'Other')),
  flat_house TEXT NOT NULL,
  tower_building TEXT NOT NULL,
  area TEXT NOT NULL,
  city TEXT NOT NULL,
  pincode TEXT NOT NULL,
  landmark TEXT DEFAULT '',
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  distance_km DOUBLE PRECISION NOT NULL DEFAULT 2.4,
  eta_minutes INTEGER NOT NULL DEFAULT 21,
  is_serviceable BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. CATEGORIES & SUBCATEGORIES
CREATE TABLE IF NOT EXISTS public.categories (
  id BIGSERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  short_label TEXT NOT NULL,
  description TEXT NOT NULL,
  seo_title TEXT NOT NULL,
  seo_description TEXT NOT NULL,
  image_url TEXT NOT NULL,
  banner_text TEXT NOT NULL,
  accent_color TEXT NOT NULL DEFAULT '#059669',
  tab_group TEXT NOT NULL DEFAULT 'All',
  display_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.subcategories (
  id BIGSERIAL PRIMARY KEY,
  category_id BIGINT NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  icon_name TEXT NOT NULL DEFAULT 'Leaf',
  image_url TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0
);

-- 4. PRODUCTS & VARIANTS
CREATE TABLE IF NOT EXISTS public.products (
  id BIGSERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  brand TEXT NOT NULL DEFAULT 'Bharat Organic',
  category_id BIGINT NOT NULL REFERENCES public.categories(id) ON DELETE RESTRICT,
  subcategory_id BIGINT NOT NULL REFERENCES public.subcategories(id) ON DELETE RESTRICT,
  description TEXT NOT NULL,
  benefits TEXT NOT NULL,
  shelf_life TEXT NOT NULL DEFAULT '6 Months',
  origin TEXT NOT NULL DEFAULT 'Certified Organic Farms, India',
  image_url TEXT NOT NULL,
  gallery_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_veg BOOLEAN NOT NULL DEFAULT true,
  is_organic BOOLEAN NOT NULL DEFAULT true,
  rating DOUBLE PRECISION NOT NULL DEFAULT 4.8,
  review_count TEXT NOT NULL DEFAULT '12.4k',
  tag TEXT NOT NULL DEFAULT 'Farm Fresh',
  unit_label TEXT NOT NULL DEFAULT '500 g',
  mrp INTEGER NOT NULL CHECK (mrp >= price),
  price INTEGER NOT NULL CHECK (price > 0),
  discount_pct INTEGER NOT NULL DEFAULT 20,
  stock INTEGER NOT NULL DEFAULT 45 CHECK (stock >= 0),
  delivery_mins INTEGER NOT NULL DEFAULT 21,
  is_trending BOOLEAN NOT NULL DEFAULT false,
  is_best_seller BOOLEAN NOT NULL DEFAULT false,
  is_fresh_green BOOLEAN NOT NULL DEFAULT false,
  seller_id UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.product_variants (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  unit_label TEXT NOT NULL,
  mrp INTEGER NOT NULL,
  price INTEGER NOT NULL,
  discount_pct INTEGER NOT NULL,
  stock INTEGER NOT NULL DEFAULT 40 CHECK (stock >= 0),
  is_default BOOLEAN NOT NULL DEFAULT false
);

-- 5. CARTS & CART_ITEMS
CREATE TABLE IF NOT EXISTS public.carts (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  guest_session_id TEXT,
  coupon_code TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cart_items (
  id BIGSERIAL PRIMARY KEY,
  cart_id BIGINT NOT NULL REFERENCES public.carts(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id BIGINT REFERENCES public.product_variants(id) ON DELETE SET NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0)
);

-- 6. COUPONS
CREATE TABLE IF NOT EXISTS public.coupons (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  discount_type TEXT NOT NULL DEFAULT 'flat' CHECK (discount_type IN ('flat', 'percent')),
  discount_value INTEGER NOT NULL,
  min_order_amount INTEGER NOT NULL DEFAULT 299,
  max_discount INTEGER NOT NULL DEFAULT 200,
  bank_offer_text TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- 7. ORDERS, ORDER_ITEMS, ORDER_STATUS_HISTORY & PAYMENTS
CREATE TABLE IF NOT EXISTS public.orders (
  id BIGSERIAL PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  idempotency_key TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  customer_phone TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  address_snapshot JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'placed' CHECK (
    status IN ('placed', 'confirmed', 'packed', 'out_for_delivery', 'delivered', 'cancelled', 'payment_failed')
  ),
  payment_method TEXT NOT NULL DEFAULT 'upi' CHECK (payment_method IN ('upi', 'card', 'netbanking', 'cod')),
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'cod_pending')),
  razorpay_order_id TEXT,
  razorpay_payment_id TEXT,
  item_total_mrp INTEGER NOT NULL,
  item_total_price INTEGER NOT NULL,
  discount_on_mrp INTEGER NOT NULL,
  coupon_code TEXT,
  coupon_discount INTEGER NOT NULL DEFAULT 0,
  delivery_fee INTEGER NOT NULL DEFAULT 0,
  delivery_savings INTEGER NOT NULL DEFAULT 30,
  handling_fee INTEGER NOT NULL DEFAULT 4,
  handling_savings INTEGER NOT NULL DEFAULT 11,
  gst_amount INTEGER NOT NULL DEFAULT 0,
  to_pay INTEGER NOT NULL,
  total_savings INTEGER NOT NULL,
  eta_minutes INTEGER NOT NULL DEFAULT 21,
  scheduled_slot TEXT DEFAULT 'Instant (21 mins)',
  delivery_partner_name TEXT NOT NULL DEFAULT 'Rajesh Kumar',
  delivery_partner_phone TEXT NOT NULL DEFAULT '+91 98112 44910',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES public.products(id),
  variant_id BIGINT REFERENCES public.product_variants(id),
  product_name TEXT NOT NULL,
  unit_label TEXT NOT NULL,
  image_url TEXT NOT NULL,
  mrp INTEGER NOT NULL,
  price INTEGER NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0)
);

CREATE TABLE IF NOT EXISTS public.order_status_history (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payments (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'razorpay',
  razorpay_order_id TEXT,
  razorpay_payment_id TEXT,
  razorpay_signature TEXT,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'captured',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- PERFORMANCE INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_products_category_id ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_subcategory_id ON public.products(subcategory_id);
CREATE INDEX IF NOT EXISTS idx_products_name ON public.products USING btree(name);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders(user_id);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES — STRICT ROLE-BASED SEPARATION
-- ============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcategories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Helper function to fetch the current user's role from public.profiles
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- 1. PROFILES: 1 account = 1 role ('customer' | 'seller' | 'admin'), unique phone
CREATE POLICY "profiles_select_own_or_admin" ON public.profiles
  FOR SELECT USING (
    auth.uid() = id OR public.get_my_role() = 'admin'
  );

CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT WITH CHECK (
    auth.uid() = id AND role IN ('customer', 'seller')
  );

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()));

-- 2. PRODUCTS:
-- - Customer / public can SELECT only approved products (status = 'approved')
-- - Seller can SELECT, INSERT, UPDATE, DELETE only their own products (seller_id = auth.uid())
-- - Admin has full access
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved'
  CHECK (status IN ('pending_approval', 'approved', 'rejected'));

CREATE POLICY "products_customer_select_approved_only" ON public.products
  FOR SELECT USING (
    status = 'approved'
    OR seller_id = auth.uid()
    OR public.get_my_role() = 'admin'
  );

CREATE POLICY "products_seller_insert_own" ON public.products
  FOR INSERT WITH CHECK (
    public.get_my_role() = 'seller' AND seller_id = auth.uid()
  );

CREATE POLICY "products_seller_update_own" ON public.products
  FOR UPDATE USING (
    (public.get_my_role() = 'seller' AND seller_id = auth.uid())
    OR public.get_my_role() = 'admin'
  )
  WITH CHECK (
    (public.get_my_role() = 'seller' AND seller_id = auth.uid())
    OR public.get_my_role() = 'admin'
  );

CREATE POLICY "products_seller_delete_own" ON public.products
  FOR DELETE USING (
    (public.get_my_role() = 'seller' AND seller_id = auth.uid())
    OR public.get_my_role() = 'admin'
  );

-- 3. ORDERS & ORDER_ITEMS:
-- - Customer can view & create ONLY their own orders (user_id = auth.uid())
-- - Seller can view ONLY orders that contain their products
-- - Admin can view & manage all orders
CREATE POLICY "orders_customer_select_own" ON public.orders
  FOR SELECT USING (
    (public.get_my_role() = 'customer' AND user_id = auth.uid())
    OR (
      public.get_my_role() = 'seller'
      AND EXISTS (
        SELECT 1
        FROM public.order_items oi
        JOIN public.products p ON p.id = oi.product_id
        WHERE oi.order_id = public.orders.id
          AND p.seller_id = auth.uid()
      )
    )
    OR public.get_my_role() = 'admin'
  );

CREATE POLICY "orders_customer_insert_own" ON public.orders
  FOR INSERT WITH CHECK (
    public.get_my_role() = 'customer' AND user_id = auth.uid()
  );

CREATE POLICY "order_items_select_by_role" ON public.order_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = public.order_items.order_id
        AND o.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = public.order_items.product_id
        AND p.seller_id = auth.uid()
    )
    OR public.get_my_role() = 'admin'
  );

-- 4. SELLERS TABLE:
-- - Only the seller owner (user_id = auth.uid()) and admin can read/write
CREATE TABLE IF NOT EXISTS public.sellers (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  business JSONB NOT NULL DEFAULT '{}'::jsonb,
  brand JSONB NOT NULL DEFAULT '{}'::jsonb,
  kyc JSONB NOT NULL DEFAULT '{}'::jsonb,
  bank JSONB NOT NULL DEFAULT '{}'::jsonb,
  pickup JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sellers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sellers_owner_and_admin_select" ON public.sellers
  FOR SELECT USING (
    user_id = auth.uid() OR public.get_my_role() = 'admin'
  );

CREATE POLICY "sellers_owner_insert" ON public.sellers
  FOR INSERT WITH CHECK (
    public.get_my_role() = 'seller' AND user_id = auth.uid()
  );

CREATE POLICY "sellers_owner_and_admin_update" ON public.sellers
  FOR UPDATE USING (
    user_id = auth.uid() OR public.get_my_role() = 'admin'
  )
  WITH CHECK (
    user_id = auth.uid() OR public.get_my_role() = 'admin'
  );

-- Public read access for categories, subcategories, variants & active coupons
CREATE POLICY "Public read categories" ON public.categories FOR SELECT USING (true);
CREATE POLICY "Public read subcategories" ON public.subcategories FOR SELECT USING (true);
CREATE POLICY "Public read variants" ON public.product_variants FOR SELECT USING (true);
CREATE POLICY "Public read active coupons" ON public.coupons FOR SELECT USING (is_active = true);

CREATE POLICY "Customers manage own addresses" ON public.addresses
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================================
-- 9. SELLER PORTAL TABLES, RLS POLICIES & STORAGE BUCKETS
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
`;

export const EDGE_FUNCTION_CREATE_ORDER = `// supabase/functions/create-order/index.ts
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const authHeader = req.headers.get("Authorization")!;
  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(
    authHeader.replace("Bearer ", "")
  );
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const body = await req.json();
  const { idempotencyKey, items, couponCode, addressSnapshot, paymentMethod } = body;

  // 1. Idempotency check
  const { data: existing } = await supabaseAdmin
    .from("orders")
    .select("*")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (existing) {
    return new Response(JSON.stringify({ order: existing, duplicate: true }), { status: 200 });
  }

  // 2. Recalculate prices & verify stock from DB (never trust client prices)
  const productIds = items.map((i: { productId: number }) => i.productId);
  const { data: dbProducts } = await supabaseAdmin
    .from("products")
    .select("*")
    .in("id", productIds);

  let itemTotalMrp = 0;
  let itemTotalPrice = 0;

  for (const item of items) {
    const prod = dbProducts?.find((p: any) => p.id === item.productId);
    if (!prod || prod.stock < item.quantity) {
      return new Response(
        JSON.stringify({ error: \`Insufficient stock for \${prod?.name || item.productId}\` }),
        { status: 400 }
      );
    }
    itemTotalMrp += prod.mrp * item.quantity;
    itemTotalPrice += prod.price * item.quantity;
  }

  const discountOnMrp = itemTotalMrp - itemTotalPrice;
  const deliveryFee = itemTotalPrice >= 199 ? 0 : 30;
  const handlingFee = 4;
  const gstAmount = Math.max(2, Math.round(itemTotalPrice * 0.02));
  const toPay = itemTotalPrice + deliveryFee + handlingFee + gstAmount;

  const { data: createdOrder, error: orderErr } = await supabaseAdmin
    .from("orders")
    .insert({
      order_number: \`BO-\${Date.now().toString().slice(-6)}\`,
      idempotency_key: idempotencyKey,
      user_id: user.id,
      customer_phone: user.phone || "",
      customer_name: body.customerName || "Bharat Organic Member",
      address_snapshot: addressSnapshot,
      status: paymentMethod === "cod" ? "confirmed" : "placed",
      payment_method: paymentMethod,
      payment_status: paymentMethod === "cod" ? "cod_pending" : "pending",
      item_total_mrp: itemTotalMrp,
      item_total_price: itemTotalPrice,
      discount_on_mrp: discountOnMrp,
      delivery_fee: deliveryFee,
      handling_fee: handlingFee,
      gst_amount: gstAmount,
      to_pay: toPay,
      total_savings: discountOnMrp + (deliveryFee === 0 ? 30 : 0) + 11,
    })
    .select()
    .single();

  if (orderErr) {
    return new Response(JSON.stringify({ error: orderErr.message }), { status: 400 });
  }

  return new Response(JSON.stringify({ order: createdOrder }), { status: 200 });
});
`;

export const EDGE_FUNCTION_VERIFY_PAYMENT = `// supabase/functions/verify-payment/index.ts
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.192.0/crypto/mod.ts";

serve(async (req) => {
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = await req.json();
  const secret = Deno.env.get("RAZORPAY_KEY_SECRET")!;

  // Verify HMAC-SHA256 signature
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(\`\${razorpayOrderId}|\${razorpayPaymentId}\`)
  );
  const generatedSignature = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (generatedSignature !== razorpaySignature) {
    await supabaseAdmin
      .from("orders")
      .update({ status: "payment_failed", payment_status: "failed" })
      .eq("id", orderId);
    return new Response(JSON.stringify({ error: "Invalid payment signature" }), { status: 400 });
  }

  const { data: updatedOrder } = await supabaseAdmin
    .from("orders")
    .update({
      status: "confirmed",
      payment_status: "paid",
      razorpay_payment_id: razorpayPaymentId,
    })
    .eq("id", orderId)
    .select()
    .single();

  return new Response(JSON.stringify({ order: updatedOrder, verified: true }), { status: 200 });
});
`;
