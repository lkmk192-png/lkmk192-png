export interface ProductVariant {
  id: number;
  productId: number;
  unitLabel: string;
  mrp: number;
  price: number;
  discountPct: number;
  stock: number;
  isDefault: boolean;
}

export interface Product {
  id: number;
  slug: string;
  name: string;
  brand: string;
  categoryId: number;
  subcategoryId: number;
  description: string;
  benefits: string;
  shelfLife: string;
  origin: string;
  imageUrl: string;
  galleryUrls: string[];
  isVeg: boolean;
  isOrganic: boolean;
  rating: number;
  reviewCount: string;
  tag: string;
  unitLabel: string;
  mrp: number;
  price: number;
  discountPct: number;
  stock: number;
  deliveryMins: number;
  isTrending: boolean;
  isBestSeller: boolean;
  isFreshGreen: boolean;
  sellerUid: string;
  variants: ProductVariant[];
}

export interface Category {
  id: number;
  slug: string;
  name: string;
  shortLabel: string;
  description: string;
  seoTitle: string;
  seoDescription: string;
  imageUrl: string;
  bannerText: string;
  accentColor: string;
  tabGroup: 'All' | 'Fresh' | 'Cafe' | 'Wellness';
  displayOrder: number;
}

export interface Subcategory {
  id: number;
  categoryId: number;
  slug: string;
  name: string;
  iconName: string;
  imageUrl: string;
  displayOrder: number;
}

export interface Coupon {
  id: number;
  code: string;
  title: string;
  description: string;
  discountType: 'flat' | 'percent';
  discountValue: number;
  minOrderAmount: number;
  maxDiscount: number;
  bankOfferText: string;
  isActive: boolean;
}

export interface UserAddress {
  id?: number;
  userUid?: string;
  label: 'Home' | 'Work' | 'Other';
  flatHouse: string;
  towerBuilding: string;
  area: string;
  city: string;
  pincode: string;
  landmark?: string;
  lat: number;
  lng: number;
  distanceKm: number;
  etaMinutes: number;
  isServiceable: boolean;
  isDefault?: boolean;
}

export interface UserProfile {
  id?: number;
  uid: string;
  email: string;
  phone?: string | null;
  fullName: string;
  role: 'customer' | 'seller' | 'admin';
}

export interface CartItem {
  key: string; // `${productId}_${variantId || 0}`
  productId: number;
  variantId: number | null;
  name: string;
  unitLabel: string;
  imageUrl: string;
  mrp: number;
  price: string | number;
  discountPct: number;
  quantity: number;
  stock: number;
  categoryId: number;
}

export interface OrderItemRecord {
  id: number;
  orderId: number;
  productId: number;
  variantId: number | null;
  productName: string;
  unitLabel: string;
  imageUrl: string;
  mrp: number;
  price: number;
  quantity: number;
}

export interface OrderHistoryRecord {
  id: number;
  orderId: number;
  status: string;
  note: string;
  createdAt: string;
}

export interface OrderRecord {
  id: number;
  orderNumber: string;
  idempotencyKey: string;
  userUid: string;
  customerPhone: string;
  customerName: string;
  addressSnapshot: UserAddress;
  status:
    | 'placed'
    | 'confirmed'
    | 'packed'
    | 'out_for_delivery'
    | 'delivered'
    | 'cancelled'
    | 'payment_failed';
  paymentMethod: 'upi' | 'card' | 'netbanking' | 'cod';
  paymentStatus: 'pending' | 'paid' | 'failed' | 'cod_pending';
  razorpayOrderId?: string | null;
  razorpayPaymentId?: string | null;
  itemTotalMrp: number;
  itemTotalPrice: number;
  discountOnMrp: number;
  couponCode?: string | null;
  couponDiscount: number;
  deliveryFee: number;
  deliverySavings: number;
  handlingFee: number;
  handlingSavings: number;
  gstAmount: number;
  toPay: number;
  totalSavings: number;
  etaMinutes: number;
  scheduledSlot: string;
  deliveryPartnerName: string;
  deliveryPartnerPhone: string;
  createdAt: string;
  updatedAt: string;
  items: OrderItemRecord[];
  history: OrderHistoryRecord[];
}

export interface SellerRecord {
  id: number;
  uid: string;
  storeName: string;
  ownerName: string;
  phone: string;
  email: string;
  city: string;
  gstin: string;
  productCount: number;
  createdAt?: string;
}

export interface NewSellerInput {
  storeName: string;
  ownerName: string;
  phone: string;
  city: string;
  gstin: string;
}

export interface NewSellerProductInput {
  sellerUid: string;
  brand: string;
  categoryId: number;
  subcategoryId?: number;
  name: string;
  unitLabel: string;
  mrp: number;
  price: number;
  stock: number;
  tag: string;
  origin: string;
  shelfLife: string;
  description?: string;
  imageUrl?: string;
}

