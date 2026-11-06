import { relations } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  phone: text('phone'),
  fullName: text('full_name'),
  role: text('role').notNull().default('customer'), // 'customer' | 'seller' | 'admin'
  createdAt: timestamp('created_at').defaultNow(),
});

export const profiles = pgTable(
  'profiles',
  {
    id: text('id').primaryKey(), // matches user uid / auth.uid()
    phone: text('phone').unique(),
    email: text('email'),
    fullName: text('full_name').default('Bharat Organic Member'),
    role: text('role').notNull().default('customer'), // 'customer' | 'seller' | 'admin'
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => [
    index('idx_profiles_phone').on(table.phone),
    index('idx_profiles_role').on(table.role),
  ]
);

export const addresses = pgTable(
  'addresses',
  {
    id: serial('id').primaryKey(),
    userUid: text('user_uid').notNull(),
    label: text('label').notNull().default('Home'), // 'Home' | 'Work' | 'Other'
    flatHouse: text('flat_house').notNull(),
    towerBuilding: text('tower_building').notNull(),
    area: text('area').notNull(),
    city: text('city').notNull(),
    pincode: text('pincode').notNull(),
    landmark: text('landmark').default(''),
    lat: doublePrecision('lat').notNull(),
    lng: doublePrecision('lng').notNull(),
    distanceKm: doublePrecision('distance_km').notNull().default(2.4),
    etaMinutes: integer('eta_minutes').notNull().default(21),
    isServiceable: boolean('is_serviceable').notNull().default(true),
    isDefault: boolean('is_default').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => [index('idx_addresses_user_uid').on(table.userUid)]
);

export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  shortLabel: text('short_label').notNull(),
  description: text('description').notNull(),
  seoTitle: text('seo_title').notNull(),
  seoDescription: text('seo_description').notNull(),
  imageUrl: text('image_url').notNull(),
  bannerText: text('banner_text').notNull(),
  accentColor: text('accent_color').notNull().default('#059669'),
  tabGroup: text('tab_group').notNull().default('All'), // 'All' | 'Fresh' | 'Cafe' | 'Wellness'
  displayOrder: integer('display_order').notNull().default(0),
});

export const subcategories = pgTable(
  'subcategories',
  {
    id: serial('id').primaryKey(),
    categoryId: integer('category_id')
      .references(() => categories.id)
      .notNull(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    iconName: text('icon_name').notNull().default('Leaf'),
    imageUrl: text('image_url').notNull(),
    displayOrder: integer('display_order').notNull().default(0),
  },
  (table) => [index('idx_subcategories_category_id').on(table.categoryId)]
);

export const products = pgTable(
  'products',
  {
    id: serial('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    brand: text('brand').notNull().default('Bharat Organic'),
    categoryId: integer('category_id')
      .references(() => categories.id)
      .notNull(),
    subcategoryId: integer('subcategory_id')
      .references(() => subcategories.id)
      .notNull(),
    description: text('description').notNull(),
    benefits: text('benefits').notNull(),
    shelfLife: text('shelf_life').notNull().default('6 Months'),
    origin: text('origin').notNull().default('Certified Organic Farms, India'),
    imageUrl: text('image_url').notNull(),
    galleryUrls: jsonb('gallery_urls').$type<string[]>().notNull().default([]),
    isVeg: boolean('is_veg').notNull().default(true),
    isOrganic: boolean('is_organic').notNull().default(true),
    rating: doublePrecision('rating').notNull().default(4.8),
    reviewCount: text('review_count').notNull().default('12.4k'),
    tag: text('tag').notNull().default('Farm Fresh'),
    unitLabel: text('unit_label').notNull().default('500 g'),
    mrp: integer('mrp').notNull(),
    price: integer('price').notNull(),
    discountPct: integer('discount_pct').notNull().default(20),
    stock: integer('stock').notNull().default(45),
    deliveryMins: integer('delivery_mins').notNull().default(21),
    isTrending: boolean('is_trending').notNull().default(false),
    isBestSeller: boolean('is_best_seller').notNull().default(false),
    isFreshGreen: boolean('is_fresh_green').notNull().default(false),
    sellerUid: text('seller_uid').notNull().default('seller-bharat-organic'),
    sellerCategory: text('seller_category').notNull().default('Organic Rice'),
    unit: text('unit').notNull().default('g'),
    certificateUrl: text('certificate_url').notNull().default(''),
    status: text('status').notNull().default('approved'), // 'approved' | 'pending_approval' | 'rejected'
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => [
    index('idx_products_category_id').on(table.categoryId),
    index('idx_products_subcategory_id').on(table.subcategoryId),
    index('idx_products_name').on(table.name),
    index('idx_products_seller_uid').on(table.sellerUid),
    index('idx_products_status').on(table.status),
  ]
);

export const productVariants = pgTable(
  'product_variants',
  {
    id: serial('id').primaryKey(),
    productId: integer('product_id')
      .references(() => products.id)
      .notNull(),
    unitLabel: text('unit_label').notNull(),
    mrp: integer('mrp').notNull(),
    price: integer('price').notNull(),
    discountPct: integer('discount_pct').notNull(),
    stock: integer('stock').notNull().default(40),
    isDefault: boolean('is_default').notNull().default(false),
  },
  (table) => [index('idx_variants_product_id').on(table.productId)]
);

export const carts = pgTable('carts', {
  id: serial('id').primaryKey(),
  userUid: text('user_uid'),
  guestSessionId: text('guest_session_id'),
  couponCode: text('coupon_code'),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const cartItems = pgTable('cart_items', {
  id: serial('id').primaryKey(),
  cartId: integer('cart_id')
    .references(() => carts.id)
    .notNull(),
  productId: integer('product_id')
    .references(() => products.id)
    .notNull(),
  variantId: integer('variant_id'),
  quantity: integer('quantity').notNull().default(1),
});

export const coupons = pgTable('coupons', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  discountType: text('discount_type').notNull().default('flat'), // 'flat' | 'percent'
  discountValue: integer('discount_value').notNull(),
  minOrderAmount: integer('min_order_amount').notNull().default(299),
  maxDiscount: integer('max_discount').notNull().default(200),
  bankOfferText: text('bank_offer_text').notNull(),
  isActive: boolean('is_active').notNull().default(true),
});

export const orders = pgTable(
  'orders',
  {
    id: serial('id').primaryKey(),
    orderNumber: text('order_number').notNull().unique(),
    idempotencyKey: text('idempotency_key').notNull().unique(),
    userUid: text('user_uid').notNull(),
    customerPhone: text('customer_phone').notNull(),
    customerName: text('customer_name').notNull(),
    addressSnapshot: jsonb('address_snapshot').notNull(),
    status: text('status').notNull().default('placed'), // placed | confirmed | packed | out_for_delivery | delivered | cancelled | payment_failed
    paymentMethod: text('payment_method').notNull().default('upi'), // upi | card | netbanking | cod
    paymentStatus: text('payment_status').notNull().default('paid'), // pending | paid | failed | cod_pending
    razorpayOrderId: text('razorpay_order_id'),
    razorpayPaymentId: text('razorpay_payment_id'),
    itemTotalMrp: integer('item_total_mrp').notNull(),
    itemTotalPrice: integer('item_total_price').notNull(),
    discountOnMrp: integer('discount_on_mrp').notNull(),
    couponCode: text('coupon_code'),
    couponDiscount: integer('coupon_discount').notNull().default(0),
    deliveryFee: integer('delivery_fee').notNull().default(0),
    deliverySavings: integer('delivery_savings').notNull().default(35),
    handlingFee: integer('handling_fee').notNull().default(4),
    handlingSavings: integer('handling_savings').notNull().default(11),
    gstAmount: integer('gst_amount').notNull().default(0),
    toPay: integer('to_pay').notNull(),
    totalSavings: integer('total_savings').notNull(),
    etaMinutes: integer('eta_minutes').notNull().default(21),
    scheduledSlot: text('scheduled_slot').default('Instant (21 mins)'),
    deliveryPartnerName: text('delivery_partner_name').notNull().default('Rajesh Kumar'),
    deliveryPartnerPhone: text('delivery_partner_phone').notNull().default('+91 98112 44910'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => [
    index('idx_orders_status').on(table.status),
    index('idx_orders_user_uid').on(table.userUid),
  ]
);

export const orderItems = pgTable(
  'order_items',
  {
    id: serial('id').primaryKey(),
    orderId: integer('order_id')
      .references(() => orders.id)
      .notNull(),
    productId: integer('product_id')
      .references(() => products.id)
      .notNull(),
    variantId: integer('variant_id'),
    productName: text('product_name').notNull(),
    unitLabel: text('unit_label').notNull(),
    imageUrl: text('image_url').notNull(),
    mrp: integer('mrp').notNull(),
    price: integer('price').notNull(),
    quantity: integer('quantity').notNull(),
  },
  (table) => [index('idx_order_items_order_id').on(table.orderId)]
);

export const orderStatusHistory = pgTable(
  'order_status_history',
  {
    id: serial('id').primaryKey(),
    orderId: integer('order_id')
      .references(() => orders.id)
      .notNull(),
    status: text('status').notNull(),
    note: text('note').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => [index('idx_order_history_order_id').on(table.orderId)]
);

export const payments = pgTable('payments', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id')
    .references(() => orders.id)
    .notNull(),
  provider: text('provider').notNull().default('razorpay_test'),
  razorpayOrderId: text('razorpay_order_id'),
  razorpayPaymentId: text('razorpay_payment_id'),
  razorpaySignature: text('razorpay_signature'),
  amount: integer('amount').notNull(),
  status: text('status').notNull().default('captured'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Relations
export const categoriesRelations = relations(categories, ({ many }) => ({
  subcategories: many(subcategories),
  products: many(products),
}));

export const subcategoriesRelations = relations(subcategories, ({ one, many }) => ({
  category: one(categories, {
    fields: [subcategories.categoryId],
    references: [categories.id],
  }),
  products: many(products),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, {
    fields: [products.categoryId],
    references: [categories.id],
  }),
  subcategory: one(subcategories, {
    fields: [products.subcategoryId],
    references: [subcategories.id],
  }),
  variants: many(productVariants),
}));

export const productVariantsRelations = relations(productVariants, ({ one }) => ({
  product: one(products, {
    fields: [productVariants.productId],
    references: [products.id],
  }),
}));

export const ordersRelations = relations(orders, ({ many }) => ({
  items: many(orderItems),
  history: many(orderStatusHistory),
}));

// ============================================================================
// SELLER PORTAL & ONBOARDING TABLES
// ============================================================================

export const sellerProfiles = pgTable(
  'seller_profiles',
  {
    id: serial('id').primaryKey(),
    userUid: text('user_uid').notNull().unique(),
    phone: text('phone').notNull(),
    email: text('email').notNull(),
    phoneVerified: boolean('phone_verified').notNull().default(false),
    emailVerified: boolean('email_verified').notNull().default(false),
    currentStep: integer('current_step').notNull().default(1), // 1..7
    // Step 1: Business Details
    categoriesSold: jsonb('categories_sold').$type<string[]>().notNull().default([]),
    retailChannels: jsonb('retail_channels')
      .$type<{ channel: string; monthlySales: string; referenceLink: string }[]>()
      .notNull()
      .default([]),
    socialChannels: jsonb('social_channels')
      .$type<{ platform: string; followers: string; link: string }[]>()
      .notNull()
      .default([]),
    spocName: text('spoc_name').notNull().default(''),
    spocDesignation: text('spoc_designation').notNull().default('Founder / Owner'),
    // Step 2: Brand Details
    brandName: text('brand_name').notNull().default(''),
    brandLogoUrl: text('brand_logo_url').notNull().default(''),
    shortDescription: text('short_description').notNull().default(''),
    brandStory: text('brand_story').notNull().default(''),
    brandPhotos: jsonb('brand_photos').$type<string[]>().notNull().default([]),
    websiteUrl: text('website_url').notNull().default(''),
    // Step 3: Seller Legal & KYC Details
    businessType: text('business_type').notNull().default('Proprietorship'),
    legalBusinessName: text('legal_business_name').notNull().default(''),
    panNumber: text('pan_number').notNull().default(''),
    gstinNumber: text('gstin_number').notNull().default(''),
    gstBelowThreshold: boolean('gst_below_threshold').notNull().default(false),
    fssaiNumber: text('fssai_number').notNull().default(''),
    fssaiExpiryDate: text('fssai_expiry_date').notNull().default(''),
    fssaiCertificateUrl: text('fssai_certificate_url').notNull().default(''),
    registeredState: text('registered_state').notNull().default(''),
    registeredDistrict: text('registered_district').notNull().default(''),
    registeredPincode: text('registered_pincode').notNull().default(''),
    // Step 6: Digital Signature & Agreement
    signatureDataUrl: text('signature_data_url').notNull().default(''),
    acceptedTerms: boolean('accepted_terms').notNull().default(false),
    updatedAt: timestamp('updated_at').defaultNow(),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => [index('idx_seller_profiles_user_uid').on(table.userUid)]
);

export const sellerDocuments = pgTable(
  'seller_documents',
  {
    id: serial('id').primaryKey(),
    userUid: text('user_uid').notNull(),
    documentType: text('document_type').notNull(), // 'brand_logo' | 'product_sample' | 'fssai_certificate' | 'cancelled_cheque' | 'digital_signature'
    bucketName: text('bucket_name').notNull().default('seller-documents'),
    fileName: text('file_name').notNull(),
    fileUrl: text('file_url').notNull(),
    isPrivate: boolean('is_private').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => [index('idx_seller_documents_user_uid').on(table.userUid)]
);

export const sellerBankDetails = pgTable(
  'seller_bank_details',
  {
    id: serial('id').primaryKey(),
    userUid: text('user_uid').notNull().unique(),
    accountHolderName: text('account_holder_name').notNull().default(''),
    accountNumberInternal: text('account_number_internal').notNull().default(''),
    accountNumberMasked: text('account_number_masked').notNull().default(''),
    ifscCode: text('ifsc_code').notNull().default(''),
    bankName: text('bank_name').notNull().default(''),
    branchName: text('branch_name').notNull().default(''),
    cancelledChequeUrl: text('cancelled_cheque_url').notNull().default(''),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => [index('idx_seller_bank_user_uid').on(table.userUid)]
);

export const sellerPickupLocations = pgTable(
  'seller_pickup_locations',
  {
    id: serial('id').primaryKey(),
    userUid: text('user_uid').notNull(),
    warehouseName: text('warehouse_name').notNull().default('Primary Organic Hub'),
    pickupAddress: text('pickup_address').notNull().default(''),
    pincode: text('pincode').notNull().default(''),
    contactPerson: text('contact_person').notNull().default(''),
    contactPhone: text('contact_phone').notNull().default(''),
    pickupTimeSlots: jsonb('pickup_time_slots').$type<string[]>().notNull().default([]),
    isPrimary: boolean('is_primary').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => [index('idx_seller_pickup_user_uid').on(table.userUid)]
);

export const sellerApplications = pgTable(
  'seller_applications',
  {
    id: serial('id').primaryKey(),
    userUid: text('user_uid').notNull().unique(),
    status: text('status').notNull().default('draft'), // 'draft' | 'pending' | 'submitted' | 'under_review' | 'approved' | 'rejected'
    reviewNote: text('review_note').notNull().default(''),
    submittedAt: timestamp('submitted_at'),
    reviewedAt: timestamp('reviewed_at'),
    reviewedByUid: text('reviewed_by_uid'),
    updatedAt: timestamp('updated_at').defaultNow(),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => [
    index('idx_seller_applications_user_uid').on(table.userUid),
    index('idx_seller_applications_status').on(table.status),
  ]
);

export const sellers = pgTable(
  'sellers',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id').notNull().unique(),
    business: jsonb('business').$type<Record<string, any>>().notNull().default({}),
    brand: jsonb('brand').$type<Record<string, any>>().notNull().default({}),
    kyc: jsonb('kyc').$type<Record<string, any>>().notNull().default({}),
    bank: jsonb('bank').$type<Record<string, any>>().notNull().default({}),
    pickup: jsonb('pickup').$type<Record<string, any>[]>().notNull().default([]),
    status: text('status').notNull().default('pending'), // 'pending' | 'approved' | 'rejected'
    updatedAt: timestamp('updated_at').defaultNow(),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => [
    index('idx_sellers_user_id').on(table.userId),
    index('idx_sellers_status').on(table.status),
  ]
);


