import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  Clock,
  Phone,
  MapPin,
  Package,
  Truck,
  ArrowLeft,
  HelpCircle,
  RotateCcw,
  FileText,
  XCircle,
  Store,
  Shield,
  Copy,
  Check,
  Database,
  UserPlus,
  PlusCircle,
  Building2,
} from 'lucide-react';
import {
  Category,
  OrderRecord,
  Product,
  SellerRecord,
  Subcategory,
  UserProfile,
} from '../types/commerce.ts';
import { OrderStatus } from '../utils/commerceRules.ts';
import {
  SUPABASE_SQL_SCHEMA,
  EDGE_FUNCTION_CREATE_ORDER,
  EDGE_FUNCTION_VERIFY_PAYMENT,
} from '../data/supabaseDeliverables.ts';

interface OrderTrackingViewProps {
  mode: 'tracking' | 'orders' | 'seller' | 'admin';
  activeOrder: OrderRecord | null;
  orders: OrderRecord[];
  products: Product[];
  categories: Category[];
  subcategories: Subcategory[];
  user: UserProfile | null;
  onSelectOrderForTracking: (order: OrderRecord) => void;
  onUpdateOrderStatus: (
    orderId: number,
    nextStatus: OrderStatus,
    note?: string,
    partnerName?: string
  ) => Promise<void>;
  onReorder: (order: OrderRecord) => void;
  onUpdateProductStock: (
    productId: number,
    updates: { price?: number; mrp?: number; stock?: number }
  ) => Promise<void>;
  onRefreshCatalog: () => Promise<void>;
  onSellerAuthenticated?: (user: UserProfile, token: string) => void;
  onBackToStore: () => void;
}

const STATUS_STEPS: { key: OrderStatus; label: string; desc: string }[] = [
  { key: 'placed', label: 'Order Placed', desc: 'Verified by dark store server' },
  { key: 'confirmed', label: 'Order Confirmed', desc: 'Stock reserved in organic cold-room' },
  { key: 'packed', label: 'Packed & Checked', desc: 'Packed in breathable kraft bags' },
  {
    key: 'out_for_delivery',
    label: 'Out for Delivery',
    desc: 'Delivery partner is on the way',
  },
  { key: 'delivered', label: 'Delivered', desc: 'Handed over at doorstep' },
];

export const OrderTrackingView: React.FC<OrderTrackingViewProps> = ({
  mode,
  activeOrder,
  orders,
  products,
  categories,
  subcategories,
  user,
  onSelectOrderForTracking,
  onUpdateOrderStatus,
  onReorder,
  onUpdateProductStock,
  onRefreshCatalog,
  onSellerAuthenticated,
  onBackToStore,
}) => {
  const [etaSeconds, setEtaSeconds] = useState(
    (activeOrder?.etaMinutes || 21) * 60
  );
  const [helpOpen, setHelpOpen] = useState(false);
  const [invoiceOrder, setInvoiceOrder] = useState<OrderRecord | null>(null);
  const [sqlModalOpen, setSqlModalOpen] = useState(false);
  const [copiedTab, setCopiedTab] = useState<string>('');
  const [editingStocks, setEditingStocks] = useState<
    Record<number, { price: number; mrp: number; stock: number }>
  >({});

  // Multi-Vendor Sellers State & New Seller Form
  const [sellers, setSellers] = useState<SellerRecord[]>([]);
  const [activeSellerUid, setActiveSellerUid] = useState<string>(
    'seller-bharat-organic'
  );
  const [showNewSellerForm, setShowNewSellerForm] = useState<boolean>(true);
  const [newSellerStore, setNewSellerStore] = useState('');
  const [newSellerOwner, setNewSellerOwner] = useState('');
  const [newSellerPhone, setNewSellerPhone] = useState('');
  const [newSellerCity, setNewSellerCity] = useState('Gurugram');
  const [newSellerGstin, setNewSellerGstin] = useState('06AABCH2026K1Z5');
  const [sellerSubmitting, setSellerSubmitting] = useState(false);
  const [sellerStatusMsg, setSellerStatusMsg] = useState('');
  const [sellerErrorMsg, setSellerErrorMsg] = useState('');

  // New Product Creation State for Active Seller
  const [showNewProductForm, setShowNewProductForm] = useState<boolean>(false);
  const [prodName, setProdName] = useState('');
  const [prodCatId, setProdCatId] = useState<number>(categories[0]?.id || 1);
  const [prodUnit, setProdUnit] = useState('500 g');
  const [prodMrp, setProdMrp] = useState(180);
  const [prodPrice, setProdPrice] = useState(140);
  const [prodStock, setProdStock] = useState(50);
  const [prodTag, setProdTag] = useState('100% Certified Organic');
  const [prodOrigin, setProdOrigin] = useState('Uttarakhand / MP Organic Farms');
  const [productSubmitting, setProductSubmitting] = useState(false);
  const [productStatusMsg, setProductStatusMsg] = useState('');

  // Admin Seller Applications & Pending Products Review State
  const [sellerApplications, setSellerApplications] = useState<any[]>([]);
  const [adminAllProducts, setAdminAllProducts] = useState<any[]>([]);
  const [approvingProductId, setApprovingProductId] = useState<number | null>(null);
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});
  const [reviewActionLoading, setReviewActionLoading] = useState<string | null>(null);
  const [expandedAppUid, setExpandedAppUid] = useState<string | null>(null);

  const fetchSellerApplications = async () => {
    try {
      const [appRes, catRes] = await Promise.all([
        fetch('/api/admin/seller-applications'),
        fetch('/api/catalog?includePending=true'),
      ]);
      if (appRes.ok) {
        const data = await appRes.json();
        if (Array.isArray(data.applications)) {
          setSellerApplications(data.applications);
        }
      }
      if (catRes.ok) {
        const catData = await catRes.json();
        if (Array.isArray(catData.products)) {
          setAdminAllProducts(catData.products);
        }
      }
    } catch {
      // Keep current list
    }
  };

  const handleAdminApproveProduct = async (productId: number, status: 'approved' | 'rejected' = 'approved') => {
    setApprovingProductId(productId);
    try {
      const res = await fetch(`/api/admin/products/${productId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        await fetchSellerApplications();
        await onRefreshCatalog();
      }
    } finally {
      setApprovingProductId(null);
    }
  };

  const handleAdminReviewApplication = async (
    sellerUid: string,
    decision: 'approved' | 'rejected'
  ) => {
    const note =
      decision === 'rejected'
        ? (rejectReasons[sellerUid] || 'Please re-upload a clear FSSAI certificate and cancelled cheque.').trim()
        : 'KYC, FSSAI Certificate, and Cancelled Cheque verified and approved by Admin.';
    setReviewActionLoading(sellerUid);
    try {
      const res = await fetch(`/api/admin/seller-applications/${sellerUid}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminUid: user?.uid || 'phone_9999900001',
          decision,
          reviewNote: note,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.applications)) {
          setSellerApplications(data.applications);
        }
      }
    } finally {
      setReviewActionLoading(null);
    }
  };

  const fetchSellers = async () => {
    try {
      const res = await fetch('/api/sellers');
      if (res.ok) {
        const data = await res.json();
        if (data.sellers) {
          setSellers(data.sellers);
          if (
            data.sellers.length > 0 &&
            !data.sellers.some((s: SellerRecord) => s.uid === activeSellerUid)
          ) {
            setActiveSellerUid(data.sellers[0].uid);
          }
        }
      }
    } catch {
      // Keep current list
    }
  };

  useEffect(() => {
    if (mode === 'seller' || mode === 'admin') {
      fetchSellers();
    }
    if (mode === 'admin') {
      fetchSellerApplications();
    }
  }, [mode, products.length]);

  const activeSellerObj =
    sellers.find((s) => s.uid === activeSellerUid) || sellers[0] || null;

  const handleRegisterNewSeller = async (e: React.FormEvent) => {
    e.preventDefault();
    setSellerErrorMsg('');
    setSellerStatusMsg('');
    setSellerSubmitting(true);
    try {
      const res = await fetch('/api/sellers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeName: newSellerStore.trim(),
          ownerName: newSellerOwner.trim(),
          phone: newSellerPhone.replace(/\D/g, ''),
          city: newSellerCity.trim() || 'Gurugram',
          gstin: newSellerGstin.trim() || 'NPOP-ORG-2026',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Could not register seller');
      }
      await fetchSellers();
      if (data.seller) {
        setActiveSellerUid(data.seller.uid);
      }
      if (data.user && data.token && onSellerAuthenticated) {
        onSellerAuthenticated(data.user, data.token);
      }
      setSellerStatusMsg(
        `New Seller "${data.seller.storeName}" registered & activated! You can now add products for this seller below.`
      );
      setNewSellerStore('');
      setNewSellerOwner('');
      setNewSellerPhone('');
      setShowNewProductForm(true);
    } catch (err: any) {
      setSellerErrorMsg(err.message || 'Failed to register seller.');
    } finally {
      setSellerSubmitting(false);
    }
  };

  const handleCreateNewProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setProductStatusMsg('');
    setSellerErrorMsg('');
    setProductSubmitting(true);
    try {
      const res = await fetch('/api/seller/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sellerUid: activeSellerObj?.uid || 'seller-bharat-organic',
          brand: activeSellerObj?.storeName || 'Kisan Organic Collective',
          categoryId: Number(prodCatId || categories[0]?.id || 1),
          name: prodName.trim(),
          unitLabel: prodUnit.trim() || '500 g',
          mrp: Number(prodMrp || 180),
          price: Number(prodPrice || 140),
          stock: Number(prodStock || 50),
          tag: prodTag.trim() || 'Farm Fresh Organic',
          origin: prodOrigin.trim() || 'Certified Farms, India',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to publish product');
      }
      await onRefreshCatalog();
      await fetchSellers();
      setProductStatusMsg(
        `Product "${data.product.name}" published live under ${
          activeSellerObj?.storeName || 'Seller'
        }!`
      );
      setProdName('');
    } catch (err: any) {
      setSellerErrorMsg(err.message || 'Could not publish product.');
    } finally {
      setProductSubmitting(false);
    }
  };

  useEffect(() => {
    if (activeOrder) {
      setEtaSeconds(activeOrder.etaMinutes * 60);
    }
  }, [activeOrder?.id, activeOrder?.etaMinutes]);

  useEffect(() => {
    if (
      mode !== 'tracking' ||
      !activeOrder ||
      activeOrder.status === 'delivered' ||
      activeOrder.status === 'cancelled'
    ) {
      return;
    }
    const timer = setInterval(() => {
      setEtaSeconds((prev) => Math.max(60, prev - 15));
    }, 15000);
    return () => clearInterval(timer);
  }, [mode, activeOrder?.id, activeOrder?.status]);

  const minsRemaining = Math.floor(etaSeconds / 60);
  const secsRemaining = etaSeconds % 60;

  const getStepIndex = (status: string) => {
    const idx = STATUS_STEPS.findIndex((s) => s.key === status);
    return idx === -1 ? 0 : idx;
  };

  const canCancel = (status: string) =>
    status === 'placed' || status === 'confirmed';

  const handleCopyCode = (label: string, text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedTab(label);
    setTimeout(() => setCopiedTab(''), 2000);
  };

  return (
    <div className="max-w-[1200px] mx-auto px-3 sm:px-6 py-6 space-y-6">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {(mode === 'tracking' || mode === 'orders') && (
            <button
              type="button"
              onClick={onBackToStore}
              className="px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-xs font-extrabold text-slate-800 flex items-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Storefront
            </button>
          )}
          <h1 className="font-display text-xl sm:text-2xl font-extrabold text-slate-900">
            {mode === 'tracking' && 'Live Order Tracking'}
            {mode === 'orders' && 'My Orders & Invoices'}
            {mode === 'seller' && 'Seller Panel — Kisan Organic Collective'}
            {mode === 'admin' && 'Admin Command Centre — All Orders & SQL'}
          </h1>
        </div>

        {mode === 'admin' && (
          <button
            type="button"
            onClick={() => setSqlModalOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-2 cursor-pointer"
          >
            <Database className="w-4 h-4 text-emerald-400" />
            View Supabase SQL &amp; Edge Functions
          </button>
        )}
      </div>

      {/* 1. LIVE ORDER TRACKING VIEW */}
      {mode === 'tracking' && activeOrder && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left 2 Columns: Live Stepper + Delivery Partner + Simulator Controls */}
          <div className="lg:col-span-2 space-y-4">
            {/* ETA Countdown Banner */}
            <div className="bg-emerald-800 text-white rounded-3xl p-5 sm:p-6 shadow-md flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-200">
                  Order #{activeOrder.orderNumber} · {activeOrder.scheduledSlot}
                </span>
                <h2 className="font-display text-2xl sm:text-3xl font-extrabold mt-1">
                  {activeOrder.status === 'delivered'
                    ? 'Delivered at your doorstep!'
                    : activeOrder.status === 'cancelled'
                    ? 'Order Cancelled (Stock Restored)'
                    : `Arriving in ${minsRemaining}m ${secsRemaining
                        .toString()
                        .padStart(2, '0')}s`}
                </h2>
                <p className="text-xs text-emerald-100 mt-1">
                  Delivering to: {activeOrder.addressSnapshot.flatHouse},{' '}
                  {activeOrder.addressSnapshot.towerBuilding},{' '}
                  {activeOrder.addressSnapshot.city}
                </p>
              </div>

              <div className="bg-emerald-900/80 border border-white/20 rounded-2xl px-4 py-3 text-right tabular-nums">
                <span className="text-[11px] text-emerald-200 block font-semibold">
                  LIVE STATUS
                </span>
                <span className="text-base font-extrabold uppercase text-amber-300">
                  {activeOrder.status.replace(/_/g, ' ')}
                </span>
              </div>
            </div>

            {/* Live 5-Stage Stepper with Timestamps */}
            <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-base font-extrabold text-slate-900">
                  Real-Time Order Progress
                </h3>
                {/* Interactive Live Step Simulator for Testing */}
                {activeOrder.status !== 'delivered' &&
                  activeOrder.status !== 'cancelled' && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {activeOrder.status === 'placed' && (
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateOrderStatus(activeOrder.id, 'confirmed')
                          }
                          className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 hover:bg-emerald-100 text-xs font-bold"
                        >
                          Simulate: Confirm →
                        </button>
                      )}
                      {activeOrder.status === 'confirmed' && (
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateOrderStatus(activeOrder.id, 'packed')
                          }
                          className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 hover:bg-emerald-100 text-xs font-bold"
                        >
                          Simulate: Mark Packed →
                        </button>
                      )}
                      {activeOrder.status === 'packed' && (
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateOrderStatus(
                              activeOrder.id,
                              'out_for_delivery'
                            )
                          }
                          className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 hover:bg-emerald-100 text-xs font-bold"
                        >
                          Simulate: Out for Delivery →
                        </button>
                      )}
                      {activeOrder.status === 'out_for_delivery' && (
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateOrderStatus(activeOrder.id, 'delivered')
                          }
                          className="px-2.5 py-1 rounded-lg bg-emerald-700 text-white text-xs font-bold"
                        >
                          Simulate: Mark Delivered ✓
                        </button>
                      )}
                    </div>
                  )}
              </div>

              <div className="space-y-4">
                {STATUS_STEPS.map((step, idx) => {
                  const currentIdx = getStepIndex(activeOrder.status);
                  const isCompleted =
                    activeOrder.status !== 'cancelled' && idx <= currentIdx;
                  const histEntry = activeOrder.history?.find(
                    (h) => h.status === step.key
                  );
                  return (
                    <div key={step.key} className="flex items-start gap-3.5">
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold shrink-0 mt-0.5 ${
                          isCompleted
                            ? 'bg-emerald-700 text-white'
                            : 'bg-slate-100 text-slate-400'
                        }`}
                      >
                        {isCompleted ? '✓' : idx + 1}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span
                            className={`text-sm font-extrabold ${
                              isCompleted ? 'text-slate-900' : 'text-slate-400'
                            }`}
                          >
                            {step.label}
                          </span>
                          {histEntry && (
                            <span className="text-[11px] text-slate-400 font-mono-tabular">
                              {new Date(histEntry.createdAt).toLocaleTimeString(
                                [],
                                { hour: '2-digit', minute: '2-digit', second: '2-digit' }
                              )}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500">
                          {histEntry ? histEntry.note : step.desc}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Delivery Partner Card */}
            <div className="bg-white rounded-3xl border border-slate-200 p-5 flex items-center justify-between gap-4 shadow-xs">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center font-display font-extrabold text-lg">
                  {activeOrder.deliveryPartnerName.charAt(0)}
                </div>
                <div>
                  <span className="text-[11px] font-bold text-emerald-700 uppercase">
                    EV Delivery Partner Assigned
                  </span>
                  <h4 className="font-display text-base font-extrabold text-slate-900">
                    {activeOrder.deliveryPartnerName}
                  </h4>
                  <p className="text-xs text-slate-500 font-mono-tabular">
                    {activeOrder.deliveryPartnerPhone} · Vaccinated &amp; Temperature Checked
                  </p>
                </div>
              </div>

              <a
                href={`tel:${activeOrder.deliveryPartnerPhone}`}
                className="px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-extrabold flex items-center gap-1.5"
              >
                <Phone className="w-3.5 h-3.5" />
                Call Partner
              </a>
            </div>
          </div>

          {/* Right Column: Items, Bill, Cancel & Need Help */}
          <div className="space-y-4">
            <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs space-y-3">
              <h3 className="font-display text-base font-extrabold text-slate-900">
                Order Summary ({activeOrder.items?.length || 0} items)
              </h3>
              <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto">
                {activeOrder.items?.map((item) => (
                  <div
                    key={item.id}
                    className="py-2 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 truncate">
                        {item.quantity}x {item.productName}
                      </p>
                      <p className="text-[11px] text-slate-500">{item.unitLabel}</p>
                    </div>
                    <span className="font-extrabold text-slate-900 tabular-nums shrink-0">
                      ₹{item.price * item.quantity}
                    </span>
                  </div>
                ))}
              </div>

              <div className="pt-3 border-t border-slate-200 space-y-1 text-xs tabular-nums">
                <div className="flex justify-between text-slate-500">
                  <span>Item Total</span>
                  <span>₹{activeOrder.itemTotalPrice}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Delivery &amp; Handling</span>
                  <span>
                    ₹{activeOrder.deliveryFee + activeOrder.handlingFee}
                  </span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>GST</span>
                  <span>₹{activeOrder.gstAmount}</span>
                </div>
                <div className="flex justify-between text-sm font-extrabold text-slate-900 pt-1">
                  <span>Total ({activeOrder.paymentMethod.toUpperCase()})</span>
                  <span>₹{activeOrder.toPay}</span>
                </div>
              </div>

              <div className="pt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setInvoiceOrder(activeOrder)}
                  className="flex-1 py-2 px-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-700 flex items-center justify-center gap-1.5"
                >
                  <FileText className="w-3.5 h-3.5" />
                  Tax Invoice
                </button>
                <button
                  type="button"
                  onClick={() => onReorder(activeOrder)}
                  className="flex-1 py-2 px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-xs font-bold text-emerald-800 flex items-center justify-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reorder
                </button>
              </div>

              {canCancel(activeOrder.status) && (
                <button
                  type="button"
                  onClick={() =>
                    onUpdateOrderStatus(
                      activeOrder.id,
                      'cancelled',
                      'Cancelled by customer before packing; stock restored.'
                    )
                  }
                  className="w-full py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  Cancel Order (Before Packed)
                </button>
              )}
            </div>

            {/* Need Help Card */}
            <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs">
              <button
                type="button"
                onClick={() => setHelpOpen((prev) => !prev)}
                className="w-full flex items-center justify-between text-left"
              >
                <div className="flex items-center gap-2.5">
                  <HelpCircle className="w-5 h-5 text-emerald-700" />
                  <div>
                    <span className="text-sm font-extrabold text-slate-900 block">
                      Need help with this order?
                    </span>
                    <span className="text-xs text-slate-500">
                      24x7 Organic Concierge · Instant Refund Guarantee
                    </span>
                  </div>
                </div>
                <span className="text-xs font-bold text-emerald-700">
                  {helpOpen ? 'Hide' : 'Open'}
                </span>
              </button>

              {helpOpen && (
                <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-600 space-y-2">
                  <p>
                    • Missing or damaged item? Call our Gurugram Dark-Store Desk at{' '}
                    <strong className="text-slate-900">1800-120-BHARAT</strong>.
                  </p>
                  <p>
                    • Every organic item is covered by our No-Questions-Asked 21-Minute Replacement Promise.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2. MY ORDERS LIST VIEW */}
      {mode === 'orders' && (
        <div className="space-y-4">
          {orders.length === 0 ? (
            <div className="bg-white rounded-3xl border border-slate-200 p-10 text-center space-y-3">
              <Package className="w-10 h-10 text-emerald-700 mx-auto" />
              <h2 className="font-display text-lg font-extrabold text-slate-900">
                No orders yet
              </h2>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Your past and active quick-commerce orders will appear here with live tracking, invoices, and 1-tap reorder.
              </p>
              <button
                type="button"
                onClick={onBackToStore}
                className="px-5 py-2.5 rounded-xl bg-emerald-700 text-white text-xs font-extrabold"
              >
                Browse Organic Essentials
              </button>
            </div>
          ) : (
            orders.map((ord) => (
              <div
                key={ord.id}
                className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-wrap items-center justify-between gap-4 shadow-2xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5">
                    <span className="font-display font-extrabold text-sm text-slate-900">
                      Order #{ord.orderNumber}
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded-md text-[11px] font-extrabold uppercase ${
                        ord.status === 'delivered'
                          ? 'bg-emerald-100 text-emerald-800'
                          : ord.status === 'cancelled'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-amber-100 text-amber-900'
                      }`}
                    >
                      {ord.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {ord.items?.map((i) => `${i.quantity}x ${i.productName}`).join(', ')}
                  </p>
                  <p className="text-[11px] text-slate-400 font-mono-tabular">
                    Total: ₹{ord.toPay} · {ord.paymentMethod.toUpperCase()} · Saved ₹
                    {ord.totalSavings}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onSelectOrderForTracking(ord)}
                    className="px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-extrabold cursor-pointer"
                  >
                    Live Track
                  </button>
                  <button
                    type="button"
                    onClick={() => setInvoiceOrder(ord)}
                    className="px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-700 cursor-pointer"
                  >
                    Invoice
                  </button>
                  <button
                    type="button"
                    onClick={() => onReorder(ord)}
                    className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-800 cursor-pointer"
                  >
                    Reorder
                  </button>
                  {canCancel(ord.status) && (
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateOrderStatus(
                          ord.id,
                          'cancelled',
                          'Cancelled from My Orders'
                        )
                      }
                      className="px-3 py-2 rounded-xl bg-red-50 hover:bg-red-100 text-xs font-bold text-red-600 cursor-pointer"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* 3 & 4. MULTI-VENDOR SELLER ONBOARDING & DIRECTORY (Visible in both Seller & Admin Panels) */}
      {(mode === 'seller' || mode === 'admin') && (
        <div className="space-y-6">
          {/* ADMIN ONLY: SELLER APPLICATIONS KYC & APPROVAL DESK */}
          {mode === 'admin' && (
            <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Shield className="w-5 h-5 text-emerald-700" />
                    <h2 className="font-display text-lg font-extrabold text-slate-900">
                      Seller Applications ({sellerApplications.length})
                    </h2>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Review 7-step Seller Onboarding KYC applications, inspect FSSAI certificates, cancelled cheques & digital signatures, then Approve or Reject with reason.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={fetchSellerApplications}
                  className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-extrabold text-slate-700"
                >
                  Refresh Applications
                </button>
              </div>

              <div className="space-y-4">
                {sellerApplications.map((item) => {
                  const app = item.application;
                  const prof = item.profile;
                  const bnk = item.bank;
                  const whs = item.warehouses || [];
                  const isExpanded = expandedAppUid === prof.userUid;

                  return (
                    <div
                      key={prof.userUid}
                      className="rounded-2xl border border-slate-200 p-4 sm:p-5 bg-slate-50/60 space-y-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="flex items-center gap-3.5">
                          {prof.brandLogoUrl ? (
                            <img
                              src={prof.brandLogoUrl}
                              alt={prof.brandName || 'Brand Logo'}
                              className="w-12 h-12 rounded-xl object-cover border border-slate-200 bg-white"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-extrabold">
                              {(prof.brandName || 'S')[0]}
                            </div>
                          )}
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-display text-base font-extrabold text-slate-900">
                                {prof.brandName || prof.legalBusinessName || 'Draft Seller Applicant'}
                              </h3>
                              <span
                                className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                                  app.status === 'approved'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : app.status === 'rejected'
                                    ? 'bg-red-100 text-red-700'
                                    : app.status === 'under_review' || app.status === 'submitted'
                                    ? 'bg-amber-100 text-amber-900'
                                    : 'bg-slate-200 text-slate-700'
                                }`}
                              >
                                {app.status.replace(/_/g, ' ')}
                              </span>
                            </div>
                            <p className="text-xs text-slate-600 font-semibold mt-0.5">
                              {prof.legalBusinessName} ({prof.businessType}) · SPOC: {prof.spocName} (+91 {prof.phone} · {prof.email})
                            </p>
                            <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                              PAN: {prof.panNumber || 'N/A'} · GSTIN: {prof.gstBelowThreshold ? 'Exempt' : prof.gstinNumber || 'N/A'} · FSSAI: {prof.fssaiNumber || 'N/A'} · Bank A/C: {bnk.accountNumberMasked || 'N/A'} ({bnk.ifscCode || 'N/A'})
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedAppUid(isExpanded ? null : prof.userUid)
                            }
                            className="px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-100"
                          >
                            {isExpanded ? 'Hide KYC Documents' : 'View Full Details & Documents'}
                          </button>
                          <button
                            type="button"
                            disabled={reviewActionLoading === prof.userUid}
                            onClick={() =>
                              handleAdminReviewApplication(prof.userUid, 'approved')
                            }
                            className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-extrabold"
                          >
                            Approve Seller
                          </button>
                        </div>
                      </div>

                      {/* Reject with Reason Input Bar */}
                      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200/80">
                        <input
                          type="text"
                          value={rejectReasons[prof.userUid] || ''}
                          onChange={(e) =>
                            setRejectReasons((prev) => ({
                              ...prev,
                              [prof.userUid]: e.target.value,
                            }))
                          }
                          placeholder="Enter rejection reason (required to reject application)..."
                          className="flex-1 min-w-[220px] px-3 py-1.5 rounded-xl bg-white border border-slate-300 text-xs font-semibold"
                        />
                        <button
                          type="button"
                          disabled={reviewActionLoading === prof.userUid}
                          onClick={() =>
                            handleAdminReviewApplication(prof.userUid, 'rejected')
                          }
                          className="px-3.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-extrabold"
                        >
                          Reject with Reason
                        </button>
                      </div>

                      {isExpanded && (
                        <div className="pt-3 border-t border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                          <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-1.5">
                            <span className="font-extrabold text-slate-900 block">
                              Categories & Warehouses
                            </span>
                            <p className="text-slate-600">
                              <strong>Categories:</strong>{' '}
                              {(prof.categoriesSold || []).join(', ') || 'None'}
                            </p>
                            <p className="text-slate-600">
                              <strong>Registered Address:</strong> {prof.registeredDistrict},{' '}
                              {prof.registeredState} - {prof.registeredPincode}
                            </p>
                            {whs.map((w: any, i: number) => (
                              <p key={i} className="text-slate-600">
                                <strong>Pickup #{i + 1}:</strong> {w.warehouseName} —{' '}
                                {w.pickupAddress} ({w.pincode})
                              </p>
                            ))}
                          </div>

                          <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-2">
                            <span className="font-extrabold text-slate-900 block">
                              FSSAI Certificate & Cancelled Cheque
                            </span>
                            {prof.fssaiCertificateUrl && (
                              <div>
                                <span className="text-[11px] font-bold text-slate-500 block mb-1">
                                  FSSAI Certificate ({prof.fssaiNumber}):
                                </span>
                                <img
                                  src={prof.fssaiCertificateUrl}
                                  alt="FSSAI Certificate"
                                  className="h-20 rounded-lg border border-slate-200 object-contain bg-slate-50"
                                />
                              </div>
                            )}
                            {bnk.cancelledChequeUrl && (
                              <div>
                                <span className="text-[11px] font-bold text-slate-500 block mb-1">
                                  Cancelled Cheque ({bnk.accountNumberMasked}):
                                </span>
                                <img
                                  src={bnk.cancelledChequeUrl}
                                  alt="Cancelled Cheque"
                                  className="h-20 rounded-lg border border-slate-200 object-contain bg-slate-50"
                                />
                              </div>
                            )}
                          </div>

                          <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-2">
                            <span className="font-extrabold text-slate-900 block">
                              Digital Signature & Brand Story
                            </span>
                            <p className="text-slate-600 line-clamp-3">{prof.brandStory}</p>
                            {prof.signatureDataUrl && (
                              <div>
                                <span className="text-[11px] font-bold text-slate-500 block mb-1">
                                  Authorized Digital Signature:
                                </span>
                                <img
                                  src={prof.signatureDataUrl}
                                  alt="Seller Digital Signature"
                                  className="h-14 rounded-lg border border-slate-200 object-contain bg-white p-1"
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* ADMIN SELLER PRODUCTS APPROVAL QUEUE */}
              <div className="pt-4 border-t border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-display text-base font-extrabold text-slate-900">
                      Seller Products Moderation ({adminAllProducts.filter((p) => p.status === 'pending_approval').length} Pending Approval)
                    </h3>
                    <p className="text-xs text-slate-500">
                      Products added by sellers start as "pending_approval" and remain hidden from buyers until approved here.
                    </p>
                  </div>
                </div>

                {adminAllProducts.filter((p) => p.status === 'pending_approval').length === 0 ? (
                  <p className="text-xs font-semibold text-slate-500 py-2">
                    No seller products currently awaiting approval.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {adminAllProducts
                      .filter((p) => p.status === 'pending_approval')
                      .map((prod) => (
                        <div
                          key={prod.id}
                          className="p-3.5 rounded-2xl border border-amber-200 bg-amber-50/50 flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <img
                              src={prod.imageUrl}
                              alt={prod.name}
                              className="w-12 h-12 rounded-xl object-cover border border-slate-200 bg-white shrink-0"
                            />
                            <div className="min-w-0">
                              <p className="text-xs font-extrabold text-slate-900 truncate">
                                {prod.name}
                              </p>
                              <p className="text-[11px] text-slate-600">
                                {prod.unitLabel} · ₹{prod.price} (MRP ₹{prod.mrp}) · Stock: {prod.stock}
                              </p>
                              <p className="text-[10px] font-bold text-amber-800 uppercase">
                                Seller: {prod.sellerName || prod.sellerUid} · Status: {prod.status}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            disabled={approvingProductId === prod.id}
                            onClick={() => handleAdminApproveProduct(prod.id, 'approved')}
                            className="px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-extrabold shrink-0 cursor-pointer"
                          >
                            {approvingProductId === prod.id ? 'Approving...' : 'Approve Product'}
                          </button>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Registered Sellers Directory + Add New Seller Form */}
          <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-emerald-700" />
                  <h2 className="font-display text-lg font-extrabold text-slate-900">
                    Multi-Vendor Sellers Directory ({sellers.length} Active Sellers)
                  </h2>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Onboard a new organic farmer collective or brand seller, switch active seller, or publish new products to the storefront.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewSellerForm((prev) => !prev)}
                  className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-2xs cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" />
                  {showNewSellerForm
                    ? 'Hide New Seller Form'
                    : '+ Add New Seller (Naya Seller Add Karein)'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewProductForm((prev) => !prev)}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold flex items-center gap-1.5 shadow-2xs cursor-pointer"
                >
                  <PlusCircle className="w-4 h-4" />
                  {showNewProductForm
                    ? 'Hide Add Product Form'
                    : '+ Add New Product for Seller'}
                </button>
              </div>
            </div>

            {sellerStatusMsg && (
              <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-900 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>{sellerStatusMsg}</span>
              </div>
            )}

            {productStatusMsg && (
              <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-900 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>{productStatusMsg}</span>
              </div>
            )}

            {sellerErrorMsg && (
              <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-xs font-bold text-red-700">
                {sellerErrorMsg}
              </div>
            )}

            {/* Existing Registered Sellers Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {sellers.map((s) => {
                const isSelected = s.uid === activeSellerObj?.uid;
                return (
                  <div
                    key={s.uid}
                    onClick={() => setActiveSellerUid(s.uid)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                      isSelected
                        ? 'bg-emerald-50/70 border-emerald-600 shadow-2xs'
                        : 'bg-slate-50 border-slate-200 hover:bg-slate-100/80'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-extrabold text-slate-900 truncate">
                          {s.storeName}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            isSelected
                              ? 'bg-emerald-700 text-white'
                              : 'bg-white border border-slate-200 text-slate-600'
                          }`}
                        >
                          {isSelected ? 'Active Seller' : 'Select'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 mt-1">
                        Owner: <strong>{s.ownerName}</strong> · +91 {s.phone}
                      </p>
                      <p className="text-[11px] text-slate-500 font-mono-tabular mt-0.5">
                        Hub: {s.city} · Cert/GST: {s.gstin}
                      </p>
                    </div>
                    <div className="pt-2 border-t border-slate-200/70 flex items-center justify-between text-[11px] font-bold text-emerald-800">
                      <span>{s.productCount} Catalogue Products</span>
                      <span className="font-mono-tabular text-[10px] text-slate-400">
                        ID: {s.uid}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* + ADD NEW SELLER FORM (Vendor Onboarding) */}
            {showNewSellerForm && (
              <form
                onSubmit={handleRegisterNewSeller}
                className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-display text-sm sm:text-base font-extrabold text-slate-900">
                      Register / Add a New Seller (Naya Seller Onboarding Form)
                    </h3>
                    <p className="text-xs text-slate-500">
                      Enter the seller's farm/brand name and 10-digit mobile number. They can also log in directly via Mobile + OTP using this number.
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 text-[11px] font-extrabold">
                    Instant Approval
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Store / Brand Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={newSellerStore}
                      onChange={(e) => setNewSellerStore(e.target.value)}
                      placeholder="e.g. Himalayan Vedic Farms"
                      aria-label="New Seller Store Name"
                      className="w-full h-10 px-3 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Seller / Owner Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={newSellerOwner}
                      onChange={(e) => setNewSellerOwner(e.target.value)}
                      placeholder="e.g. Ramesh Verma"
                      aria-label="New Seller Owner Name"
                      className="w-full h-10 px-3 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Mobile Number (+91) *
                    </label>
                    <input
                      type="tel"
                      required
                      maxLength={10}
                      value={newSellerPhone}
                      onChange={(e) =>
                        setNewSellerPhone(e.target.value.replace(/\D/g, ''))
                      }
                      placeholder="9811223344"
                      aria-label="New Seller Mobile Number"
                      className="w-full h-10 px-3 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 font-mono-tabular focus:border-emerald-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      City / Supply Hub
                    </label>
                    <input
                      type="text"
                      value={newSellerCity}
                      onChange={(e) => setNewSellerCity(e.target.value)}
                      placeholder="e.g. Gurugram / Dehradun"
                      aria-label="New Seller City"
                      className="w-full h-10 px-3 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      GSTIN / NPOP Organic ID
                    </label>
                    <input
                      type="text"
                      value={newSellerGstin}
                      onChange={(e) => setNewSellerGstin(e.target.value)}
                      placeholder="06AABCH2026K1Z5"
                      aria-label="New Seller GSTIN"
                      className="w-full h-10 px-3 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 font-mono-tabular focus:border-emerald-600 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={sellerSubmitting}
                    className="px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-extrabold shadow-xs cursor-pointer"
                  >
                    {sellerSubmitting
                      ? 'Registering Seller...'
                      : 'Register & Activate New Seller →'}
                  </button>
                </div>
              </form>
            )}

            {/* + ADD NEW PRODUCT FOR ACTIVE SELLER FORM */}
            {showNewProductForm && (
              <form
                onSubmit={handleCreateNewProduct}
                className="p-5 rounded-2xl bg-amber-50/60 border border-amber-200 space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-display text-sm sm:text-base font-extrabold text-slate-900">
                      Publish New Product for Seller:{' '}
                      <span className="text-emerald-800">
                        {activeSellerObj?.storeName || 'Kisan Organic Collective'}
                      </span>
                    </h3>
                    <p className="text-xs text-slate-600">
                      Products published here immediately appear on the customer storefront with 2 pack size variants and live stock tracking.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Product Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={prodName}
                      onChange={(e) => setProdName(e.target.value)}
                      placeholder="e.g. Organic Pahadi Rajma (Chitra)"
                      aria-label="New Product Name"
                      className="w-full h-10 px-3 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Category *
                    </label>
                    <select
                      value={prodCatId}
                      onChange={(e) => setProdCatId(Number(e.target.value))}
                      aria-label="New Product Category"
                      className="w-full h-10 px-3 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Base Pack Unit *
                    </label>
                    <input
                      type="text"
                      required
                      value={prodUnit}
                      onChange={(e) => setProdUnit(e.target.value)}
                      placeholder="e.g. 500 g / 1 kg / 500 ml"
                      aria-label="New Product Unit"
                      className="w-full h-10 px-3 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Benefit Tag
                    </label>
                    <input
                      type="text"
                      value={prodTag}
                      onChange={(e) => setProdTag(e.target.value)}
                      placeholder="e.g. Unpolished & Zero Pesticide"
                      aria-label="New Product Benefit Tag"
                      className="w-full h-10 px-3 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      MRP (₹) *
                    </label>
                    <input
                      type="number"
                      required
                      min={15}
                      value={prodMrp}
                      onChange={(e) => setProdMrp(Number(e.target.value))}
                      aria-label="New Product MRP"
                      className="w-full h-10 px-3 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 font-mono-tabular focus:border-emerald-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Selling Price (₹) *
                    </label>
                    <input
                      type="number"
                      required
                      min={10}
                      value={prodPrice}
                      onChange={(e) => setProdPrice(Number(e.target.value))}
                      aria-label="New Product Selling Price"
                      className="w-full h-10 px-3 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 font-mono-tabular focus:border-emerald-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Initial Stock *
                    </label>
                    <input
                      type="number"
                      required
                      min={1}
                      value={prodStock}
                      onChange={(e) => setProdStock(Number(e.target.value))}
                      aria-label="New Product Initial Stock"
                      className="w-full h-10 px-3 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 font-mono-tabular focus:border-emerald-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Farm Origin
                    </label>
                    <input
                      type="text"
                      value={prodOrigin}
                      onChange={(e) => setProdOrigin(e.target.value)}
                      placeholder="e.g. Uttarakhand Organic Farms"
                      aria-label="New Product Origin"
                      className="w-full h-10 px-3 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={productSubmitting}
                    className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold shadow-xs cursor-pointer"
                  >
                    {productSubmitting
                      ? 'Publishing Product...'
                      : `Publish Product Under ${
                          activeSellerObj?.storeName || 'Seller'
                        } →`}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* 3. SELLER PANEL (New Order Alerts, Accept, Mark Packed, Manage Products & Stock) */}
      {mode === 'seller' && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Store className="w-5 h-5 text-amber-600" />
                <h2 className="font-display text-lg font-extrabold text-slate-900">
                  Incoming Dark-Store Order Alerts ({orders.length})
                </h2>
              </div>
              <span className="text-xs font-semibold text-emerald-700">
                Active Seller: {activeSellerObj?.storeName || 'Kisan Organic Collective'}
              </span>
            </div>

            {orders.length === 0 ? (
              <p className="text-xs text-slate-500 py-4">
                No active customer orders right now. Place a test order from the storefront to see instant seller alerts here.
              </p>
            ) : (
              <div className="space-y-3">
                {orders.map((ord) => (
                  <div
                    key={ord.id}
                    className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div>
                      <span className="text-xs font-extrabold text-slate-900">
                        #{ord.orderNumber} · Status: {ord.status.toUpperCase()}
                      </span>
                      <p className="text-xs text-slate-600 mt-0.5">
                        {ord.items
                          ?.map((i) => `${i.quantity}x ${i.productName}`)
                          .join(' · ')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {ord.status === 'placed' && (
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateOrderStatus(
                              ord.id,
                              'confirmed',
                              `Accepted by Seller ${
                                activeSellerObj?.storeName || 'Kisan Collective'
                              }`
                            )
                          }
                          className="px-3.5 py-1.5 rounded-xl bg-emerald-700 text-white text-xs font-extrabold"
                        >
                          Accept Order
                        </button>
                      )}
                      {ord.status === 'confirmed' && (
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateOrderStatus(
                              ord.id,
                              'packed',
                              `Packed & sealed by ${
                                activeSellerObj?.storeName || 'Seller'
                              } with organic batch tag`
                            )
                          }
                          className="px-3.5 py-1.5 rounded-xl bg-amber-600 text-white text-xs font-extrabold"
                        >
                          Mark Packed
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onSelectOrderForTracking(ord)}
                        className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-700"
                      >
                        View Tracker
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Seller Inventory & Price Manager */}
          <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs space-y-4">
            <h2 className="font-display text-lg font-extrabold text-slate-900">
              Manage Products &amp; Live Stock (Showing Latest Catalogue Items)
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs tabular-nums">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 pr-3">Product</th>
                    <th className="py-2 px-3">Seller / Brand</th>
                    <th className="py-2 px-3">Unit</th>
                    <th className="py-2 px-3">MRP (₹)</th>
                    <th className="py-2 px-3">Selling Price (₹)</th>
                    <th className="py-2 px-3">Stock</th>
                    <th className="py-2 pl-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[...products].reverse().slice(0, 20).map((p) => {
                    const draft = editingStocks[p.id] || {
                      price: p.price,
                      mrp: p.mrp,
                      stock: p.stock,
                    };
                    return (
                      <tr key={p.id}>
                        <td className="py-2.5 pr-3 font-bold text-slate-900">
                          {p.name}
                        </td>
                        <td className="py-2.5 px-3 text-emerald-800 font-semibold">
                          {p.brand}
                        </td>
                        <td className="py-2.5 px-3 text-slate-500">{p.unitLabel}</td>
                        <td className="py-2.5 px-3">
                          <input
                            type="number"
                            value={draft.mrp}
                            onChange={(e) =>
                              setEditingStocks((prev) => ({
                                ...prev,
                                [p.id]: {
                                  ...draft,
                                  mrp: Number(e.target.value),
                                },
                              }))
                            }
                            aria-label={`MRP for ${p.name}`}
                            className="w-20 h-8 px-2 rounded-lg border border-slate-200"
                          />
                        </td>
                        <td className="py-2.5 px-3">
                          <input
                            type="number"
                            value={draft.price}
                            onChange={(e) =>
                              setEditingStocks((prev) => ({
                                ...prev,
                                [p.id]: {
                                  ...draft,
                                  price: Number(e.target.value),
                                },
                              }))
                            }
                            aria-label={`Price for ${p.name}`}
                            className="w-20 h-8 px-2 rounded-lg border border-slate-200"
                          />
                        </td>
                        <td className="py-2.5 px-3">
                          <input
                            type="number"
                            value={draft.stock}
                            onChange={(e) =>
                              setEditingStocks((prev) => ({
                                ...prev,
                                [p.id]: {
                                  ...draft,
                                  stock: Number(e.target.value),
                                },
                              }))
                            }
                            aria-label={`Stock for ${p.name}`}
                            className="w-20 h-8 px-2 rounded-lg border border-slate-200"
                          />
                        </td>
                        <td className="py-2.5 pl-3">
                          <button
                            type="button"
                            onClick={() => onUpdateProductStock(p.id, draft)}
                            className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold cursor-pointer"
                          >
                            Save
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 4. ADMIN PANEL (All Orders, Assign Delivery Partner, Dispatch Status) */}
      {mode === 'admin' && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-600" />
              <h2 className="font-display text-lg font-extrabold text-slate-900">
                All Platform Orders &amp; Delivery Partner Dispatch ({orders.length})
              </h2>
            </div>

            {orders.length === 0 ? (
              <p className="text-xs text-slate-500">No platform orders yet.</p>
            ) : (
              <div className="space-y-3">
                {orders.map((ord) => (
                  <div
                    key={ord.id}
                    className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-4"
                  >
                    <div>
                      <span className="text-xs font-extrabold text-slate-900">
                        #{ord.orderNumber} · {ord.customerName} ({ord.customerPhone})
                      </span>
                      <p className="text-xs text-slate-600">
                        Partner: <strong>{ord.deliveryPartnerName}</strong> · Status:{' '}
                        <strong className="uppercase">{ord.status}</strong> · ₹
                        {ord.toPay}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {(
                        [
                          'confirmed',
                          'packed',
                          'out_for_delivery',
                          'delivered',
                        ] as const
                      ).map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() =>
                            onUpdateOrderStatus(
                              ord.id,
                              st,
                              `Updated to ${st} by Admin`
                            )
                          }
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-bold capitalize ${
                            ord.status === st
                              ? 'bg-emerald-700 text-white'
                              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          {st.replace(/_/g, ' ')}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Invoice Modal */}
      {invoiceOrder && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Tax Invoice"
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="font-display text-lg font-extrabold text-slate-900">
                  Bharat Organic — Tax Invoice
                </h3>
                <p className="text-xs text-slate-500 font-mono-tabular">
                  Invoice #{invoiceOrder.orderNumber} · GSTIN: 06AABCB9182K1Z5
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInvoiceOrder(null)}
                className="text-xs font-bold text-slate-500 hover:text-slate-800"
              >
                Close ✕
              </button>
            </div>

            <div className="text-xs space-y-1 text-slate-600">
              <p>
                <strong>Customer:</strong> {invoiceOrder.customerName} (
                {invoiceOrder.customerPhone})
              </p>
              <p>
                <strong>Delivery Address:</strong>{' '}
                {invoiceOrder.addressSnapshot.flatHouse},{' '}
                {invoiceOrder.addressSnapshot.towerBuilding},{' '}
                {invoiceOrder.addressSnapshot.city} -{' '}
                {invoiceOrder.addressSnapshot.pincode}
              </p>
            </div>

            <div className="border-t border-b border-slate-200 py-3 space-y-1.5 text-xs tabular-nums">
              {invoiceOrder.items?.map((item) => (
                <div key={item.id} className="flex justify-between">
                  <span>
                    {item.quantity} x {item.productName} ({item.unitLabel})
                  </span>
                  <span className="font-bold">₹{item.price * item.quantity}</span>
                </div>
              ))}
            </div>

            <div className="space-y-1 text-xs tabular-nums">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>₹{invoiceOrder.itemTotalPrice}</span>
              </div>
              <div className="flex justify-between">
                <span>Coupon Discount</span>
                <span>−₹{invoiceOrder.couponDiscount}</span>
              </div>
              <div className="flex justify-between">
                <span>Delivery &amp; Handling</span>
                <span>
                  ₹{invoiceOrder.deliveryFee + invoiceOrder.handlingFee}
                </span>
              </div>
              <div className="flex justify-between">
                <span>GST (Included)</span>
                <span>₹{invoiceOrder.gstAmount}</span>
              </div>
              <div className="flex justify-between text-sm font-extrabold text-slate-900 pt-2 border-t border-slate-200">
                <span>Total Paid</span>
                <span>₹{invoiceOrder.toPay}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Full Supabase SQL & Edge Functions Deliverable Modal */}
      {sqlModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Supabase SQL Schema and Edge Functions"
          className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6"
        >
          <div className="bg-slate-950 text-slate-100 rounded-3xl max-w-4xl w-full max-h-[90vh] flex flex-col border border-slate-800 shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="font-display text-lg font-extrabold text-white">
                  Supabase SQL Schema, RLS Policies &amp; Edge Functions
                </h3>
                <p className="text-xs text-slate-400">
                  13 tables, B-Tree indexes, Row-Level Security (Customer / Seller / Admin), and create-order + verify-payment Edge Functions
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSqlModalOpen(false)}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white"
              >
                Close ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 font-mono text-xs">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-emerald-400 font-bold">
                    1. Full Supabase PostgreSQL Schema + Indexes + RLS + Storage Bucket
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopyCode('sql', SUPABASE_SQL_SCHEMA)}
                    className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-white flex items-center gap-1.5"
                  >
                    {copiedTab === 'sql' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" /> Copy SQL
                      </>
                    )}
                  </button>
                </div>
                <pre className="p-4 rounded-2xl bg-slate-900 border border-slate-800 overflow-x-auto text-[11px] leading-relaxed text-slate-200 max-h-72">
                  {SUPABASE_SQL_SCHEMA}
                </pre>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-amber-400 font-bold">
                    2. Edge Function: supabase/functions/create-order/index.ts
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      handleCopyCode('create-order', EDGE_FUNCTION_CREATE_ORDER)
                    }
                    className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-white flex items-center gap-1.5"
                  >
                    {copiedTab === 'create-order' ? 'Copied' : 'Copy Code'}
                  </button>
                </div>
                <pre className="p-4 rounded-2xl bg-slate-900 border border-slate-800 overflow-x-auto text-[11px] leading-relaxed text-slate-200 max-h-60">
                  {EDGE_FUNCTION_CREATE_ORDER}
                </pre>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-blue-400 font-bold">
                    3. Edge Function: supabase/functions/verify-payment/index.ts
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      handleCopyCode('verify-payment', EDGE_FUNCTION_VERIFY_PAYMENT)
                    }
                    className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-white flex items-center gap-1.5"
                  >
                    {copiedTab === 'verify-payment' ? 'Copied' : 'Copy Code'}
                  </button>
                </div>
                <pre className="p-4 rounded-2xl bg-slate-900 border border-slate-800 overflow-x-auto text-[11px] leading-relaxed text-slate-200 max-h-60">
                  {EDGE_FUNCTION_VERIFY_PAYMENT}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
