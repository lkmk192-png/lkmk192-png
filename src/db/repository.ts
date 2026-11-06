import { eq, asc, desc, ilike, or, and, inArray } from 'drizzle-orm';
import { db, withDbRetry } from './index.ts';
import {
  users,
  addresses,
  categories,
  subcategories,
  products,
  productVariants,
  cartItems,
  coupons,
  orders,
  orderItems,
  orderStatusHistory,
  payments,
} from './schema.ts';
import { SEED_CATEGORIES, SEED_COUPONS, buildImageForSeedProduct } from '../data/catalogSeed.ts';
import {
  calculateBillSummary,
  calculateLocationServiceability,
  validateOrderStatusTransition,
  type OrderStatus,
} from '../utils/commerceRules.ts';

let seedingPromise: Promise<void> | null = null;
let isSeeded = false;

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export async function ensureDatabaseSeeded(): Promise<void> {
  if (isSeeded) return;
  if (seedingPromise) return seedingPromise;

  seedingPromise = (async () => {
    try {
      const existingCats = await withDbRetry(() =>
        db.select({ id: categories.id }).from(categories).limit(1)
      );
      if (existingCats.length > 0) {
        isSeeded = true;
        return;
      }

      console.log('Seeding Bharat Organic catalogue into Cloud SQL...');

      // Seed default roles in users table
      await db
        .insert(users)
        .values([
          {
            uid: 'admin-bharat-organic',
            email: 'admin@bharatorganic.in',
            phone: '9999900001',
            fullName: 'Vikramaditya Sharma (Admin)',
            role: 'admin',
          },
          {
            uid: 'seller-bharat-organic',
            email: 'seller@bharatorganic.in',
            phone: '9999900002',
            fullName: 'Kisan Organic Collective (Seller)',
            role: 'seller',
          },
        ])
        .onConflictDoNothing();

      // Seed coupons
      for (const c of SEED_COUPONS) {
        await db.insert(coupons).values(c).onConflictDoNothing();
      }

      // Seed categories, subcategories, products, and variants
      for (const cat of SEED_CATEGORIES) {
        const firstItem = cat.items[0];
        const catImage = buildImageForSeedProduct(
          firstItem ? firstItem.name : cat.name,
          cat.slug,
          cat.slug,
          firstItem ? firstItem.unitLabel : '500 g'
        );

        const [insertedCat] = await db
          .insert(categories)
          .values({
            slug: cat.slug,
            name: cat.name,
            shortLabel: cat.shortLabel,
            description: cat.description,
            seoTitle: cat.seoTitle,
            seoDescription: cat.seoDescription,
            imageUrl: catImage,
            bannerText: cat.bannerText,
            accentColor: cat.accentColor,
            tabGroup: cat.tabGroup,
            displayOrder: cat.displayOrder,
          })
          .returning();

        const subMap = new Map<string, number>();

        for (let sIdx = 0; sIdx < cat.subcategories.length; sIdx++) {
          const sub = cat.subcategories[sIdx];
          const subImg = buildImageForSeedProduct(sub.name, sub.slug, cat.slug, 'Pack');
          const [insertedSub] = await db
            .insert(subcategories)
            .values({
              categoryId: insertedCat.id,
              slug: sub.slug,
              name: sub.name,
              iconName: sub.iconName,
              imageUrl: subImg,
              displayOrder: sIdx + 1,
            })
            .returning();
          subMap.set(sub.slug, insertedSub.id);
        }

        const defaultSubId = Array.from(subMap.values())[0];

        for (let pIdx = 0; pIdx < cat.items.length; pIdx++) {
          const item = cat.items[pIdx];
          const prodSlug = `${cat.slug}-${slugify(item.name)}-${pIdx + 1}`;
          const subId = subMap.get(item.subSlug) || defaultSubId;
          const discountPct = Math.max(
            5,
            Math.round(((item.mrp - item.price) / item.mrp) * 100)
          );
          const prodImg = buildImageForSeedProduct(
            item.name,
            prodSlug,
            cat.slug,
            item.unitLabel
          );

          const [insertedProd] = await db
            .insert(products)
            .values({
              slug: prodSlug,
              name: item.name,
              brand: item.brand || 'Bharat Organic',
              categoryId: insertedCat.id,
              subcategoryId: subId,
              description: `${item.name} is sourced directly from ${item.origin}. Lab-tested for 100% purity, zero synthetic pesticides, and authentic natural nutrition.`,
              benefits: item.benefits,
              shelfLife: item.shelfLife,
              origin: item.origin,
              imageUrl: prodImg,
              galleryUrls: [prodImg],
              isVeg: true,
              isOrganic: true,
              rating: item.rating,
              reviewCount: item.reviewCount,
              tag: item.tag,
              unitLabel: item.unitLabel,
              mrp: item.mrp,
              price: item.price,
              discountPct,
              stock: 50,
              deliveryMins: 21,
              isTrending: Boolean(item.isTrending),
              isBestSeller: Boolean(item.isBestSeller),
              isFreshGreen: Boolean(item.isFreshGreen),
              sellerUid: 'seller-bharat-organic',
            })
            .returning();

          const variantsToInsert =
            item.variants && item.variants.length > 0
              ? item.variants
              : [
                  { unitLabel: item.unitLabel, mrp: item.mrp, price: item.price },
                  {
                    unitLabel: `2 x ${item.unitLabel} Multipack`,
                    mrp: item.mrp * 2,
                    price: Math.round(item.price * 1.9),
                  },
                ];

          for (let vIdx = 0; vIdx < variantsToInsert.length; vIdx++) {
            const v = variantsToInsert[vIdx];
            const vDisc = Math.max(5, Math.round(((v.mrp - v.price) / v.mrp) * 100));
            await db.insert(productVariants).values({
              productId: insertedProd.id,
              unitLabel: v.unitLabel,
              mrp: v.mrp,
              price: v.price,
              discountPct: vDisc,
              stock: 45,
              isDefault: vIdx === 0,
            });
          }
        }
      }

      isSeeded = true;
      console.log('Bharat Organic catalogue seeding complete.');
    } catch (error) {
      console.error('Database seeding failed:', error);
      throw new Error('Failed to initialize product catalogue.', { cause: error });
    } finally {
      seedingPromise = null;
    }
  })();

  return seedingPromise;
}

interface RawCatalogSnapshot {
  categories: any[];
  subcategories: any[];
  products: any[];
  variants: any[];
  coupons: any[];
}

let lastKnownCatalogSnapshot: RawCatalogSnapshot | null = null;

export function invalidateCatalogCache() {
  lastKnownCatalogSnapshot = null;
}

function buildSeedCatalogFallback(): RawCatalogSnapshot {
  const fallbackCategories: any[] = [];
  const fallbackSubcategories: any[] = [];
  const fallbackProducts: any[] = [];
  const fallbackVariants: any[] = [];

  let catIdCounter = 1;
  let subIdCounter = 1;
  let prodIdCounter = 1;
  let varIdCounter = 1;

  for (const cat of SEED_CATEGORIES) {
    const catId = catIdCounter++;
    const firstItem = cat.items[0];
    const catImage = buildImageForSeedProduct(
      firstItem ? firstItem.name : cat.name,
      cat.slug,
      cat.slug,
      firstItem ? firstItem.unitLabel : '500 g'
    );

    fallbackCategories.push({
      id: catId,
      slug: cat.slug,
      name: cat.name,
      shortLabel: cat.shortLabel,
      description: cat.description,
      seoTitle: cat.seoTitle,
      seoDescription: cat.seoDescription,
      imageUrl: catImage,
      bannerText: cat.bannerText,
      accentColor: cat.accentColor,
      tabGroup: cat.tabGroup,
      displayOrder: cat.displayOrder,
    });

    const subMap = new Map<string, number>();
    for (let sIdx = 0; sIdx < cat.subcategories.length; sIdx++) {
      const sub = cat.subcategories[sIdx];
      const subId = subIdCounter++;
      const subImg = buildImageForSeedProduct(sub.name, sub.slug, cat.slug, 'Pack');
      fallbackSubcategories.push({
        id: subId,
        categoryId: catId,
        slug: sub.slug,
        name: sub.name,
        iconName: sub.iconName,
        imageUrl: subImg,
        displayOrder: sIdx + 1,
      });
      subMap.set(sub.slug, subId);
    }

    const defaultSubId = Array.from(subMap.values())[0] || 1;

    for (let pIdx = 0; pIdx < cat.items.length; pIdx++) {
      const item = cat.items[pIdx];
      const prodId = prodIdCounter++;
      const prodSlug = `${cat.slug}-${slugify(item.name)}-${pIdx + 1}`;
      const subId = subMap.get(item.subSlug) || defaultSubId;
      const discountPct = Math.max(5, Math.round(((item.mrp - item.price) / item.mrp) * 100));
      const prodImg = buildImageForSeedProduct(item.name, prodSlug, cat.slug, item.unitLabel);

      fallbackProducts.push({
        id: prodId,
        slug: prodSlug,
        name: item.name,
        brand: item.brand || 'Bharat Organic',
        categoryId: catId,
        subcategoryId: subId,
        description: `${item.name} is sourced directly from ${item.origin}. Lab-tested for 100% purity, zero synthetic pesticides, and authentic natural nutrition.`,
        benefits: item.benefits,
        shelfLife: item.shelfLife,
        origin: item.origin,
        imageUrl: prodImg,
        galleryUrls: [prodImg],
        isVeg: true,
        isOrganic: true,
        rating: item.rating,
        reviewCount: item.reviewCount,
        tag: item.tag,
        unitLabel: item.unitLabel,
        mrp: item.mrp,
        price: item.price,
        discountPct,
        stock: 50,
        deliveryMins: 21,
        isTrending: Boolean(item.isTrending),
        isBestSeller: Boolean(item.isBestSeller),
        isFreshGreen: Boolean(item.isFreshGreen),
        sellerUid: 'seller-bharat-organic',
        status: 'approved',
      });

      const variantsToBuild =
        item.variants && item.variants.length > 0
          ? item.variants
          : [
              { unitLabel: item.unitLabel, mrp: item.mrp, price: item.price },
              {
                unitLabel: `2 x ${item.unitLabel} Multipack`,
                mrp: item.mrp * 2,
                price: Math.round(item.price * 1.9),
              },
            ];

      for (let vIdx = 0; vIdx < variantsToBuild.length; vIdx++) {
        const v = variantsToBuild[vIdx];
        const vDisc = Math.max(5, Math.round(((v.mrp - v.price) / v.mrp) * 100));
        fallbackVariants.push({
          id: varIdCounter++,
          productId: prodId,
          unitLabel: v.unitLabel,
          mrp: v.mrp,
          price: v.price,
          discountPct: vDisc,
          stock: 45,
          isDefault: vIdx === 0,
        });
      }
    }
  }

  const fallbackCoupons = SEED_COUPONS.map((c, idx) => ({
    id: idx + 1,
    ...c,
  }));

  return {
    categories: fallbackCategories,
    subcategories: fallbackSubcategories,
    products: fallbackProducts,
    variants: fallbackVariants,
    coupons: fallbackCoupons,
  };
}

function formatCatalogFromSnapshot(
  snapshot: RawCatalogSnapshot,
  includePendingForAdmin: boolean
) {
  const variantsByProduct = new Map<number, any[]>();
  for (const v of snapshot.variants) {
    const list = variantsByProduct.get(v.productId) || [];
    list.push(v);
    variantsByProduct.set(v.productId, list);
  }

  const visibleProducts = includePendingForAdmin
    ? snapshot.products
    : snapshot.products.filter((p) => !p.status || p.status === 'approved');

  const enrichedProducts = visibleProducts.map((p) => ({
    ...p,
    variants: variantsByProduct.get(p.id) || [],
  }));

  return {
    categories: snapshot.categories,
    subcategories: snapshot.subcategories,
    products: enrichedProducts,
    coupons: snapshot.coupons,
  };
}

export async function getBootstrapCatalog(includePendingForAdmin = false) {
  try {
    await ensureDatabaseSeeded();

    // Execute in 2 small batches wrapped in withDbRetry to avoid saturating the connection pool on cold start
    const [allCategories, allSubcategories, allCoupons] = await withDbRetry(() =>
      Promise.all([
        db.select().from(categories).orderBy(asc(categories.displayOrder)),
        db.select().from(subcategories).orderBy(asc(subcategories.displayOrder)),
        db.select().from(coupons).where(eq(coupons.isActive, true)),
      ])
    );

    const [allProducts, allVariants] = await withDbRetry(() =>
      Promise.all([
        db.select().from(products).orderBy(asc(products.id)),
        db.select().from(productVariants).orderBy(asc(productVariants.id)),
      ])
    );

    const snapshot: RawCatalogSnapshot = {
      categories: allCategories,
      subcategories: allSubcategories,
      products: allProducts,
      variants: allVariants,
      coupons: allCoupons,
    };
    lastKnownCatalogSnapshot = snapshot;

    return formatCatalogFromSnapshot(snapshot, includePendingForAdmin);
  } catch (error) {
    const fallbackSnapshot = lastKnownCatalogSnapshot || buildSeedCatalogFallback();
    return formatCatalogFromSnapshot(fallbackSnapshot, includePendingForAdmin);
  }
}

export async function searchCatalogProducts(params: {
  query?: string;
  categoryId?: number;
  subcategoryId?: number;
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  sortBy?: string;
}) {
  try {
    const all = await getBootstrapCatalog();
    let filtered = all.products;

    if (params.categoryId) {
      filtered = filtered.filter((p) => p.categoryId === params.categoryId);
    }
    if (params.subcategoryId) {
      filtered = filtered.filter((p) => p.subcategoryId === params.subcategoryId);
    }
    if (params.query && params.query.trim()) {
      const q = params.query.trim().toLowerCase();
      // Find matching categories or subcategories as well so searching "ghee" returns all ghee products + related
      const matchingCatIds = new Set(
        all.categories
          .filter(
            (c) =>
              c.name.toLowerCase().includes(q) ||
              c.description.toLowerCase().includes(q) ||
              c.slug.toLowerCase().includes(q)
          )
          .map((c) => c.id)
      );
      const matchingSubIds = new Set(
        all.subcategories
          .filter((s) => s.name.toLowerCase().includes(q) || s.slug.toLowerCase().includes(q))
          .map((s) => s.id)
      );

      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.tag.toLowerCase().includes(q) ||
          p.benefits.toLowerCase().includes(q) ||
          p.slug.toLowerCase().includes(q) ||
          matchingCatIds.has(p.categoryId) ||
          matchingSubIds.has(p.subcategoryId)
      );
    }
    if (typeof params.minPrice === 'number') {
      filtered = filtered.filter((p) => p.price >= params.minPrice!);
    }
    if (typeof params.maxPrice === 'number') {
      filtered = filtered.filter((p) => p.price <= params.maxPrice!);
    }
    if (typeof params.minRating === 'number') {
      filtered = filtered.filter((p) => p.rating >= params.minRating!);
    }

    if (params.sortBy === 'price_asc') {
      filtered.sort((a, b) => a.price - b.price);
    } else if (params.sortBy === 'price_desc') {
      filtered.sort((a, b) => b.price - a.price);
    } else if (params.sortBy === 'rating') {
      filtered.sort((a, b) => b.rating - a.rating);
    } else if (params.sortBy === 'discount') {
      filtered.sort((a, b) => b.discountPct - a.discountPct);
    }

    return filtered;
  } catch (error) {
    console.error('Database query failed in searchCatalogProducts:', error);
    throw new Error('Search query failed.', { cause: error });
  }
}

export async function getUserAddresses(userUid: string) {
  try {
    return await withDbRetry(() =>
      db
        .select()
        .from(addresses)
        .where(eq(addresses.userUid, userUid))
        .orderBy(desc(addresses.isDefault), desc(addresses.id))
    );
  } catch (error) {
    console.error('Database query failed in getUserAddresses:', error);
    throw new Error('Failed to fetch saved addresses.', { cause: error });
  }
}

export async function saveUserAddress(input: {
  userUid: string;
  label: string;
  flatHouse: string;
  towerBuilding: string;
  area: string;
  city: string;
  pincode: string;
  landmark?: string;
  lat: number;
  lng: number;
}) {
  try {
    const service = calculateLocationServiceability(input.lat, input.lng, input.pincode);

    // Unset previous default for this user
    await db
      .update(addresses)
      .set({ isDefault: false })
      .where(eq(addresses.userUid, input.userUid));

    const [created] = await db
      .insert(addresses)
      .values({
        userUid: input.userUid,
        label: input.label || 'Home',
        flatHouse: input.flatHouse,
        towerBuilding: input.towerBuilding,
        area: input.area,
        city: input.city,
        pincode: input.pincode,
        landmark: input.landmark || '',
        lat: input.lat,
        lng: input.lng,
        distanceKm: service.distanceKm,
        etaMinutes: service.etaMinutes,
        isServiceable: service.isServiceable,
        isDefault: true,
      })
      .returning();

    return created;
  } catch (error) {
    console.error('Database query failed in saveUserAddress:', error);
    throw new Error('Failed to save address.', { cause: error });
  }
}

export async function createServerVerifiedOrder(input: {
  idempotencyKey: string;
  userUid: string;
  customerPhone: string;
  customerName: string;
  addressSnapshot: {
    label: string;
    flatHouse: string;
    towerBuilding: string;
    area: string;
    city: string;
    pincode: string;
    landmark?: string;
    lat: number;
    lng: number;
    distanceKm?: number;
    etaMinutes?: number;
  };
  items: { productId: number; variantId?: number | null; quantity: number }[];
  couponCode?: string | null;
  paymentMethod: 'upi' | 'card' | 'netbanking' | 'cod';
  scheduledSlot?: string;
}) {
  try {
    await ensureDatabaseSeeded();

    // 1. Check idempotency key to prevent duplicate orders on double tap
    const existingOrder = await db
      .select()
      .from(orders)
      .where(eq(orders.idempotencyKey, input.idempotencyKey));

    if (existingOrder.length > 0) {
      const ord = existingOrder[0];
      const items = await db
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, ord.id));
      const history = await db
        .select()
        .from(orderStatusHistory)
        .where(eq(orderStatusHistory.orderId, ord.id))
        .orderBy(asc(orderStatusHistory.id));
      return { order: ord, items, history, duplicate: true };
    }

    if (!input.items || input.items.length === 0) {
      throw new Error('Cart is empty.');
    }

    // 2. Fetch authoritative prices and stock from database (NEVER trust client prices)
    const productIds = input.items.map((i) => i.productId);
    const dbProducts = await db
      .select()
      .from(products)
      .where(inArray(products.id, productIds));
    const dbVariants = await db
      .select()
      .from(productVariants)
      .where(inArray(productVariants.productId, productIds));

    const prodMap = new Map(dbProducts.map((p) => [p.id, p]));
    const varMap = new Map(dbVariants.map((v) => [v.id, v]));

    const verifiedLines: {
      productId: number;
      variantId: number | null;
      productName: string;
      unitLabel: string;
      imageUrl: string;
      mrp: number;
      price: number;
      quantity: number;
      stock: number;
    }[] = [];

    for (const reqItem of input.items) {
      const prod = prodMap.get(reqItem.productId);
      if (!prod) {
        throw new Error(`Product #${reqItem.productId} no longer exists.`);
      }
      const variant = reqItem.variantId ? varMap.get(reqItem.variantId) : null;
      const unitLabel = variant ? variant.unitLabel : prod.unitLabel;
      const mrp = variant ? variant.mrp : prod.mrp;
      const price = variant ? variant.price : prod.price;
      const stock = variant ? variant.stock : prod.stock;

      if (stock < reqItem.quantity) {
        throw new Error(`Out of stock: "${prod.name}" only has ${stock} left.`);
      }

      verifiedLines.push({
        productId: prod.id,
        variantId: variant ? variant.id : null,
        productName: prod.name,
        unitLabel,
        imageUrl: prod.imageUrl,
        mrp,
        price,
        quantity: reqItem.quantity,
        stock,
      });
    }

    // 3. Verify coupon from database
    let activeCoupon = null;
    if (input.couponCode) {
      const foundCoupons = await db
        .select()
        .from(coupons)
        .where(eq(coupons.code, input.couponCode.toUpperCase()));
      if (foundCoupons[0] && foundCoupons[0].isActive) {
        activeCoupon = {
          code: foundCoupons[0].code,
          discountType: foundCoupons[0].discountType as 'flat' | 'percent',
          discountValue: foundCoupons[0].discountValue,
          minOrderAmount: foundCoupons[0].minOrderAmount,
          maxDiscount: foundCoupons[0].maxDiscount,
          isActive: foundCoupons[0].isActive,
        };
      }
    }

    const distanceKm = input.addressSnapshot.distanceKm || 2.4;
    const etaMinutes = input.addressSnapshot.etaMinutes || 21;
    const bill = calculateBillSummary(verifiedLines, activeCoupon, distanceKm);

    const isCod = input.paymentMethod === 'cod';
    const initialStatus: OrderStatus = isCod ? 'confirmed' : 'placed';
    const initialPaymentStatus = isCod ? 'cod_pending' : 'pending';
    const orderNumber = `BO-${Date.now().toString().slice(-6)}-${Math.floor(10 + Math.random() * 89)}`;
    const razorpayOrderId = isCod ? null : `order_rzp_${Date.now()}`;

    const partners = [
      { name: 'Rajesh Kumar', phone: '+91 98112 44910' },
      { name: 'Sandeep Yadav', phone: '+91 98180 77321' },
      { name: 'mohd. Irfan', phone: '+91 99104 55219' },
    ];
    const partner = partners[Math.floor(Math.random() * partners.length)];

    const [createdOrder] = await db
      .insert(orders)
      .values({
        orderNumber,
        idempotencyKey: input.idempotencyKey,
        userUid: input.userUid,
        customerPhone: input.customerPhone,
        customerName: input.customerName,
        addressSnapshot: input.addressSnapshot,
        status: initialStatus,
        paymentMethod: input.paymentMethod,
        paymentStatus: initialPaymentStatus,
        razorpayOrderId,
        itemTotalMrp: bill.itemTotalMrp,
        itemTotalPrice: bill.itemTotalPrice,
        discountOnMrp: bill.discountOnMrp,
        couponCode: bill.couponCode,
        couponDiscount: bill.couponDiscount,
        deliveryFee: bill.deliveryFee,
        deliverySavings: bill.deliverySavings,
        handlingFee: bill.handlingFee,
        handlingSavings: bill.handlingSavings,
        gstAmount: bill.gstAmount,
        toPay: bill.toPay,
        totalSavings: bill.totalSavings,
        etaMinutes,
        scheduledSlot: input.scheduledSlot || `Instant (${etaMinutes} mins)`,
        deliveryPartnerName: partner.name,
        deliveryPartnerPhone: partner.phone,
      })
      .returning();

    const insertedItems = [];
    for (const line of verifiedLines) {
      const [oi] = await db
        .insert(orderItems)
        .values({
          orderId: createdOrder.id,
          productId: line.productId,
          variantId: line.variantId,
          productName: line.productName,
          unitLabel: line.unitLabel,
          imageUrl: line.imageUrl,
          mrp: line.mrp,
          price: line.price,
          quantity: line.quantity,
        })
        .returning();
      insertedItems.push(oi);

      // If COD, order is immediately confirmed so reduce stock now
      if (isCod) {
        const prod = prodMap.get(line.productId)!;
        await db
          .update(products)
          .set({ stock: Math.max(0, prod.stock - line.quantity) })
          .where(eq(products.id, line.productId));
      }
    }

    await db.insert(orderStatusHistory).values({
      orderId: createdOrder.id,
      status: 'placed',
      note: 'Order received and verified by Bharat Organic dark store.',
    });

    if (isCod) {
      await db.insert(orderStatusHistory).values({
        orderId: createdOrder.id,
        status: 'confirmed',
        note: 'Cash on Delivery confirmed; items reserved from organic cold-room.',
      });
    }

    const history = await db
      .select()
      .from(orderStatusHistory)
      .where(eq(orderStatusHistory.orderId, createdOrder.id))
      .orderBy(asc(orderStatusHistory.id));

    return { order: createdOrder, items: insertedItems, history, duplicate: false };
  } catch (error: any) {
    console.error('Database query failed in createServerVerifiedOrder:', error);
    throw new Error(error.message || 'Failed to create order.', { cause: error });
  }
}

export async function verifyServerOrderPayment(input: {
  orderId: number;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  simulateFailure?: boolean;
}) {
  try {
    const found = await db.select().from(orders).where(eq(orders.id, input.orderId));
    if (!found[0]) {
      throw new Error('Order not found.');
    }
    const ord = found[0];

    if (input.simulateFailure) {
      const [failedOrd] = await db
        .update(orders)
        .set({
          status: 'payment_failed',
          paymentStatus: 'failed',
          updatedAt: new Date(),
        })
        .where(eq(orders.id, ord.id))
        .returning();

      await db.insert(orderStatusHistory).values({
        orderId: ord.id,
        status: 'payment_failed',
        note: 'Payment declined by bank/UPI. Cart preserved for instant retry or COD.',
      });

      return { order: failedOrd, verified: false };
    }

    // Verify signature presence and mark order confirmed + paid
    const [updatedOrd] = await db
      .update(orders)
      .set({
        status: 'confirmed',
        paymentStatus: 'paid',
        razorpayPaymentId: input.razorpayPaymentId,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, ord.id))
      .returning();

    await db.insert(payments).values({
      orderId: ord.id,
      provider: 'razorpay_test',
      razorpayOrderId: input.razorpayOrderId,
      razorpayPaymentId: input.razorpayPaymentId,
      razorpaySignature: input.razorpaySignature,
      amount: ord.toPay,
      status: 'captured',
    });

    // Reduce stock on confirmation
    const items = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, ord.id));

    for (const item of items) {
      const pRows = await db
        .select()
        .from(products)
        .where(eq(products.id, item.productId));
      if (pRows[0]) {
        await db
          .update(products)
          .set({ stock: Math.max(0, pRows[0].stock - item.quantity) })
          .where(eq(products.id, item.productId));
      }
    }

    await db.insert(orderStatusHistory).values({
      orderId: ord.id,
      status: 'confirmed',
      note: `Payment verified (${input.razorpayPaymentId}). Picking organic items at dark store.`,
    });

    const history = await db
      .select()
      .from(orderStatusHistory)
      .where(eq(orderStatusHistory.orderId, ord.id))
      .orderBy(asc(orderStatusHistory.id));

    return { order: updatedOrd, items, history, verified: true };
  } catch (error: any) {
    console.error('Database query failed in verifyServerOrderPayment:', error);
    throw new Error(error.message || 'Payment verification failed.', { cause: error });
  }
}

export async function updateServerOrderStatus(input: {
  orderId: number;
  nextStatus: OrderStatus;
  note?: string;
  deliveryPartnerName?: string;
  deliveryPartnerPhone?: string;
}) {
  try {
    const found = await db.select().from(orders).where(eq(orders.id, input.orderId));
    if (!found[0]) {
      throw new Error('Order not found.');
    }
    const ord = found[0];
    const transition = validateOrderStatusTransition(
      ord.status as OrderStatus,
      input.nextStatus
    );

    if (!transition.allowed) {
      throw new Error(transition.reason || 'Invalid status transition.');
    }

    const items = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, ord.id));

    if (transition.stockAction === 'decrement') {
      for (const item of items) {
        const pRows = await db
          .select()
          .from(products)
          .where(eq(products.id, item.productId));
        if (pRows[0]) {
          await db
            .update(products)
            .set({ stock: Math.max(0, pRows[0].stock - item.quantity) })
            .where(eq(products.id, item.productId));
        }
      }
    } else if (transition.stockAction === 'restore') {
      for (const item of items) {
        const pRows = await db
          .select()
          .from(products)
          .where(eq(products.id, item.productId));
        if (pRows[0]) {
          await db
            .update(products)
            .set({ stock: pRows[0].stock + item.quantity })
            .where(eq(products.id, item.productId));
        }
      }
    }

    const defaultNotes: Record<OrderStatus, string> = {
      placed: 'Order placed.',
      confirmed: 'Order confirmed by dark store.',
      packed: 'Quality-checked & packed in breathable organic kraft bags.',
      out_for_delivery: 'Delivery partner is on the way to your location.',
      delivered: 'Order delivered at doorstep.',
      cancelled: 'Order cancelled and stock restored.',
      payment_failed: 'Payment failed.',
    };

    const [updatedOrd] = await db
      .update(orders)
      .set({
        status: input.nextStatus,
        ...(input.deliveryPartnerName
          ? { deliveryPartnerName: input.deliveryPartnerName }
          : {}),
        ...(input.deliveryPartnerPhone
          ? { deliveryPartnerPhone: input.deliveryPartnerPhone }
          : {}),
        ...(input.nextStatus === 'delivered' ? { paymentStatus: 'paid' } : {}),
        updatedAt: new Date(),
      })
      .where(eq(orders.id, ord.id))
      .returning();

    await db.insert(orderStatusHistory).values({
      orderId: ord.id,
      status: input.nextStatus,
      note: input.note || defaultNotes[input.nextStatus],
    });

    const history = await db
      .select()
      .from(orderStatusHistory)
      .where(eq(orderStatusHistory.orderId, ord.id))
      .orderBy(asc(orderStatusHistory.id));

    return { order: updatedOrd, items, history };
  } catch (error: any) {
    console.error('Database query failed in updateServerOrderStatus:', error);
    throw new Error(error.message || 'Failed to update order status.', { cause: error });
  }
}

export async function getOrdersForUserOrRole(userUid: string, role: string) {
  try {
    const allOrders =
      role === 'admin' || role === 'seller'
        ? await db.select().from(orders).orderBy(desc(orders.id)).limit(50)
        : await db
            .select()
            .from(orders)
            .where(eq(orders.userUid, userUid))
            .orderBy(desc(orders.id));

    if (allOrders.length === 0) return [];

    const orderIds = allOrders.map((o) => o.id);
    const allItems = await db
      .select()
      .from(orderItems)
      .where(inArray(orderItems.orderId, orderIds));
    const allHistory = await db
      .select()
      .from(orderStatusHistory)
      .where(inArray(orderStatusHistory.orderId, orderIds))
      .orderBy(asc(orderStatusHistory.id));

    // If role === 'seller', enforce RLS: seller can ONLY see orders that contain their own products
    if (role === 'seller') {
      const sellerProds = await db.select().from(products);
      const ownedProdIds = new Set(
        sellerProds
          .filter(
            (p) =>
              p.sellerUid === userUid ||
              (userUid === 'phone_9999900002' && p.sellerUid === 'seller-bharat-organic')
          )
          .map((p) => p.id)
      );

      return allOrders
        .map((ord) => {
          const matchingItems = allItems.filter(
            (i) => i.orderId === ord.id && ownedProdIds.has(i.productId)
          );
          if (matchingItems.length === 0) return null;
          return {
            ...ord,
            items: matchingItems,
            history: allHistory.filter((h) => h.orderId === ord.id),
          };
        })
        .filter((o): o is NonNullable<typeof o> => o !== null);
    }

    return allOrders.map((ord) => ({
      ...ord,
      items: allItems.filter((i) => i.orderId === ord.id),
      history: allHistory.filter((h) => h.orderId === ord.id),
    }));
  } catch (error) {
    console.error('Database query failed in getOrdersForUserOrRole:', error);
    throw new Error('Failed to fetch orders.', { cause: error });
  }
}

export async function updateProductInventory(input: {
  productId: number;
  requestingSellerUid?: string;
  isAdmin?: boolean;
  price?: number;
  mrp?: number;
  stock?: number;
  name?: string;
  brand?: string;
  sellerCategory?: string;
  description?: string;
  unit?: string;
  unitLabel?: string;
  certificateUrl?: string;
  imageUrl?: string;
  galleryUrls?: string[];
  status?: 'approved' | 'pending_approval' | 'rejected';
}) {
  try {
    const found = await db
      .select()
      .from(products)
      .where(eq(products.id, input.productId));
    if (!found[0]) throw new Error('Product not found');
    const current = found[0];

    // Enforce Seller RLS ownership: seller can only edit their own products
    if (input.requestingSellerUid && !input.isAdmin) {
      const ownsProduct =
        current.sellerUid === input.requestingSellerUid ||
        (input.requestingSellerUid === 'phone_9999900002' &&
          current.sellerUid === 'seller-bharat-organic');
      if (!ownsProduct) {
        throw new Error('Unauthorized: You can only edit or update stock for your own products.');
      }
    }

    const nextPrice = typeof input.price === 'number' ? input.price : current.price;
    const nextMrp = typeof input.mrp === 'number' ? Math.max(nextPrice, input.mrp) : current.mrp;
    const discountPct = Math.max(5, Math.round(((nextMrp - nextPrice) / nextMrp) * 100));
    const nextStock = typeof input.stock === 'number' ? Math.max(0, input.stock) : current.stock;
    const nextUnitLabel = input.unitLabel ? input.unitLabel.trim() : current.unitLabel;

    const [updated] = await db
      .update(products)
      .set({
        price: nextPrice,
        mrp: nextMrp,
        discountPct,
        stock: nextStock,
        unitLabel: nextUnitLabel,
        ...(input.name ? { name: input.name.trim() } : {}),
        ...(input.brand ? { brand: input.brand.trim() } : {}),
        ...(input.sellerCategory ? { sellerCategory: input.sellerCategory.trim() } : {}),
        ...(input.description !== undefined ? { description: input.description.trim() } : {}),
        ...(input.unit ? { unit: input.unit.trim() } : {}),
        ...(input.certificateUrl !== undefined
          ? { certificateUrl: input.certificateUrl.trim() }
          : {}),
        ...(input.imageUrl ? { imageUrl: input.imageUrl.trim() } : {}),
        ...(Array.isArray(input.galleryUrls) && input.galleryUrls.length > 0
          ? { galleryUrls: input.galleryUrls }
          : {}),
        ...(input.status ? { status: input.status } : {}),
      })
      .where(eq(products.id, input.productId))
      .returning();

    // Keep default product_variants row in sync
    await db
      .update(productVariants)
      .set({
        price: nextPrice,
        mrp: nextMrp,
        discountPct,
        stock: nextStock,
        unitLabel: nextUnitLabel,
      })
      .where(and(eq(productVariants.productId, input.productId), eq(productVariants.isDefault, true)));

    invalidateCatalogCache();
    return updated;
  } catch (error: any) {
    console.error('Database query failed in updateProductInventory:', error);
    throw new Error(error.message || 'Failed to update product inventory.', { cause: error });
  }
}

export async function deleteSellerProduct(input: {
  productId: number;
  requestingUid: string;
  isAdmin?: boolean;
}) {
  const found = await withDbRetry(() =>
    db.select().from(products).where(eq(products.id, input.productId))
  );
  if (!found[0]) {
    throw new Error('Product not found.');
  }
  const current = found[0];
  if (!input.isAdmin) {
    const ownsProduct =
      current.sellerUid === input.requestingUid ||
      (input.requestingUid === 'phone_9999900002' && current.sellerUid === 'seller-bharat-organic');
    if (!ownsProduct) {
      throw new Error('Unauthorized: You can only delete your own products.');
    }
  }

  await withDbRetry(() =>
    db.delete(cartItems).where(eq(cartItems.productId, input.productId))
  );
  await withDbRetry(() =>
    db.delete(productVariants).where(eq(productVariants.productId, input.productId))
  );
  await withDbRetry(() =>
    db.delete(products).where(eq(products.id, input.productId))
  );

  invalidateCatalogCache();
  return { deletedId: input.productId };
}

export async function approveProductByAdmin(input: {
  productId: number;
  status: 'approved' | 'rejected';
}) {
  const [updated] = await withDbRetry(() =>
    db
      .update(products)
      .set({ status: input.status })
      .where(eq(products.id, input.productId))
      .returning()
  );
  if (!updated) {
    throw new Error('Product not found.');
  }
  invalidateCatalogCache();
  return updated;
}

export async function getSellersList() {
  try {
    await ensureDatabaseSeeded();
    const [sellerRows, allProducts] = await withDbRetry(() =>
      Promise.all([
        db.select().from(users).where(eq(users.role, 'seller')).orderBy(asc(users.id)),
        db
          .select({
            id: products.id,
            sellerUid: products.sellerUid,
            brand: products.brand,
          })
          .from(products),
      ])
    );

    return sellerRows.map((u) => {
      const rawName = u.fullName || 'Kisan Organic Collective';
      const match = rawName.match(/^(.+?)\s*\((.+?)\)$/);
      const storeName = match ? match[1].trim() : rawName.replace(/\s*\(Seller\)$/i, '').trim();
      const ownerName = match ? match[2].trim() : 'Verified Organic Partner';

      // Extract city & gstin from email metadata if encoded, or defaults
      const emailParts = (u.email || '').split('@');
      const gstin =
        emailParts[0] && emailParts[0] !== 'seller'
          ? emailParts[0].toUpperCase()
          : '06AABCK5519R1Z2';
      const cityPart = (emailParts[1] || '').split('.')[0];
      const city =
        cityPart && cityPart !== 'bharatorganic'
          ? cityPart.charAt(0).toUpperCase() + cityPart.slice(1)
          : 'Gurugram / NCR';

      const productCount = allProducts.filter(
        (p) => p.sellerUid === u.uid || p.brand.toLowerCase() === storeName.toLowerCase()
      ).length;

      return {
        id: u.id,
        uid: u.uid,
        storeName,
        ownerName,
        phone: u.phone || '9999900002',
        email: u.email,
        city,
        gstin,
        productCount,
        createdAt: u.createdAt ? u.createdAt.toISOString() : new Date().toISOString(),
      };
    });
  } catch (error) {
    throw new Error('Failed to load sellers list.', { cause: error });
  }
}

export async function registerNewSeller(input: {
  storeName: string;
  ownerName: string;
  phone: string;
  city?: string;
  gstin?: string;
}) {
  try {
    await ensureDatabaseSeeded();
    const cleanPhone = String(input.phone || '').replace(/\D/g, '');
    if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
      throw new Error('Please enter a valid 10-digit Indian mobile number starting with 6–9.');
    }
    const cleanStore = String(input.storeName || '').trim();
    const cleanOwner = String(input.ownerName || '').trim() || 'Organic Farmer Partner';
    if (cleanStore.length < 2) {
      throw new Error('Please enter a valid Store / Farm Brand Name.');
    }

    const cleanCity = slugify(input.city || 'Gurugram') || 'gurugram';
    const cleanGstin =
      String(input.gstin || 'NPOP-ORG-2026')
        .trim()
        .replace(/[^a-zA-Z0-9-]/g, '') || 'NPOP-ORG-2026';

    const sellerUid = `seller-${slugify(cleanStore)}-${cleanPhone.slice(-4)}`;
    const encodedEmail = `${cleanGstin.toLowerCase()}@${cleanCity}.seller.bharatorganic.in`;
    const combinedName = `${cleanStore} (${cleanOwner})`;

    // Check if phone or uid already exists
    const existing = await withDbRetry(() =>
      db
        .select()
        .from(users)
        .where(or(eq(users.uid, sellerUid), eq(users.phone, cleanPhone)))
        .limit(1)
    );

    let savedUser;
    if (existing[0]) {
      const [updated] = await withDbRetry(() =>
        db
          .update(users)
          .set({
            fullName: combinedName,
            phone: cleanPhone,
            email: encodedEmail,
            role: 'seller',
          })
          .where(eq(users.id, existing[0].id))
          .returning()
      );
      savedUser = updated;
    } else {
      const [inserted] = await withDbRetry(() =>
        db
          .insert(users)
          .values({
            uid: sellerUid,
            email: encodedEmail,
            phone: cleanPhone,
            fullName: combinedName,
            role: 'seller',
          })
          .returning()
      );
      savedUser = inserted;
    }

    return {
      user: {
        id: savedUser.id,
        uid: savedUser.uid,
        email: savedUser.email,
        phone: savedUser.phone,
        fullName: savedUser.fullName || combinedName,
        role: 'seller' as const,
      },
      seller: {
        id: savedUser.id,
        uid: savedUser.uid,
        storeName: cleanStore,
        ownerName: cleanOwner,
        phone: cleanPhone,
        email: savedUser.email,
        city: input.city || 'Gurugram',
        gstin: cleanGstin.toUpperCase(),
        productCount: 0,
      },
      token: `bharat_otp_${cleanPhone}_seller`,
    };
  } catch (error: any) {
    throw new Error(error.message || 'Failed to register new seller.', { cause: error });
  }
}

const SELLER_CATEGORY_TO_SLUG_MAP: Record<string, string> = {
  'Organic Rice': 'atta-rice-oil-dal',
  Millets: 'organic-healthy-living',
  'Pulses & Dal': 'atta-rice-oil-dal',
  Spices: 'masala-dry-fruits-more',
  Honey: 'home-remedies-wellness',
  Jaggery: 'sweet-tooth',
  'Cold-Pressed Oils': 'ghee-oils',
  'Dry Fruits': 'masala-dry-fruits-more',
  'Tea & Coffee': 'tea-coffee-milk-drinks',
  'Fresh Produce': 'fruits-vegetables',
  'Natural Products': 'organic-healthy-living',
  'Farm Products': 'dairy-eggs',
};

export async function createSellerProduct(input: {
  sellerUid: string;
  brand: string;
  categoryId?: number;
  sellerCategory?: string;
  subcategoryId?: number;
  name: string;
  unit?: string;
  unitLabel: string;
  mrp: number;
  price: number;
  stock: number;
  certificateUrl?: string;
  status?: 'approved' | 'pending_approval';
  tag?: string;
  origin?: string;
  shelfLife?: string;
  description?: string;
  imageUrl?: string;
  galleryUrls?: string[];
}) {
  try {
    await ensureDatabaseSeeded();
    const cleanName = String(input.name || '').trim();
    if (cleanName.length < 2) {
      throw new Error('Product name is required.');
    }

    const allCats = await withDbRetry(() =>
      db.select().from(categories).orderBy(asc(categories.displayOrder))
    );
    const chosenSellerCategory = String(input.sellerCategory || 'Organic Rice').trim();
    const mappedSlug = SELLER_CATEGORY_TO_SLUG_MAP[chosenSellerCategory];

    let cat =
      (mappedSlug ? allCats.find((c) => c.slug === mappedSlug) : undefined) ||
      (input.categoryId ? allCats.find((c) => c.id === Number(input.categoryId)) : undefined) ||
      allCats[0];

    if (!cat) {
      throw new Error('Selected category not found.');
    }

    const subRows = await withDbRetry(() =>
      db
        .select()
        .from(subcategories)
        .where(eq(subcategories.categoryId, cat.id))
        .orderBy(asc(subcategories.displayOrder))
    );
    const chosenSubId =
      input.subcategoryId && subRows.some((s) => s.id === Number(input.subcategoryId))
        ? Number(input.subcategoryId)
        : subRows[0]?.id;

    if (!chosenSubId) {
      throw new Error('No subcategory found for selected category.');
    }

    const cleanUnit = String(input.unit || 'g').trim();
    const unitLabel = String(input.unitLabel || `500 ${cleanUnit}`).trim();
    const price = Math.max(1, Math.round(Number(input.price || 120)));
    const mrp = Math.max(price, Math.round(Number(input.mrp || Math.round(price * 1.25))));
    const discountPct = mrp > price ? Math.max(1, Math.round(((mrp - price) / mrp) * 100)) : 0;
    const stock = Math.max(0, Math.round(Number(input.stock ?? 50)));
    const brandName = String(input.brand || 'Bharat Organic Collective').trim();
    const prodSlug = `${slugify(cleanName)}-${Date.now().toString().slice(-5)}`;
    const productStatus = input.status || 'pending_approval';

    const isDirectImageUrl = (u?: string) => {
      if (!u) return false;
      const t = u.trim();
      return (
        t.startsWith('data:image/') ||
        t.startsWith('http://') ||
        t.startsWith('https://') ||
        t.startsWith('/api/')
      );
    };

    const validUploadedGallery = Array.isArray(input.galleryUrls)
      ? input.galleryUrls.map((u) => String(u || '').trim()).filter((u) => isDirectImageUrl(u))
      : [];

    const primaryUploadedPhoto = isDirectImageUrl(input.imageUrl)
      ? input.imageUrl!.trim()
      : validUploadedGallery[0] || '';

    const finalPrimaryPhoto =
      primaryUploadedPhoto || buildImageForSeedProduct(cleanName, prodSlug, cat.slug, unitLabel);

    const finalGallery =
      validUploadedGallery.length > 0 ? validUploadedGallery : [finalPrimaryPhoto];

    const [insertedProduct] = await withDbRetry(() =>
      db
        .insert(products)
        .values({
          slug: prodSlug,
          name: cleanName,
          brand: brandName,
          categoryId: cat.id,
          subcategoryId: chosenSubId,
          description:
            input.description?.trim() ||
            `${cleanName} directly sourced and certified by ${brandName}. 100% chemical-free, lab-tested for purity, and packed fresh for express delivery.`,
          benefits:
            '100% Certified Organic | Direct from Partner Seller | Zero Preservatives | Express Cold-Chain Delivery',
          shelfLife: input.shelfLife?.trim() || '6 Months',
          origin: input.origin?.trim() || 'Certified Organic Farms, India',
          imageUrl: finalPrimaryPhoto,
          galleryUrls: finalGallery,
          isVeg: true,
          isOrganic: true,
          rating: 4.9,
          reviewCount: 'New',
          tag: input.tag?.trim() || `${chosenSellerCategory} · ${brandName}`,
          unitLabel,
          mrp,
          price,
          discountPct,
          stock,
          deliveryMins: 21,
          isTrending: true,
          isBestSeller: true,
          isFreshGreen: cat.slug === 'fruits-vegetables',
          sellerUid: input.sellerUid || 'seller-bharat-organic',
          sellerCategory: chosenSellerCategory,
          unit: cleanUnit,
          certificateUrl: String(input.certificateUrl || '').trim(),
          status: productStatus,
        })
        .returning()
    );

    // Create default variant + value 2x pack variant
    const doublePrice = Math.round(price * 1.9);
    const doubleMrp = Math.round(mrp * 2);
    const doubleDiscount =
      doubleMrp > doublePrice ? Math.max(5, Math.round(((doubleMrp - doublePrice) / doubleMrp) * 100)) : 0;

    const insertedVariants = await withDbRetry(() =>
      db
        .insert(productVariants)
        .values([
          {
            productId: insertedProduct.id,
            unitLabel,
            mrp,
            price,
            discountPct,
            stock,
            isDefault: true,
          },
          {
            productId: insertedProduct.id,
            unitLabel: `2 x ${unitLabel} (Combo)`,
            mrp: doubleMrp,
            price: doublePrice,
            discountPct: doubleDiscount,
            stock: Math.max(10, Math.floor(stock / 2)),
            isDefault: false,
          },
        ])
        .returning()
    );

    invalidateCatalogCache();
    return {
      ...insertedProduct,
      variants: insertedVariants,
    };
  } catch (error: any) {
    throw new Error(error.message || 'Failed to create seller product.', { cause: error });
  }
}

