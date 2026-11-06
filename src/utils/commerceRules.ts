export interface CartLineInput {
  productId: number;
  variantId?: number | null;
  mrp: number;
  price: number;
  quantity: number;
  stock: number;
  name?: string;
}

export interface CouponInput {
  code: string;
  discountType: 'flat' | 'percent';
  discountValue: number;
  minOrderAmount: number;
  maxDiscount: number;
  isActive: boolean;
}

export interface BillSummaryResult {
  itemCount: number;
  itemTotalMrp: number;
  itemTotalPrice: number;
  discountOnMrp: number;
  couponCode: string | null;
  couponDiscount: number;
  deliveryFee: number;
  deliverySavings: number;
  handlingFee: number;
  handlingSavings: number;
  gstAmount: number;
  toPay: number;
  totalSavings: number;
}

export type OrderStatus =
  | 'placed'
  | 'confirmed'
  | 'packed'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled'
  | 'payment_failed';

const DARK_STORES = [
  { name: 'Gurugram Nirvana Sec-50 Hub', city: 'Gurugram', lat: 28.4126, lng: 77.066, radiusKm: 18 },
  { name: 'South Delhi Green Park Hub', city: 'New Delhi', lat: 28.5589, lng: 77.2068, radiusKm: 18 },
  { name: 'Noida Sector 62 Organic Hub', city: 'Noida', lat: 28.6208, lng: 77.3639, radiusKm: 18 },
  { name: 'Bengaluru Indiranagar Hub', city: 'Bengaluru', lat: 12.9784, lng: 77.6408, radiusKm: 18 },
  { name: 'Mumbai Bandra West Hub', city: 'Mumbai', lat: 19.0596, lng: 72.8295, radiusKm: 18 },
  { name: 'Hyderabad Jubilee Hills Hub', city: 'Hyderabad', lat: 17.4326, lng: 78.4071, radiusKm: 18 },
  { name: 'Pune Koregaon Park Hub', city: 'Pune', lat: 18.5362, lng: 73.894, radiusKm: 18 },
];

const SERVICEABLE_PINCODE_PREFIXES = ['110', '122', '201', '560', '400', '500', '411'];

/**
 * Validates a 10-digit Indian mobile number starting with digits 6-9.
 */
export function validateIndianMobile(input: string): boolean {
  const digits = input.replace(/\D/g, '');
  return /^[6-9]\d{9}$/.test(digits);
}

/**
 * Calculates Haversine distance in kilometers between two coordinates.
 */
export function haversineDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

/**
 * Computes serviceability, distance, dynamic ETA (packing time + distance / avg speed),
 * and delivery fee for a coordinate + optional pincode.
 */
export function calculateLocationServiceability(
  lat: number,
  lng: number,
  pincode?: string
): {
  isServiceable: boolean;
  nearestHub: string;
  distanceKm: number;
  etaMinutes: number;
  baseDeliveryFee: number;
} {
  let minDistance = Infinity;
  let nearestHub = DARK_STORES[0].name;
  let hubRadius = DARK_STORES[0].radiusKm;

  for (const store of DARK_STORES) {
    const d = haversineDistanceKm(lat, lng, store.lat, store.lng);
    if (d < minDistance) {
      minDistance = d;
      nearestHub = store.name;
      hubRadius = store.radiusKm;
    }
  }

  const cleanPin = (pincode || '').trim();
  const pinMatches =
    cleanPin.length === 6 &&
    SERVICEABLE_PINCODE_PREFIXES.some((prefix) => cleanPin.startsWith(prefix));

  const isServiceable = minDistance <= hubRadius || pinMatches;
  const effectiveDistanceKm = isServiceable
    ? Math.min(Math.max(minDistance, 0.8), 14.5)
    : Math.round(minDistance * 10) / 10;

  // ETA = packing time (9 mins) + distanceKm / average speed (22 km/h => ~2.72 mins/km)
  const packingMins = 9;
  const travelMins = Math.round((effectiveDistanceKm / 22) * 60);
  const etaMinutes = Math.min(Math.max(packingMins + travelMins, 11), 45);
  const baseDeliveryFee = effectiveDistanceKm <= 4 ? 25 : 35;

  return {
    isServiceable,
    nearestHub,
    distanceKm: Math.round(effectiveDistanceKm * 10) / 10,
    etaMinutes,
    baseDeliveryFee,
  };
}

/**
 * Server- and client-side deterministic bill summary calculation.
 * Never trusts client-supplied totals; computes from unit MRP & selling price.
 */
export function calculateBillSummary(
  items: CartLineInput[],
  coupon?: CouponInput | null,
  distanceKm = 2.4
): BillSummaryResult {
  let itemCount = 0;
  let itemTotalMrp = 0;
  let itemTotalPrice = 0;

  for (const item of items) {
    const qty = Math.max(0, Math.floor(item.quantity));
    if (qty === 0) continue;
    const safePrice = Math.max(0, Math.round(item.price));
    const safeMrp = Math.max(safePrice, Math.round(item.mrp));
    itemCount += qty;
    itemTotalMrp += safeMrp * qty;
    itemTotalPrice += safePrice * qty;
  }

  if (itemCount === 0) {
    return {
      itemCount: 0,
      itemTotalMrp: 0,
      itemTotalPrice: 0,
      discountOnMrp: 0,
      couponCode: null,
      couponDiscount: 0,
      deliveryFee: 0,
      deliverySavings: 0,
      handlingFee: 0,
      handlingSavings: 0,
      gstAmount: 0,
      toPay: 0,
      totalSavings: 0,
    };
  }

  const discountOnMrp = Math.max(0, itemTotalMrp - itemTotalPrice);

  let couponDiscount = 0;
  let appliedCouponCode: string | null = null;
  if (coupon && coupon.isActive && itemTotalPrice >= coupon.minOrderAmount) {
    appliedCouponCode = coupon.code;
    if (coupon.discountType === 'flat') {
      couponDiscount = Math.min(coupon.discountValue, coupon.maxDiscount, itemTotalPrice);
    } else {
      const rawPct = Math.round((itemTotalPrice * coupon.discountValue) / 100);
      couponDiscount = Math.min(rawPct, coupon.maxDiscount, itemTotalPrice);
    }
  }

  const standardDeliveryFee = distanceKm <= 4 ? 30 : 40;
  const isFreeDelivery = itemTotalPrice >= 199;
  const deliveryFee = isFreeDelivery ? 0 : standardDeliveryFee;
  const deliverySavings = isFreeDelivery ? standardDeliveryFee : 0;

  const standardHandlingFee = 15;
  const handlingFee = 4;
  const handlingSavings = standardHandlingFee - handlingFee;

  // 5% GST on handling + packaging, rounded to nearest rupee
  const gstAmount = Math.max(2, Math.round((itemTotalPrice - couponDiscount) * 0.02));

  const toPay = Math.max(
    0,
    itemTotalPrice - couponDiscount + deliveryFee + handlingFee + gstAmount
  );

  const totalSavings = discountOnMrp + couponDiscount + deliverySavings + handlingSavings;

  return {
    itemCount,
    itemTotalMrp,
    itemTotalPrice,
    discountOnMrp,
    couponCode: appliedCouponCode,
    couponDiscount,
    deliveryFee,
    deliverySavings,
    handlingFee,
    handlingSavings,
    gstAmount,
    toPay,
    totalSavings,
  };
}

/**
 * Determines the Cart Drawer bottom CTA state machine:
 * 1. Not logged in -> "Login to proceed"
 * 2. Logged in but no serviceable address -> "Add Address to proceed"
 * 3. Everything ready -> "Proceed to Pay ₹X"
 */
export function resolveCartActionState(
  isLoggedIn: boolean,
  hasServiceableAddress: boolean,
  toPay: number
): {
  state: 'LOGIN_REQUIRED' | 'ADDRESS_REQUIRED' | 'READY_TO_PAY';
  label: string;
} {
  if (!isLoggedIn) {
    return {
      state: 'LOGIN_REQUIRED',
      label: 'Login to proceed',
    };
  }
  if (!hasServiceableAddress) {
    return {
      state: 'ADDRESS_REQUIRED',
      label: 'Add Address to proceed',
    };
  }
  return {
    state: 'READY_TO_PAY',
    label: `Proceed to Pay ₹${toPay}`,
  };
}

const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  placed: ['confirmed', 'cancelled', 'payment_failed'],
  confirmed: ['packed', 'cancelled'],
  packed: ['out_for_delivery'],
  out_for_delivery: ['delivered'],
  delivered: [],
  cancelled: [],
  payment_failed: ['placed', 'confirmed', 'cancelled'],
};

/**
 * Validates order status transitions and determines stock adjustments.
 */
export function validateOrderStatusTransition(
  currentStatus: OrderStatus,
  nextStatus: OrderStatus
): {
  allowed: boolean;
  stockAction: 'decrement' | 'restore' | 'none';
  reason?: string;
} {
  if (currentStatus === nextStatus) {
    return { allowed: true, stockAction: 'none' };
  }

  const validNext = ALLOWED_TRANSITIONS[currentStatus] || [];
  if (!validNext.includes(nextStatus)) {
    return {
      allowed: false,
      stockAction: 'none',
      reason: `Cannot transition order from ${currentStatus} to ${nextStatus}.`,
    };
  }

  let stockAction: 'decrement' | 'restore' | 'none' = 'none';
  if (nextStatus === 'confirmed' && currentStatus !== 'confirmed') {
    stockAction = 'decrement';
  } else if (nextStatus === 'cancelled' && currentStatus === 'confirmed') {
    stockAction = 'restore';
  }

  return { allowed: true, stockAction };
}
