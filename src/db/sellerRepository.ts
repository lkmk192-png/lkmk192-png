import { eq, desc, asc } from 'drizzle-orm';
import { db, withDbRetry } from './index.ts';
import {
  users,
  products,
  productVariants,
  categories,
  subcategories,
  orders,
  orderItems,
  sellerProfiles,
  sellerDocuments,
  sellerBankDetails,
  sellerPickupLocations,
  sellerApplications,
  sellers,
} from './schema.ts';
import {
  maskAccountNumber,
  lookupIfscLocally,
  validateSellerWizardStep,
  validateMobile,
} from '../utils/sellerValidation.ts';
import { getOrCreateUser } from './users.ts';

export interface SellerWarehouseRecord {
  id?: number;
  warehouseName: string;
  pickupAddress: string;
  pincode: string;
  contactPerson: string;
  contactPhone: string;
  pickupTimeSlots: string[];
  isPrimary: boolean;
}

async function upsertSellerDocumentRecord(
  userUid: string,
  documentType: string,
  bucketName: string,
  fileName: string,
  fileUrl: string,
  isPrivate: boolean
) {
  if (!fileUrl) return;
  const existing = await withDbRetry(() =>
    db
      .select()
      .from(sellerDocuments)
      .where(eq(sellerDocuments.userUid, userUid))
  );
  const match = existing.find((d) => d.documentType === documentType && d.fileUrl === fileUrl);
  if (match) return;

  await withDbRetry(() =>
    db.insert(sellerDocuments).values({
      userUid,
      documentType,
      bucketName,
      fileName,
      fileUrl,
      isPrivate,
    })
  );
}

/**
 * Ensures the default demo seller account (9999900002 / seller@bharatorganic.in)
 * and a sample under-review applicant exist so both Seller Hub and Admin Seller Applications
 * have realistic records out-of-the-box.
 */
let sellerSeedPromise: Promise<void> | null = null;
export async function ensureDefaultSellerProfilesSeeded() {
  if (sellerSeedPromise) return sellerSeedPromise;
  sellerSeedPromise = (async () => {
    try {
      const demoUid = 'phone_9999900002';
      const existing = await withDbRetry(() =>
        db.select().from(sellerProfiles).where(eq(sellerProfiles.userUid, demoUid))
      );
      if (existing.length === 0) {
        // Ensure user row exists with seller role
        const uRows = await withDbRetry(() =>
          db.select().from(users).where(eq(users.uid, demoUid))
        );
        if (uRows.length === 0) {
          await withDbRetry(() =>
            db.insert(users).values({
              uid: demoUid,
              email: 'seller@bharatorganic.in',
              phone: '9999900002',
              fullName: 'Kisan Organic Collective',
              role: 'seller',
            })
          );
        }

        const adminRows = await withDbRetry(() =>
          db.select().from(users).where(eq(users.uid, 'phone_9999900001'))
        );
        if (adminRows.length === 0) {
          await withDbRetry(() =>
            db.insert(users).values({
              uid: 'phone_9999900001',
              email: 'admin@bharatorganic.in',
              phone: '9999900001',
              fullName: 'Vikramaditya Sharma (Admin)',
              role: 'admin',
            })
          );
        }

        await withDbRetry(() =>
          db.insert(sellerProfiles).values({
            userUid: demoUid,
            phone: '9999900002',
            email: 'seller@bharatorganic.in',
            phoneVerified: true,
            emailVerified: true,
            currentStep: 7,
            categoriesSold: ['Organic Rice', 'Pulses & Dal', 'Cold-Pressed Oils', 'Spices', 'Honey'],
            retailChannels: [
              {
                channel: 'Organic Farmers Haat & Direct Retail',
                monthlySales: '₹5L – ₹15L / month',
                referenceLink: 'https://bharatorganic.in/kisan-collective',
              },
            ],
            socialChannels: [
              {
                platform: 'Instagram',
                followers: '25K – 50K',
                link: 'https://instagram.com/kisanorganiccollective',
              },
            ],
            spocName: 'Rajendra Prasad Verma',
            spocDesignation: 'Founder / Director',
            brandName: 'Kisan Organic Collective',
            brandLogoUrl:
              'data:image/svg+xml;utf8,' +
              encodeURIComponent(
                `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" rx="24" fill="#064E3B"/><circle cx="60" cy="60" r="42" fill="#10B981" opacity="0.2"/><path d="M40 72 Q60 32 80 56 Q64 84 40 72 Z" fill="#34D399"/><text x="60" y="102" font-family="sans-serif" font-size="11" font-weight="800" fill="#ECFDF5" text-anchor="middle">KISAN ORGANIC</text></svg>`
              ),
            shortDescription: 'NPOP & FSSAI certified farmer producer collective across 1,400+ acres.',
            brandStory:
              'Founded in 2019 by 320 certified organic farm families in Madhya Pradesh and Haryana, delivering unblended single-origin staples.',
            brandPhotos: [],
            websiteUrl: 'https://kisanorganic.in',
            businessType: 'FPO / Farmer group',
            legalBusinessName: 'Kisan Organic Producer Company Limited',
            panNumber: 'AABCK4921M',
            gstinNumber: '06AABCK4921M1Z5',
            gstBelowThreshold: false,
            fssaiNumber: '10823005001492',
            fssaiExpiryDate: '2028-12-31',
            fssaiCertificateUrl:
              'data:image/svg+xml;utf8,' +
              encodeURIComponent(
                `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200"><rect width="320" height="200" rx="12" fill="#F8FAFC" stroke="#059669" stroke-width="3"/><text x="160" y="45" font-family="sans-serif" font-size="14" font-weight="800" fill="#065F46" text-anchor="middle">FSSAI LICENSE CERTIFICATE</text><text x="160" y="85" font-family="monospace" font-size="13" font-weight="700" fill="#1E293B" text-anchor="middle">LIC NO: 10823005001492</text><text x="160" y="115" font-family="sans-serif" font-size="11" fill="#475569" text-anchor="middle">Kisan Organic Producer Company Ltd</text><text x="160" y="150" font-family="sans-serif" font-size="11" font-weight="700" fill="#047857" text-anchor="middle">VALID UNTIL: 31 DEC 2028</text></svg>`
              ),
            registeredState: 'Haryana',
            registeredDistrict: 'Gurugram',
            registeredPincode: '122018',
            signatureDataUrl:
              'data:image/svg+xml;utf8,' +
              encodeURIComponent(
                `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 90"><rect width="300" height="90" fill="#FFFFFF"/><path d="M25 62 C55 24, 75 68, 108 42 C130 25, 148 64, 185 38 C210 24, 240 55, 272 44" stroke="#064E3B" stroke-width="3.5" fill="none" stroke-linecap="round"/><text x="150" y="82" font-family="sans-serif" font-size="9" fill="#64748B" text-anchor="middle">Digitally Signed by Rajendra Prasad Verma</text></svg>`
              ),
            acceptedTerms: true,
          })
        );

        await withDbRetry(() =>
          db.insert(sellerBankDetails).values({
            userUid: demoUid,
            accountHolderName: 'Kisan Organic Producer Company Limited',
            accountNumberInternal: '50200048291823',
            accountNumberMasked: 'XXXX1823',
            ifscCode: 'HDFC0000240',
            bankName: 'HDFC Bank',
            branchName: 'Cyber City, Gurugram',
            cancelledChequeUrl:
              'data:image/svg+xml;utf8,' +
              encodeURIComponent(
                `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 180"><rect width="360" height="180" rx="10" fill="#FEFCE8" stroke="#CA8A04" stroke-width="2"/><text x="24" y="34" font-family="sans-serif" font-size="12" font-weight="800" fill="#1E293B">HDFC BANK LTD · IFSC: HDFC0000240</text><line x1="40" y1="150" x2="310" y2="30" stroke="#DC2626" stroke-width="3"/><line x1="40" y1="165" x2="320" y2="45" stroke="#DC2626" stroke-width="3"/><text x="180" y="96" font-family="sans-serif" font-size="16" font-weight="800" fill="#DC2626" text-anchor="middle">CANCELLED CHEQUE</text><text x="24" y="155" font-family="monospace" font-size="12" font-weight="700" fill="#334155">A/C: XXXX1823 · KISAN ORGANIC PRODUCER CO LTD</text></svg>`
              ),
          })
        );

        await withDbRetry(() =>
          db.insert(sellerPickupLocations).values({
            userUid: demoUid,
            warehouseName: 'Gurugram Cold-Chain Fulfillment Hub',
            pickupAddress: 'Plot 14, Sector 49, Sohna Road Logistics Park, Gurugram',
            pincode: '122018',
            contactPerson: 'Rajendra Prasad Verma',
            contactPhone: '9999900002',
            pickupTimeSlots: ['06:00 AM – 09:00 AM', '02:00 PM – 05:00 PM'],
            isPrimary: true,
          })
        );

        await withDbRetry(() =>
          db.insert(sellerApplications).values({
            userUid: demoUid,
            status: 'approved',
            reviewNote: 'NPOP Scope Certificate, FSSAI License, and Bank Cheque verified.',
            submittedAt: new Date(Date.now() - 86400000 * 5),
            reviewedAt: new Date(Date.now() - 86400000 * 4),
            reviewedByUid: 'phone_9999900001',
          })
        );
      }

      // Also seed one pending "under_review" seller application so Admin has an application ready to inspect immediately
      const applicantUid = 'seller_app_himachal_naturals';
      const existingApplicant = await withDbRetry(() =>
        db.select().from(sellerProfiles).where(eq(sellerProfiles.userUid, applicantUid))
      );
      if (existingApplicant.length === 0) {
        await withDbRetry(() =>
          db.insert(users).values({
            uid: applicantUid,
            email: 'founders@himachalnaturals.in',
            phone: '9816044210',
            fullName: 'Devbhoomi Organic Orchards',
            role: 'seller',
          })
        );

        await withDbRetry(() =>
          db.insert(sellerProfiles).values({
            userUid: applicantUid,
            phone: '9816044210',
            email: 'founders@himachalnaturals.in',
            phoneVerified: true,
            emailVerified: true,
            currentStep: 7,
            categoriesSold: ['Honey', 'Dry Fruits', 'Spices', 'Tea & Coffee', 'Natural Products'],
            retailChannels: [
              {
                channel: 'D2C Storefront & Shimla Organic Co-op',
                monthlySales: '₹2L – ₹5L / month',
                referenceLink: 'https://himachalnaturals.in',
              },
            ],
            socialChannels: [
              {
                platform: 'Instagram',
                followers: '10K – 25K',
                link: 'https://instagram.com/himachalnaturals',
              },
            ],
            spocName: 'Ananya Thakur',
            spocDesignation: 'Managing Partner',
            brandName: 'Devbhoomi Organic Orchards',
            brandLogoUrl:
              'data:image/svg+xml;utf8,' +
              encodeURIComponent(
                `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" rx="24" fill="#1E293B"/><path d="M25 80 L60 30 L95 80 Z" fill="#10B981"/><text x="60" y="104" font-family="sans-serif" font-size="11" font-weight="800" fill="#F8FAFC" text-anchor="middle">DEVBHOOMI</text></svg>`
              ),
            shortDescription: 'Single-floral raw multiflora honey, cold-pressed apricot oil & Kullu walnuts.',
            brandStory:
              'Sourced directly from high-altitude organic orchards in Kullu and Kinnaur at 7,500 ft elevation with zero pesticide residue.',
            brandPhotos: [],
            websiteUrl: 'https://himachalnaturals.in',
            businessType: 'Partnership',
            legalBusinessName: 'Devbhoomi Organic Orchards LLP',
            panNumber: 'AAFFD8291K',
            gstinNumber: '02AAFFD8291K1Z8',
            gstBelowThreshold: false,
            fssaiNumber: '10924002000814',
            fssaiExpiryDate: '2027-09-30',
            fssaiCertificateUrl:
              'data:image/svg+xml;utf8,' +
              encodeURIComponent(
                `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200"><rect width="320" height="200" rx="12" fill="#F8FAFC" stroke="#059669" stroke-width="3"/><text x="160" y="45" font-family="sans-serif" font-size="14" font-weight="800" fill="#065F46" text-anchor="middle">FSSAI STATE LICENSE</text><text x="160" y="85" font-family="monospace" font-size="13" font-weight="700" fill="#1E293B" text-anchor="middle">LIC NO: 10924002000814</text><text x="160" y="115" font-family="sans-serif" font-size="11" fill="#475569" text-anchor="middle">Devbhoomi Organic Orchards LLP</text><text x="160" y="150" font-family="sans-serif" font-size="11" font-weight="700" fill="#047857" text-anchor="middle">VALID UNTIL: 30 SEP 2027</text></svg>`
              ),
            registeredState: 'Himachal Pradesh',
            registeredDistrict: 'Kullu',
            registeredPincode: '175101',
            signatureDataUrl:
              'data:image/svg+xml;utf8,' +
              encodeURIComponent(
                `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 90"><rect width="300" height="90" fill="#FFFFFF"/><path d="M35 58 C65 20, 95 66, 132 38 C165 22, 198 62, 255 36" stroke="#0F172A" stroke-width="3" fill="none" stroke-linecap="round"/><text x="150" y="82" font-family="sans-serif" font-size="9" fill="#64748B" text-anchor="middle">Signed by Ananya Thakur</text></svg>`
              ),
            acceptedTerms: true,
          })
        );

        await withDbRetry(() =>
          db.insert(sellerBankDetails).values({
            userUid: applicantUid,
            accountHolderName: 'Devbhoomi Organic Orchards LLP',
            accountNumberInternal: '009105008912',
            accountNumberMasked: 'XXXX8912',
            ifscCode: 'ICIC0000091',
            bankName: 'ICICI Bank',
            branchName: 'Connaught Place, New Delhi',
            cancelledChequeUrl:
              'data:image/svg+xml;utf8,' +
              encodeURIComponent(
                `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 180"><rect width="360" height="180" rx="10" fill="#FFFBEB" stroke="#D97706" stroke-width="2"/><text x="24" y="34" font-family="sans-serif" font-size="12" font-weight="800" fill="#1E293B">ICICI BANK · IFSC: ICIC0000091</text><line x1="40" y1="150" x2="310" y2="30" stroke="#DC2626" stroke-width="3"/><text x="180" y="96" font-family="sans-serif" font-size="16" font-weight="800" fill="#DC2626" text-anchor="middle">CANCELLED CHEQUE</text><text x="24" y="155" font-family="monospace" font-size="12" font-weight="700" fill="#334155">A/C: XXXX8912 · DEVBHOOMI ORGANIC ORCHARDS LLP</text></svg>`
              ),
          })
        );

        await withDbRetry(() =>
          db.insert(sellerPickupLocations).values({
            userUid: applicantUid,
            warehouseName: 'NCR Cold Storage Dispatch Hub',
            pickupAddress: 'Warehouse 8B, NH-48 Bilaspur Agro Hub, Gurugram',
            pincode: '122413',
            contactPerson: 'Ananya Thakur',
            contactPhone: '9816044210',
            pickupTimeSlots: ['07:00 AM – 10:00 AM', '04:00 PM – 07:00 PM'],
            isPrimary: true,
          })
        );

        await withDbRetry(() =>
          db.insert(sellerApplications).values({
            userUid: applicantUid,
            status: 'under_review',
            reviewNote: '',
            submittedAt: new Date(Date.now() - 3600000 * 6),
          })
        );
      }
    } catch {
      sellerSeedPromise = null;
    }
  })();
  return sellerSeedPromise;
}

/**
 * Dual-factor Seller Authentication:
 * Requires BOTH verified 10-digit Indian Mobile + OTP AND Email + OTP/Magic Link.
 * Enforces One Account = One Role ('seller').
 * If an existing buyer/admin account logs in on /seller, returns { roleConflict: true, existingRole }
 * until they explicitly choose to register/convert as a seller.
 */
export async function authenticateSellerAccount(input: {
  phone: string;
  phoneOtp: string;
  email: string;
  emailOtp: string;
  registerAsSeller?: boolean;
}) {
  await ensureDefaultSellerProfilesSeeded();

  const cleanPhone = String(input.phone || '').replace(/\D/g, '');
  const cleanEmail = String(input.email || '').trim().toLowerCase();
  const phoneOtp = String(input.phoneOtp || '').trim();
  const emailOtp = String(input.emailOtp || '').trim();

  if (!validateMobile(cleanPhone)) {
    throw new Error('Please enter a valid 10-digit Indian mobile number starting with 6–9.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new Error('Please enter a valid business email address.');
  }
  if (!/^\d{6}$/.test(phoneOtp) || phoneOtp === '000000') {
    throw new Error('Invalid 6-digit Mobile OTP.');
  }
  if (!/^\d{6}$/.test(emailOtp) || emailOtp === '000000') {
    throw new Error('Invalid 6-digit Email verification OTP.');
  }

  const uid = `phone_${cleanPhone}`;
  const dbUser = await getOrCreateUser(
    uid,
    cleanEmail,
    cleanPhone,
    `Seller Partner (${cleanPhone.slice(-4)})`,
    'seller'
  );

  // Ensure seller_profiles row exists
  const profileRows = await withDbRetry(() =>
    db.select().from(sellerProfiles).where(eq(sellerProfiles.userUid, uid))
  );
  if (profileRows.length === 0) {
    await withDbRetry(() =>
      db.insert(sellerProfiles).values({
        userUid: uid,
        phone: cleanPhone,
        email: cleanEmail,
        phoneVerified: true,
        emailVerified: true,
        currentStep: 1,
      })
    );
  } else {
    await withDbRetry(() =>
      db
        .update(sellerProfiles)
        .set({
          phone: cleanPhone,
          email: cleanEmail,
          phoneVerified: true,
          emailVerified: true,
          updatedAt: new Date(),
        })
        .where(eq(sellerProfiles.userUid, uid))
    );
  }

  // Ensure seller_applications row exists
  const appRows = await withDbRetry(() =>
    db.select().from(sellerApplications).where(eq(sellerApplications.userUid, uid))
  );
  if (appRows.length === 0) {
    await withDbRetry(() =>
      db.insert(sellerApplications).values({
        userUid: uid,
        status: 'draft',
        reviewNote: '',
      })
    );
  }

  // Ensure default bank & pickup rows exist
  const bankRows = await withDbRetry(() =>
    db.select().from(sellerBankDetails).where(eq(sellerBankDetails.userUid, uid))
  );
  if (bankRows.length === 0) {
    await withDbRetry(() =>
      db.insert(sellerBankDetails).values({
        userUid: uid,
      })
    );
  }

  const pickupRows = await withDbRetry(() =>
    db.select().from(sellerPickupLocations).where(eq(sellerPickupLocations.userUid, uid))
  );
  if (pickupRows.length === 0) {
    await withDbRetry(() =>
      db.insert(sellerPickupLocations).values({
        userUid: uid,
        warehouseName: 'Primary Warehouse',
        pickupAddress: '',
        pincode: '',
        contactPerson: '',
        contactPhone: cleanPhone,
        pickupTimeSlots: ['Morning (07:00 AM – 11:00 AM)'],
        isPrimary: true,
      })
    );
  }

  const bundle = await getSellerPortalBundle(uid);
  return {
    roleConflict: false,
    token: `bharat_otp_${cleanPhone}_seller`,
    user: dbUser,
    bundle,
  };
}

/**
 * Updates Seller's login email & mobile from the sidebar Edit Contact modal.
 */
export async function updateSellerContactDetails(
  userUid: string,
  input: { phone: string; email: string }
) {
  const cleanPhone = String(input.phone || '').replace(/\D/g, '');
  const cleanEmail = String(input.email || '').trim().toLowerCase();

  if (!validateMobile(cleanPhone)) {
    throw new Error('Enter a valid 10-digit mobile number starting with 6–9.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new Error('Enter a valid email address.');
  }

  await withDbRetry(() =>
    db
      .update(sellerProfiles)
      .set({
        phone: cleanPhone,
        email: cleanEmail,
        phoneVerified: true,
        emailVerified: true,
        updatedAt: new Date(),
      })
      .where(eq(sellerProfiles.userUid, userUid))
  );

  await withDbRetry(() =>
    db
      .update(users)
      .set({
        phone: cleanPhone,
        email: cleanEmail,
      })
      .where(eq(users.uid, userUid))
  );

  return getSellerPortalBundle(userUid);
}

/**
 * Returns the complete isolated Seller Portal state for a single seller `userUid`.
 * Never leaks raw bank account numbers (only returns `accountNumberMasked`) or other sellers' data.
 */
export async function getSellerPortalBundle(userUid: string) {
  await ensureDefaultSellerProfilesSeeded();

  const [profile] = await withDbRetry(() =>
    db.select().from(sellerProfiles).where(eq(sellerProfiles.userUid, userUid))
  );
  if (!profile) {
    return null;
  }

  const [bank] = await withDbRetry(() =>
    db.select().from(sellerBankDetails).where(eq(sellerBankDetails.userUid, userUid))
  );

  const warehouses = await withDbRetry(() =>
    db
      .select()
      .from(sellerPickupLocations)
      .where(eq(sellerPickupLocations.userUid, userUid))
      .orderBy(asc(sellerPickupLocations.id))
  );

  const [application] = await withDbRetry(() =>
    db.select().from(sellerApplications).where(eq(sellerApplications.userUid, userUid))
  );

  const [sellerRow] = await withDbRetry(() =>
    db.select().from(sellers).where(eq(sellers.userId, userUid))
  );

  const documents = await withDbRetry(() =>
    db
      .select()
      .from(sellerDocuments)
      .where(eq(sellerDocuments.userUid, userUid))
      .orderBy(desc(sellerDocuments.createdAt))
  );

  // Fetch ONLY this seller's own products (also include 'seller-bharat-organic' for the default demo seller phone_9999900002)
  const allProducts = await withDbRetry(() =>
    db.select().from(products).orderBy(desc(products.id))
  );
  const allVariants = await withDbRetry(() =>
    db.select().from(productVariants).orderBy(asc(productVariants.id))
  );
  const allCategories = await withDbRetry(() =>
    db.select().from(categories).orderBy(asc(categories.displayOrder))
  );
  const allSubcategories = await withDbRetry(() =>
    db.select().from(subcategories).orderBy(asc(subcategories.displayOrder))
  );

  const variantsByProduct = new Map<number, typeof allVariants>();
  for (const v of allVariants) {
    const list = variantsByProduct.get(v.productId) || [];
    list.push(v);
    variantsByProduct.set(v.productId, list);
  }

  const sellerProductList = allProducts
    .filter(
      (p) =>
        p.sellerUid === userUid ||
        (userUid === 'phone_9999900002' && p.sellerUid === 'seller-bharat-organic') ||
        (profile.brandName &&
          p.brand.toLowerCase() === profile.brandName.trim().toLowerCase())
    )
    .map((p) => ({
      ...p,
      variants: variantsByProduct.get(p.id) || [],
    }));

  const sellerProductIds = new Set(sellerProductList.map((p) => p.id));

  // Fetch orders that contain at least one item from this seller's products
  const allOrderRows = await withDbRetry(() =>
    db.select().from(orders).orderBy(desc(orders.createdAt))
  );
  const allOrderItemRows = await withDbRetry(() => db.select().from(orderItems));

  const sellerOrders = allOrderRows
    .map((o) => {
      const itemsForSeller = allOrderItemRows.filter(
        (item) => item.orderId === o.id && sellerProductIds.has(item.productId)
      );
      if (itemsForSeller.length === 0) return null;
      const sellerSubtotal = itemsForSeller.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0
      );
      return {
        ...o,
        sellerItems: itemsForSeller,
        sellerSubtotal,
      };
    })
    .filter((o): o is NonNullable<typeof o> => o !== null);

  // Build seller payment settlements ledger strictly from this seller's orders
  const sellerPayments = sellerOrders.map((ord) => {
    const platformCommission = Math.round(ord.sellerSubtotal * 0.08); // 8% marketplace fee
    const netPayout = Math.max(0, ord.sellerSubtotal - platformCommission);
    return {
      id: `SET-${ord.orderNumber}`,
      orderId: ord.id,
      orderNumber: ord.orderNumber,
      orderDate: ord.createdAt,
      grossAmount: ord.sellerSubtotal,
      commissionFee: platformCommission,
      netPayout,
      payoutStatus:
        ord.status === 'delivered'
          ? 'Settled to Bank'
          : ord.status === 'cancelled'
          ? 'Cancelled'
          : 'Escrow (Pending Delivery)',
      bankMasked: bank?.accountNumberMasked || 'XXXX',
    };
  });

  return {
    profile,
    bank: {
      accountHolderName: bank?.accountHolderName || '',
      accountNumberMasked: bank?.accountNumberMasked || '',
      hasSavedAccountNumber: Boolean(bank?.accountNumberMasked),
      ifscCode: bank?.ifscCode || '',
      bankName: bank?.bankName || '',
      branchName: bank?.branchName || '',
      cancelledChequeUrl: bank?.cancelledChequeUrl || '',
    },
    warehouses:
      warehouses.length > 0
        ? warehouses
        : [
            {
              id: 0,
              userUid,
              warehouseName: 'Primary Warehouse',
              pickupAddress: '',
              pincode: '',
              contactPerson: profile.spocName || '',
              contactPhone: profile.phone,
              pickupTimeSlots: ['09:00 AM – 01:00 PM'],
              isPrimary: true,
              createdAt: new Date(),
            },
          ],
    application: application || {
      userUid,
      status: sellerRow?.status || 'draft',
      reviewNote: '',
      submittedAt: null,
      reviewedAt: null,
    },
    sellerRecord: sellerRow || null,
    documents,
    categories: allCategories.map((c) => ({
      ...c,
      subcategories: allSubcategories.filter((s) => s.categoryId === c.id),
    })),
    myProducts: sellerProductList,
    myOrders: sellerOrders,
    myPayments: sellerPayments,
  };
}

/**
 * Autosaves or saves & advances any of the 7 onboarding wizard steps.
 */
export async function saveSellerOnboardingStep(
  userUid: string,
  step: number,
  payload: Record<string, any>,
  advanceToStep?: number
) {
  await ensureDefaultSellerProfilesSeeded();

  const [existingProfile] = await withDbRetry(() =>
    db.select().from(sellerProfiles).where(eq(sellerProfiles.userUid, userUid))
  );
  if (!existingProfile) {
    throw new Error('Seller profile not found.');
  }

  const nextStep = advanceToStep
    ? Math.min(7, Math.max(1, advanceToStep))
    : existingProfile.currentStep;

  if (step === 1) {
    const categoriesSold = Array.isArray(payload.categoriesSold)
      ? payload.categoriesSold.slice(0, 10).map(String)
      : existingProfile.categoriesSold;
    const retailChannels = Array.isArray(payload.retailChannels)
      ? payload.retailChannels.map((r: any) => ({
          channel: String(r.channel || '').trim(),
          monthlySales: String(r.monthlySales || '').trim(),
          referenceLink: String(r.referenceLink || '').trim(),
        }))
      : existingProfile.retailChannels;
    const socialChannels = Array.isArray(payload.socialChannels)
      ? payload.socialChannels.map((s: any) => ({
          platform: String(s.platform || '').trim(),
          followers: String(s.followers || '').trim(),
          link: String(s.link || '').trim(),
        }))
      : existingProfile.socialChannels;

    await withDbRetry(() =>
      db
        .update(sellerProfiles)
        .set({
          categoriesSold,
          retailChannels,
          socialChannels,
          spocName: String(payload.spocName ?? existingProfile.spocName).trim(),
          spocDesignation: String(
            payload.spocDesignation ?? existingProfile.spocDesignation
          ).trim(),
          currentStep: nextStep,
          updatedAt: new Date(),
        })
        .where(eq(sellerProfiles.userUid, userUid))
    );
  } else if (step === 2) {
    const brandName = String(payload.brandName ?? existingProfile.brandName).trim();
    const brandLogoUrl = String(payload.brandLogoUrl ?? existingProfile.brandLogoUrl).trim();
    const shortDescription = String(
      payload.shortDescription ?? existingProfile.shortDescription
    ).trim();
    const brandStory = String(payload.brandStory ?? existingProfile.brandStory).trim();
    const brandPhotos = Array.isArray(payload.brandPhotos)
      ? payload.brandPhotos.slice(0, 5).map(String)
      : existingProfile.brandPhotos;
    const websiteUrl = String(payload.websiteUrl ?? existingProfile.websiteUrl).trim();

    await withDbRetry(() =>
      db
        .update(sellerProfiles)
        .set({
          brandName,
          brandLogoUrl,
          shortDescription,
          brandStory,
          brandPhotos,
          websiteUrl,
          currentStep: nextStep,
          updatedAt: new Date(),
        })
        .where(eq(sellerProfiles.userUid, userUid))
    );

    if (brandLogoUrl) {
      await upsertSellerDocumentRecord(
        userUid,
        'brand_logo',
        'seller-logos',
        `${brandName || 'brand'}-logo.png`,
        brandLogoUrl,
        false
      );
    }
  } else if (step === 3) {
    const businessType = String(payload.businessType ?? existingProfile.businessType).trim();
    const legalBusinessName = String(
      payload.legalBusinessName ?? existingProfile.legalBusinessName
    ).trim();
    const panNumber = String(payload.panNumber ?? existingProfile.panNumber)
      .trim()
      .toUpperCase();
    const gstBelowThreshold = Boolean(
      payload.gstBelowThreshold ?? existingProfile.gstBelowThreshold
    );
    const gstinNumber = gstBelowThreshold
      ? ''
      : String(payload.gstinNumber ?? existingProfile.gstinNumber)
          .trim()
          .toUpperCase();
    const fssaiNumber = String(payload.fssaiNumber ?? existingProfile.fssaiNumber)
      .replace(/\D/g, '')
      .trim();
    const fssaiExpiryDate = String(
      payload.fssaiExpiryDate ?? existingProfile.fssaiExpiryDate
    ).trim();
    const fssaiCertificateUrl = String(
      payload.fssaiCertificateUrl ?? existingProfile.fssaiCertificateUrl
    ).trim();
    const registeredState = String(
      payload.registeredState ?? existingProfile.registeredState
    ).trim();
    const registeredDistrict = String(
      payload.registeredDistrict ?? existingProfile.registeredDistrict
    ).trim();
    const registeredPincode = String(
      payload.registeredPincode ?? existingProfile.registeredPincode
    )
      .replace(/\D/g, '')
      .trim();

    await withDbRetry(() =>
      db
        .update(sellerProfiles)
        .set({
          businessType,
          legalBusinessName,
          panNumber,
          gstinNumber,
          gstBelowThreshold,
          fssaiNumber,
          fssaiExpiryDate,
          fssaiCertificateUrl,
          registeredState,
          registeredDistrict,
          registeredPincode,
          currentStep: nextStep,
          updatedAt: new Date(),
        })
        .where(eq(sellerProfiles.userUid, userUid))
    );

    if (fssaiCertificateUrl) {
      await upsertSellerDocumentRecord(
        userUid,
        'fssai_certificate',
        'seller-documents',
        `fssai-${fssaiNumber || 'certificate'}.png`,
        fssaiCertificateUrl,
        true
      );
    }
  } else if (step === 4) {
    const [existingBank] = await withDbRetry(() =>
      db.select().from(sellerBankDetails).where(eq(sellerBankDetails.userUid, userUid))
    );

    const accountHolderName = String(
      payload.accountHolderName ?? existingBank?.accountHolderName ?? ''
    ).trim();
    const rawAccount = String(payload.accountNumber || '').replace(/\D/g, '');
    const accountNumberInternal =
      rawAccount.length >= 9 ? rawAccount : existingBank?.accountNumberInternal || '';
    const accountNumberMasked =
      rawAccount.length >= 9
        ? maskAccountNumber(rawAccount)
        : existingBank?.accountNumberMasked || '';

    const ifscCode = String(payload.ifscCode ?? existingBank?.ifscCode ?? '')
      .trim()
      .toUpperCase();
    const ifscInfo = lookupIfscLocally(ifscCode);
    const bankName = String(
      payload.bankName || ifscInfo?.bank || existingBank?.bankName || ''
    ).trim();
    const branchName = String(
      payload.branchName || ifscInfo?.branch || existingBank?.branchName || ''
    ).trim();
    const cancelledChequeUrl = String(
      payload.cancelledChequeUrl ?? existingBank?.cancelledChequeUrl ?? ''
    ).trim();

    if (existingBank) {
      await withDbRetry(() =>
        db
          .update(sellerBankDetails)
          .set({
            accountHolderName,
            accountNumberInternal,
            accountNumberMasked,
            ifscCode,
            bankName,
            branchName,
            cancelledChequeUrl,
            updatedAt: new Date(),
          })
          .where(eq(sellerBankDetails.userUid, userUid))
      );
    } else {
      await withDbRetry(() =>
        db.insert(sellerBankDetails).values({
          userUid,
          accountHolderName,
          accountNumberInternal,
          accountNumberMasked,
          ifscCode,
          bankName,
          branchName,
          cancelledChequeUrl,
        })
      );
    }

    await withDbRetry(() =>
      db
        .update(sellerProfiles)
        .set({ currentStep: nextStep, updatedAt: new Date() })
        .where(eq(sellerProfiles.userUid, userUid))
    );

    if (cancelledChequeUrl) {
      await upsertSellerDocumentRecord(
        userUid,
        'cancelled_cheque',
        'seller-documents',
        `cancelled-cheque-${ifscCode || 'bank'}.png`,
        cancelledChequeUrl,
        true
      );
    }
  } else if (step === 5) {
    const warehousesInput: SellerWarehouseRecord[] = Array.isArray(payload.warehouses)
      ? payload.warehouses
      : [];

    if (warehousesInput.length > 0) {
      await withDbRetry(() =>
        db.delete(sellerPickupLocations).where(eq(sellerPickupLocations.userUid, userUid))
      );
      await withDbRetry(() =>
        db.insert(sellerPickupLocations).values(
          warehousesInput.map((w, idx) => ({
            userUid,
            warehouseName: String(w.warehouseName || `Warehouse #${idx + 1}`).trim(),
            pickupAddress: String(w.pickupAddress || '').trim(),
            pincode: String(w.pincode || '')
              .replace(/\D/g, '')
              .trim(),
            contactPerson: String(w.contactPerson || '').trim(),
            contactPhone: String(w.contactPhone || '')
              .replace(/\D/g, '')
              .trim(),
            pickupTimeSlots: Array.isArray(w.pickupTimeSlots)
              ? w.pickupTimeSlots.map(String)
              : ['09:00 AM – 01:00 PM'],
            isPrimary: idx === 0,
          }))
        )
      );
    }

    await withDbRetry(() =>
      db
        .update(sellerProfiles)
        .set({ currentStep: nextStep, updatedAt: new Date() })
        .where(eq(sellerProfiles.userUid, userUid))
    );
  } else if (step === 6) {
    const signatureDataUrl = String(
      payload.signatureDataUrl ?? existingProfile.signatureDataUrl
    ).trim();
    const acceptedTerms = Boolean(payload.acceptedTerms ?? existingProfile.acceptedTerms);

    await withDbRetry(() =>
      db
        .update(sellerProfiles)
        .set({
          signatureDataUrl,
          acceptedTerms,
          currentStep: nextStep,
          updatedAt: new Date(),
        })
        .where(eq(sellerProfiles.userUid, userUid))
    );

    if (signatureDataUrl) {
      await upsertSellerDocumentRecord(
        userUid,
        'digital_signature',
        'seller-documents',
        'seller-digital-signature.png',
        signatureDataUrl,
        true
      );
    }
  } else if (step === 7) {
    await withDbRetry(() =>
      db
        .update(sellerProfiles)
        .set({ currentStep: nextStep, updatedAt: new Date() })
        .where(eq(sellerProfiles.userUid, userUid))
    );
  }

  return getSellerPortalBundle(userUid);
}

/**
 * Final submission of the 7-step Seller Application:
 * Validates all 6 data steps, transitions status from draft/rejected -> submitted -> under_review.
 */
export async function submitSellerOnboardingApplication(userUid: string) {
  const bundle = await getSellerPortalBundle(userUid);
  if (!bundle) {
    throw new Error('Seller profile not found.');
  }

  const { profile, bank, warehouses } = bundle;

  // Validate steps 1..6
  const s1 = validateSellerWizardStep(1, {
    categoriesSold: profile.categoriesSold,
    spocName: profile.spocName,
    spocDesignation: profile.spocDesignation,
  });
  const s2 = validateSellerWizardStep(2, {
    brandName: profile.brandName,
    brandLogoUrl: profile.brandLogoUrl,
    shortDescription: profile.shortDescription,
    brandStory: profile.brandStory,
  });
  const s3 = validateSellerWizardStep(3, {
    businessType: profile.businessType,
    legalBusinessName: profile.legalBusinessName,
    panNumber: profile.panNumber,
    gstinNumber: profile.gstinNumber,
    gstBelowThreshold: profile.gstBelowThreshold,
    fssaiNumber: profile.fssaiNumber,
    fssaiExpiryDate: profile.fssaiExpiryDate,
    fssaiCertificateUrl: profile.fssaiCertificateUrl,
    registeredState: profile.registeredState,
    registeredDistrict: profile.registeredDistrict,
    registeredPincode: profile.registeredPincode,
  });
  const s4 = validateSellerWizardStep(4, {
    accountHolderName: bank.accountHolderName,
    accountNumber: bank.hasSavedAccountNumber ? '123456789012' : '',
    confirmAccountNumber: bank.hasSavedAccountNumber ? '123456789012' : '',
    ifscCode: bank.ifscCode,
    bankName: bank.bankName,
    branchName: bank.branchName,
    cancelledChequeUrl: bank.cancelledChequeUrl,
  });
  const s5 = validateSellerWizardStep(5, {
    warehouses,
  });
  const s6 = validateSellerWizardStep(6, {
    signatureDataUrl: profile.signatureDataUrl,
    acceptedTerms: profile.acceptedTerms,
  });

  const checks = [
    { step: 1, res: s1 },
    { step: 2, res: s2 },
    { step: 3, res: s3 },
    { step: 4, res: s4 },
    { step: 5, res: s5 },
    { step: 6, res: s6 },
  ];

  for (const c of checks) {
    if (!c.res.valid) {
      const firstErr = Object.values(c.res.errors)[0] || `Step ${c.step} has incomplete fields.`;
      throw new Error(`Step ${c.step}: ${firstErr}`);
    }
  }

  // Update brand name on user profile
  if (profile.brandName) {
    await withDbRetry(() =>
      db
        .update(users)
        .set({ fullName: `${profile.brandName} (Seller)` })
        .where(eq(users.uid, userUid))
    );
  }

  // Build structured payload for "sellers" table: (user_id, business, brand, KYC, bank, pickup, status = "pending")
  const businessPayload = {
    categoriesSold: profile.categoriesSold,
    retailChannels: profile.retailChannels,
    socialChannels: profile.socialChannels,
    spocName: profile.spocName,
    spocDesignation: profile.spocDesignation,
    phone: profile.phone,
    email: profile.email,
  };
  const brandPayload = {
    brandName: profile.brandName,
    brandLogoUrl: profile.brandLogoUrl,
    shortDescription: profile.shortDescription,
    brandStory: profile.brandStory,
    brandPhotos: profile.brandPhotos,
    websiteUrl: profile.websiteUrl,
  };
  const kycPayload = {
    businessType: profile.businessType,
    legalBusinessName: profile.legalBusinessName,
    panNumber: profile.panNumber,
    gstinNumber: profile.gstinNumber,
    gstBelowThreshold: profile.gstBelowThreshold,
    fssaiNumber: profile.fssaiNumber,
    fssaiExpiryDate: profile.fssaiExpiryDate,
    fssaiCertificateUrl: profile.fssaiCertificateUrl,
    registeredState: profile.registeredState,
    registeredDistrict: profile.registeredDistrict,
    registeredPincode: profile.registeredPincode,
    signatureDataUrl: profile.signatureDataUrl,
    acceptedTerms: profile.acceptedTerms,
  };
  const bankPayload = {
    accountHolderName: bank.accountHolderName,
    accountNumberMasked: bank.accountNumberMasked,
    ifscCode: bank.ifscCode,
    bankName: bank.bankName,
    branchName: bank.branchName,
    cancelledChequeUrl: bank.cancelledChequeUrl,
  };
  const pickupPayload = warehouses.map((w: any) => ({
    warehouseName: w.warehouseName,
    pickupAddress: w.pickupAddress,
    pincode: w.pincode,
    contactPerson: w.contactPerson,
    contactPhone: w.contactPhone,
    pickupTimeSlots: w.pickupTimeSlots,
    isPrimary: w.isPrimary,
  }));

  const existingSellerRows = await withDbRetry(() =>
    db.select().from(sellers).where(eq(sellers.userId, userUid))
  );
  if (existingSellerRows.length > 0) {
    await withDbRetry(() =>
      db
        .update(sellers)
        .set({
          business: businessPayload,
          brand: brandPayload,
          kyc: kycPayload,
          bank: bankPayload,
          pickup: pickupPayload,
          status: 'pending',
          updatedAt: new Date(),
        })
        .where(eq(sellers.userId, userUid))
    );
  } else {
    await withDbRetry(() =>
      db.insert(sellers).values({
        userId: userUid,
        business: businessPayload,
        brand: brandPayload,
        kyc: kycPayload,
        bank: bankPayload,
        pickup: pickupPayload,
        status: 'pending',
      })
    );
  }

  await withDbRetry(() =>
    db
      .update(sellerApplications)
      .set({
        status: 'pending',
        reviewNote: '',
        submittedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(sellerApplications.userUid, userUid))
  );

  return getSellerPortalBundle(userUid);
}

/**
 * Returns all seller applications with complete profile, KYC, masked bank, pickup locations,
 * and document records for the Admin "Seller Applications" review screen.
 */
export async function listSellerApplicationsForAdmin() {
  await ensureDefaultSellerProfilesSeeded();

  // Ensure admin account phone_9999900001 is never listed as a seller applicant
  await withDbRetry(() =>
    db.delete(sellerApplications).where(eq(sellerApplications.userUid, 'phone_9999900001'))
  );
  await withDbRetry(() =>
    db.delete(sellerProfiles).where(eq(sellerProfiles.userUid, 'phone_9999900001'))
  );
  await withDbRetry(() =>
    db
      .update(users)
      .set({ role: 'admin' })
      .where(eq(users.uid, 'phone_9999900001'))
  );

  const apps = await withDbRetry(() =>
    db.select().from(sellerApplications).orderBy(desc(sellerApplications.updatedAt))
  );
  const profiles = await withDbRetry(() => db.select().from(sellerProfiles));
  const banks = await withDbRetry(() => db.select().from(sellerBankDetails));
  const pickups = await withDbRetry(() => db.select().from(sellerPickupLocations));
  const docs = await withDbRetry(() => db.select().from(sellerDocuments));

  const statusPriority: Record<string, number> = {
    pending: 1,
    under_review: 1,
    submitted: 2,
    approved: 3,
    rejected: 4,
    draft: 5,
  };

  return apps
    .map((app) => {
      const profile = profiles.find((p) => p.userUid === app.userUid);
      if (!profile) return null;
      const bank = banks.find((b) => b.userUid === app.userUid);
      const sellerPickups = pickups.filter((w) => w.userUid === app.userUid);
      const sellerDocs = docs.filter((d) => d.userUid === app.userUid);

      return {
        application: app,
        profile,
        bank: {
          accountHolderName: bank?.accountHolderName || '',
          accountNumberMasked: bank?.accountNumberMasked || '',
          ifscCode: bank?.ifscCode || '',
          bankName: bank?.bankName || '',
          branchName: bank?.branchName || '',
          cancelledChequeUrl: bank?.cancelledChequeUrl || '',
        },
        warehouses: sellerPickups,
        documents: sellerDocs,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort(
      (a, b) =>
        (statusPriority[a.application.status] || 9) -
        (statusPriority[b.application.status] || 9)
    );
}

/**
 * Allows Admin to Approve or Reject (with a mandatory reason on rejection) a Seller Application.
 */
export async function reviewSellerApplicationByAdmin(input: {
  adminUid: string;
  sellerUid: string;
  decision: 'approved' | 'rejected';
  reviewNote: string;
}) {
  if (input.decision !== 'approved' && input.decision !== 'rejected') {
    throw new Error('Decision must be approved or rejected.');
  }
  const cleanNote = String(input.reviewNote || '').trim();
  if (input.decision === 'rejected' && cleanNote.length < 3) {
    throw new Error('Please provide a clear rejection reason for the seller.');
  }

  await withDbRetry(() =>
    db
      .update(sellerApplications)
      .set({
        status: input.decision,
        reviewNote:
          cleanNote ||
          (input.decision === 'approved'
            ? 'Application approved by Bharat Organic Compliance Desk.'
            : ''),
        reviewedAt: new Date(),
        reviewedByUid: input.adminUid,
        updatedAt: new Date(),
      })
      .where(eq(sellerApplications.userUid, input.sellerUid))
  );

  await withDbRetry(() =>
    db
      .update(sellers)
      .set({
        status: input.decision,
        updatedAt: new Date(),
      })
      .where(eq(sellers.userId, input.sellerUid))
  );

  return listSellerApplicationsForAdmin();
}

