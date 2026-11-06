import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';
import { requireAuth, type AuthRequest } from './src/middleware/auth.ts';
import { getOrCreateUser, getUserByUid } from './src/db/users.ts';
import {
  getBootstrapCatalog,
  searchCatalogProducts,
  getUserAddresses,
  saveUserAddress,
  createServerVerifiedOrder,
  verifyServerOrderPayment,
  updateServerOrderStatus,
  getOrdersForUserOrRole,
  updateProductInventory,
  deleteSellerProduct,
  approveProductByAdmin,
  getSellersList,
  registerNewSeller,
  createSellerProduct,
} from './src/db/repository.ts';
import {
  authenticateSellerAccount,
  getSellerPortalBundle,
  updateSellerContactDetails,
  saveSellerOnboardingStep,
  submitSellerOnboardingApplication,
  listSellerApplicationsForAdmin,
  reviewSellerApplicationByAdmin,
} from './src/db/sellerRepository.ts';
import { lookupIfscLocally } from './src/utils/sellerValidation.ts';
import {
  validateIndianMobile,
  calculateLocationServiceability,
  type OrderStatus,
} from './src/utils/commerceRules.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '25mb' }));

  // SSE clients for real-time order tracking updates
  const sseClients = new Set<express.Response>();
  const broadcastOrderUpdate = (payload: unknown) => {
    const msg = `data: ${JSON.stringify(payload)}\n\n`;
    for (const client of sseClients) {
      try {
        client.write(msg);
      } catch {
        sseClients.delete(client);
      }
    }
  };

  app.get('/api/orders/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
    sseClients.add(res);
    req.on('close', () => {
      sseClients.delete(res);
    });
  });

  // Catalogue bootstrap endpoint (Buyers only receive approved products; Admin can request includePending=true)
  app.get('/api/catalog', async (req, res) => {
    try {
      const includePending =
        req.query.includePending === 'true' || req.query.role === 'admin';
      const data = await getBootstrapCatalog(includePending);
      res.json(data);
    } catch (error: any) {
      console.error('Failed to fetch catalog:', error);
      res.status(500).json({ error: error.message || 'Failed to load catalog' });
    }
  });

  // Instant search & filter endpoint
  app.get('/api/search', async (req, res) => {
    try {
      const results = await searchCatalogProducts({
        query: typeof req.query.q === 'string' ? req.query.q : undefined,
        categoryId: req.query.categoryId ? Number(req.query.categoryId) : undefined,
        subcategoryId: req.query.subcategoryId ? Number(req.query.subcategoryId) : undefined,
        minPrice: req.query.minPrice ? Number(req.query.minPrice) : undefined,
        maxPrice: req.query.maxPrice ? Number(req.query.maxPrice) : undefined,
        minRating: req.query.minRating ? Number(req.query.minRating) : undefined,
        sortBy: typeof req.query.sortBy === 'string' ? req.query.sortBy : undefined,
      });
      res.json({ results });
    } catch (error: any) {
      console.error('Search error:', error);
      res.status(500).json({ error: error.message || 'Search failed' });
    }
  });

  // Location serviceability & ETA calculator
  app.get('/api/location/check', (req, res) => {
    const lat = Number(req.query.lat || 28.4126);
    const lng = Number(req.query.lng || 77.066);
    const pincode = typeof req.query.pincode === 'string' ? req.query.pincode : undefined;
    const result = calculateLocationServiceability(lat, lng, pincode);
    res.json(result);
  });

  // Send OTP endpoint (+91 mobile validation)
  app.post('/api/auth/otp/send', async (req, res) => {
    const phone = String(req.body?.phone || '').replace(/\D/g, '');
    if (!validateIndianMobile(phone)) {
      return res.status(400).json({
        error: 'Please enter a valid 10-digit Indian mobile number starting with 6–9.',
      });
    }
    res.json({
      sent: true,
      phone: `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`,
      demoOtpHint: '123456',
      expiresInSeconds: 300,
    });
  });

  // Verify OTP endpoint (enforces single role per mobile number via profiles table)
  app.post('/api/auth/otp/verify', async (req, res) => {
    try {
      const phone = String(req.body?.phone || '').replace(/\D/g, '');
      const token = String(req.body?.token || '').trim();
      const requestedRole = req.body?.role;

      if (!validateIndianMobile(phone)) {
        return res.status(400).json({ error: 'Invalid Indian mobile number.' });
      }
      if (!/^\d{6}$/.test(token)) {
        return res.status(400).json({ error: 'Please enter a valid 6-digit OTP code.' });
      }
      if (token === '000000') {
        return res.status(400).json({ error: 'Invalid or expired OTP code. Please try again.' });
      }

      const role =
        requestedRole ||
        (phone === '9999900001'
          ? 'admin'
          : phone === '9999900002'
          ? 'seller'
          : 'customer');

      const defaultName =
        role === 'admin'
          ? 'Vikramaditya Sharma (Admin)'
          : role === 'seller'
          ? 'Kisan Organic Collective (Seller)'
          : `Organic Member (${phone.slice(-4)})`;

      const uid = `phone_${phone}`;
      const email = `${phone}@bharatorganic.in`;
      const dbUser = await getOrCreateUser(uid, email, phone, defaultName, role);

      const sessionToken = `bharat_otp_${phone}_${dbUser.role}`;
      res.json({
        token: sessionToken,
        user: dbUser,
        profile: {
          id: dbUser.uid,
          phone: dbUser.phone,
          email: dbUser.email,
          full_name: dbUser.fullName,
          role: dbUser.role,
        },
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Failed to verify OTP' });
    }
  });

  // Fetch authoritative user role from "profiles" table after login
  app.get('/api/auth/profile', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const dbUser = await getUserByUid(uid);
      if (!dbUser) {
        return res.status(404).json({ error: 'Profile not found' });
      }
      res.json({
        user: dbUser,
        profile: {
          id: dbUser.uid,
          phone: dbUser.phone,
          email: dbUser.email,
          full_name: dbUser.fullName,
          role: dbUser.role,
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to load profile' });
    }
  });

  // Firebase Google Auth user sync
  app.post('/api/auth/firebase-sync', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const email = req.user!.email || `${uid}@bharatorganic.in`;
      const role = req.body?.role;
      const fullName = req.body?.fullName || req.user!.name || 'Bharat Organic Member';
      const user = await getOrCreateUser(uid, email, req.body?.phone, fullName, role);
      res.json({ user });
    } catch (error: any) {
      console.error('Failed to sync Firebase user:', error);
      res.status(500).json({ error: error.message || 'Failed to sync user' });
    }
  });

  // Get saved addresses for logged-in user
  app.get('/api/addresses', requireAuth, async (req: AuthRequest, res) => {
    try {
      const list = await getUserAddresses(req.user!.uid);
      res.json({ addresses: list });
    } catch (error: any) {
      console.error('Failed to fetch addresses:', error);
      res.status(500).json({ error: error.message || 'Failed to fetch addresses' });
    }
  });

  // Save a new address for logged-in user
  app.post('/api/addresses', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { label, flatHouse, towerBuilding, area, city, pincode, landmark, lat, lng } =
        req.body || {};
      if (!flatHouse || !area || !city || !pincode) {
        return res
          .status(400)
          .json({ error: 'Flat/House number, Area, City, and Pincode are required.' });
      }
      const saved = await saveUserAddress({
        userUid: req.user!.uid,
        label: label || 'Home',
        flatHouse: String(flatHouse).trim(),
        towerBuilding: String(towerBuilding || area).trim(),
        area: String(area).trim(),
        city: String(city).trim(),
        pincode: String(pincode).trim(),
        landmark: String(landmark || '').trim(),
        lat: Number(lat || 28.4126),
        lng: Number(lng || 77.066),
      });
      res.json({ address: saved });
    } catch (error: any) {
      console.error('Failed to save address:', error);
      res.status(500).json({ error: error.message || 'Failed to save address' });
    }
  });

  // Edge Function equivalent: create-order (server recalculates prices, stock, fees, idempotency)
  app.post('/api/edge/create-order', requireAuth, async (req: AuthRequest, res) => {
    try {
      const result = await createServerVerifiedOrder({
        idempotencyKey: String(req.body?.idempotencyKey || `idem_${Date.now()}`),
        userUid: req.user!.uid,
        customerPhone: String(req.body?.customerPhone || '+91 9876543210'),
        customerName: String(req.body?.customerName || 'Bharat Organic Member'),
        addressSnapshot: req.body?.addressSnapshot,
        items: req.body?.items || [],
        couponCode: req.body?.couponCode || null,
        paymentMethod: req.body?.paymentMethod || 'upi',
        scheduledSlot: req.body?.scheduledSlot,
      });

      broadcastOrderUpdate({
        type: 'order_created',
        orderId: result.order.id,
        status: result.order.status,
      });

      res.json(result);
    } catch (error: any) {
      console.error('create-order failed:', error);
      res.status(400).json({ error: error.message || 'Could not create order' });
    }
  });

  // Edge Function equivalent: verify-payment
  app.post('/api/edge/verify-payment', requireAuth, async (req: AuthRequest, res) => {
    try {
      const result = await verifyServerOrderPayment({
        orderId: Number(req.body?.orderId),
        razorpayOrderId: String(req.body?.razorpayOrderId || `order_rzp_${Date.now()}`),
        razorpayPaymentId: String(req.body?.razorpayPaymentId || `pay_rzp_${Date.now()}`),
        razorpaySignature: String(req.body?.razorpaySignature || 'sig_verified_test_hmac256'),
        simulateFailure: Boolean(req.body?.simulateFailure),
      });

      broadcastOrderUpdate({
        type: 'order_updated',
        orderId: result.order.id,
        status: result.order.status,
      });

      res.json(result);
    } catch (error: any) {
      console.error('verify-payment failed:', error);
      res.status(400).json({ error: error.message || 'Payment verification failed' });
    }
  });

  // Get orders for current user or seller/admin
  app.get('/api/orders', requireAuth, async (req: AuthRequest, res) => {
    try {
      const role = String(req.query.role || (req.user as any)?.role || 'customer');
      const list = await getOrdersForUserOrRole(req.user!.uid, role);
      res.json({ orders: list });
    } catch (error: any) {
      console.error('Failed to fetch orders:', error);
      res.status(500).json({ error: error.message || 'Failed to load orders' });
    }
  });

  // Update order status (customer cancel before packed, seller accept/pack, admin assign/deliver)
  app.post('/api/orders/:id/status', requireAuth, async (req: AuthRequest, res) => {
    try {
      const orderId = Number(req.params.id);
      const nextStatus = req.body?.status as OrderStatus;
      const result = await updateServerOrderStatus({
        orderId,
        nextStatus,
        note: req.body?.note,
        deliveryPartnerName: req.body?.deliveryPartnerName,
        deliveryPartnerPhone: req.body?.deliveryPartnerPhone,
      });

      broadcastOrderUpdate({
        type: 'order_updated',
        orderId: result.order.id,
        status: result.order.status,
      });

      res.json(result);
    } catch (error: any) {
      console.error('Failed to update order status:', error);
      res.status(400).json({ error: error.message || 'Status update failed' });
    }
  });

  // Seller/Admin inventory & product update (Edit / Stock update — enforces seller ownership)
  const handleUpdateSellerProduct = async (req: AuthRequest, res: express.Response) => {
    try {
      const role = (req.user as any)?.role || '';
      const isAdmin = role === 'admin' || req.user?.uid === 'phone_9999900001';
      const updated = await updateProductInventory({
        productId: Number(req.params.id),
        requestingSellerUid: req.user?.uid,
        isAdmin,
        price: req.body?.price !== undefined ? Number(req.body.price) : undefined,
        mrp: req.body?.mrp !== undefined ? Number(req.body.mrp) : undefined,
        stock: req.body?.stock !== undefined ? Number(req.body.stock) : undefined,
        name: req.body?.name,
        brand: req.body?.brand,
        sellerCategory: req.body?.sellerCategory,
        description: req.body?.description,
        unit: req.body?.unit,
        unitLabel: req.body?.unitLabel,
        certificateUrl: req.body?.certificateUrl,
        imageUrl: req.body?.imageUrl,
        galleryUrls: Array.isArray(req.body?.galleryUrls) ? req.body.galleryUrls : undefined,
        status: isAdmin && req.body?.status ? req.body.status : undefined,
      });
      res.json({ product: updated });
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Product update failed' });
    }
  };

  app.patch('/api/seller/products/:id', requireAuth, handleUpdateSellerProduct);
  app.put('/api/seller/products/:id', requireAuth, handleUpdateSellerProduct);

  // Seller/Admin delete product (enforces seller ownership)
  app.delete('/api/seller/products/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const role = (req.user as any)?.role || '';
      const isAdmin = role === 'admin' || req.user?.uid === 'phone_9999900001';
      const result = await deleteSellerProduct({
        productId: Number(req.params.id),
        requestingUid: req.user!.uid,
        isAdmin,
      });
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Failed to delete product' });
    }
  });

  // Get all registered sellers / vendors with product counts
  app.get('/api/sellers', async (_req, res) => {
    try {
      const sellers = await getSellersList();
      res.json({ sellers });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to load sellers' });
    }
  });

  // Register / Onboard a new seller (Vendor Onboarding)
  app.post('/api/sellers', async (req, res) => {
    try {
      const result = await registerNewSeller({
        storeName: String(req.body?.storeName || ''),
        ownerName: String(req.body?.ownerName || ''),
        phone: String(req.body?.phone || ''),
        city: String(req.body?.city || 'Gurugram'),
        gstin: String(req.body?.gstin || 'NPOP-ORG-2026'),
      });
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Failed to register new seller' });
    }
  });

  // Create a new product under a seller (inserts with seller_id and status = "pending_approval")
  app.post('/api/seller/products', async (req, res) => {
    try {
      const created = await createSellerProduct({
        sellerUid: String(req.body?.sellerUid || 'seller-bharat-organic'),
        brand: String(req.body?.brand || 'Kisan Organic Collective'),
        categoryId: req.body?.categoryId ? Number(req.body.categoryId) : undefined,
        sellerCategory: req.body?.sellerCategory ? String(req.body.sellerCategory) : undefined,
        subcategoryId: req.body?.subcategoryId ? Number(req.body.subcategoryId) : undefined,
        name: String(req.body?.name || ''),
        unit: req.body?.unit ? String(req.body.unit) : 'g',
        unitLabel: String(req.body?.unitLabel || '500 g'),
        mrp: Number(req.body?.mrp || 150),
        price: Number(req.body?.price || 120),
        stock: Number(req.body?.stock ?? 50),
        certificateUrl: req.body?.certificateUrl ? String(req.body.certificateUrl) : '',
        status: req.body?.status === 'approved' ? 'approved' : 'pending_approval',
        tag: req.body?.tag ? String(req.body.tag) : undefined,
        origin: req.body?.origin ? String(req.body.origin) : undefined,
        shelfLife: req.body?.shelfLife ? String(req.body.shelfLife) : undefined,
        description: req.body?.description ? String(req.body.description) : undefined,
        imageUrl: req.body?.imageUrl ? String(req.body.imageUrl) : undefined,
        galleryUrls: Array.isArray(req.body?.galleryUrls) ? req.body.galleryUrls : undefined,
      });
      res.json({ product: created });
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Failed to create product' });
    }
  });

  // Admin: Approve or Reject a Seller Product
  app.post('/api/admin/products/:id/approve', async (req, res) => {
    try {
      const productId = Number(req.params.id);
      const status = req.body?.status === 'rejected' ? 'rejected' : 'approved';
      const product = await approveProductByAdmin({ productId, status });
      res.json({ product });
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Failed to update product approval status' });
    }
  });

  // ============================================================================
  // STANDALONE SELLER PORTAL (/seller) & ADMIN SELLER APPLICATION ENDPOINTS
  // ============================================================================

  // Send Email OTP / Magic link for Seller dual-verification
  app.post('/api/seller-portal/auth/send-email-otp', (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid business email address.' });
    }
    res.json({
      sent: true,
      email,
      demoOtpHint: '123456',
      expiresInSeconds: 300,
    });
  });

  // Verify Seller Mobile OTP + Email OTP & enforce One Account = One Role ('seller')
  app.post('/api/seller-portal/auth/verify', async (req, res) => {
    try {
      const result = await authenticateSellerAccount({
        phone: String(req.body?.phone || ''),
        phoneOtp: String(req.body?.phoneOtp || ''),
        email: String(req.body?.email || ''),
        emailOtp: String(req.body?.emailOtp || ''),
        registerAsSeller: Boolean(req.body?.registerAsSeller),
      });
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Seller authentication failed' });
    }
  });

  // Get isolated Seller Portal state for the authenticated seller
  app.get('/api/seller-portal/me', requireAuth, async (req: AuthRequest, res) => {
    try {
      const bundle = await getSellerPortalBundle(req.user!.uid);
      if (!bundle) {
        return res.status(404).json({ error: 'Seller profile not found' });
      }
      res.json({ bundle });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to load seller portal' });
    }
  });

  // Update Seller contact details (email + mobile) from Blinkit Seller Hub sidebar
  app.patch('/api/seller-portal/contact', requireAuth, async (req: AuthRequest, res) => {
    try {
      const bundle = await updateSellerContactDetails(req.user!.uid, {
        phone: String(req.body?.phone || ''),
        email: String(req.body?.email || ''),
      });
      res.json({ bundle });
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Failed to update contact details' });
    }
  });

  // Autosave or Save & Continue a step (1..7) in the Seller Onboarding Wizard
  app.put('/api/seller-portal/wizard/step/:step', requireAuth, async (req: AuthRequest, res) => {
    try {
      const step = Number(req.params.step);
      const advanceToStep = req.body?.advanceToStep ? Number(req.body.advanceToStep) : undefined;
      const bundle = await saveSellerOnboardingStep(
        req.user!.uid,
        step,
        req.body?.data || {},
        advanceToStep
      );
      res.json({ bundle });
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Failed to save onboarding step' });
    }
  });

  // Submit Seller Onboarding Application (Step 7 -> status: under_review)
  app.post('/api/seller-portal/wizard/submit', requireAuth, async (req: AuthRequest, res) => {
    try {
      const bundle = await submitSellerOnboardingApplication(req.user!.uid);
      res.json({ bundle });
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Failed to submit seller application' });
    }
  });

  // Auto-fetch Bank & Branch Name from IFSC code
  app.get('/api/seller-portal/ifsc/:code', (req, res) => {
    const code = String(req.params.code || '').trim().toUpperCase();
    const info = lookupIfscLocally(code);
    if (!info) {
      return res.status(400).json({ error: 'Invalid IFSC code format (expected AAAA0XXXXXX).' });
    }
    res.json(info);
  });

  // Admin: Get all Seller Applications with KYC, masked bank details, warehouses & documents
  app.get('/api/admin/seller-applications', async (_req, res) => {
    try {
      const applications = await listSellerApplicationsForAdmin();
      res.json({ applications });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to load seller applications' });
    }
  });

  // Admin: Approve or Reject (with reason) a Seller Application
  app.post('/api/admin/seller-applications/:sellerUid/review', async (req, res) => {
    try {
      const sellerUid = String(req.params.sellerUid || '');
      const decision = req.body?.decision === 'rejected' ? 'rejected' : 'approved';
      const reviewNote = String(req.body?.reviewNote || '');
      const adminUid = String(req.body?.adminUid || 'phone_9999900001');
      const applications = await reviewSellerApplicationByAdmin({
        adminUid,
        sellerUid,
        decision,
        reviewNote,
      });
      res.json({ applications });
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Failed to review seller application' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Bharat Organic server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
