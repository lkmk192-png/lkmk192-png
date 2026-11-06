import React, { useState } from 'react';
import {
  X,
  ShieldCheck,
  Smartphone,
  CreditCard,
  Landmark,
  Banknote,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import {
  CartItem,
  Coupon,
  OrderRecord,
  UserAddress,
  UserProfile,
} from '../types/commerce.ts';
import { BillSummaryResult } from '../utils/commerceRules.ts';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  cartItems: CartItem[];
  bill: BillSummaryResult;
  appliedCoupon: Coupon | null;
  user: UserProfile;
  authToken: string;
  currentAddress: UserAddress;
  scheduledSlot: string;
  onOrderCompleted: (order: OrderRecord) => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen,
  onClose,
  cartItems,
  bill,
  appliedCoupon,
  user,
  authToken,
  currentAddress,
  scheduledSlot,
  onOrderCompleted,
}) => {
  const [paymentMethod, setPaymentMethod] = useState<
    'upi' | 'card' | 'netbanking' | 'cod'
  >('upi');
  const [selectedUpiApp, setSelectedUpiApp] = useState<
    'GPay' | 'PhonePe' | 'Paytm'
  >('GPay');
  const [upiId, setUpiId] = useState('organic@okaxis');
  const [processing, setProcessing] = useState(false);
  const [paymentFailedOrder, setPaymentFailedOrder] = useState<OrderRecord | null>(
    null
  );
  const [errorMsg, setErrorMsg] = useState('');
  const [successOrder, setSuccessOrder] = useState<OrderRecord | null>(null);
  const [idempotencyKey] = useState(
    () => `idem_${user.uid}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  );

  if (!isOpen) return null;

  const razorpayTestKey =
    import.meta.env.VITE_RAZORPAY_KEY_ID || 'rzp_test_BharatOrganicDemoKey';

  const executeOrderAndPayment = async (
    methodOverride?: 'upi' | 'card' | 'netbanking' | 'cod',
    simulateFailure = false
  ) => {
    const activeMethod = methodOverride || paymentMethod;
    setProcessing(true);
    setErrorMsg('');

    try {
      // Step 1: Server-side create-order Edge Function equivalent
      // Recalculates prices, stock, coupons, delivery & handling fees from database
      const createRes = await fetch('/api/edge/create-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          idempotencyKey:
            paymentFailedOrder || methodOverride
              ? `${idempotencyKey}_retry_${Date.now()}`
              : idempotencyKey,
          customerPhone: user.phone ? `+91 ${user.phone}` : '+91 9876543210',
          customerName: user.fullName,
          addressSnapshot: currentAddress,
          items: cartItems.map((i) => ({
            productId: i.productId,
            variantId: i.variantId,
            quantity: i.quantity,
          })),
          couponCode: appliedCoupon ? appliedCoupon.code : null,
          paymentMethod: activeMethod,
          scheduledSlot,
        }),
      });

      const createData = await createRes.json();
      if (!createRes.ok) {
        throw new Error(createData.error || 'Could not create order');
      }

      const createdOrder: OrderRecord = {
        ...createData.order,
        items: createData.items || [],
        history: createData.history || [],
      };

      // If Cash on Delivery, order is already confirmed
      if (activeMethod === 'cod') {
        setPaymentFailedOrder(null);
        setSuccessOrder(createdOrder);
        setTimeout(() => {
          onOrderCompleted(createdOrder);
        }, 1600);
        return;
      }

      // Step 2: Server-side verify-payment Edge Function equivalent (Razorpay Test Mode)
      const verifyRes = await fetch('/api/edge/verify-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          orderId: createdOrder.id,
          razorpayOrderId:
            createdOrder.razorpayOrderId || `order_rzp_${createdOrder.id}`,
          razorpayPaymentId: `pay_test_${Date.now()}`,
          razorpaySignature: `sig_test_verified_${createdOrder.id}`,
          simulateFailure,
        }),
      });

      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) {
        throw new Error(verifyData.error || 'Payment verification failed');
      }

      if (!verifyData.verified) {
        // Payment failed — keep cart intact and offer Retry or COD!
        setPaymentFailedOrder({
          ...verifyData.order,
          items: createdOrder.items,
          history: createdOrder.history,
        });
        setErrorMsg(
          'Payment declined in test simulation. Your cart is safe — retry UPI/Card or switch to Cash on Delivery.'
        );
        return;
      }

      const verifiedOrder: OrderRecord = {
        ...verifyData.order,
        items: verifyData.items || createdOrder.items,
        history: verifyData.history || createdOrder.history,
      };

      setPaymentFailedOrder(null);
      setSuccessOrder(verifiedOrder);
      setTimeout(() => {
        onOrderCompleted(verifiedOrder);
      }, 450);
    } catch (err: any) {
      setErrorMsg(err.message || 'Network or stock issue. Your cart is preserved.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Checkout and Payment"
      className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
    >
      <div className="bg-white rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-slate-200">
        {successOrder ? (
          /* Order Success Screen */
          <div className="py-8 text-center space-y-4">
            <div className="w-20 h-20 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-11 h-11" />
            </div>
            <div>
              <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-700">
                Order Confirmed
              </span>
              <h2 className="font-display text-2xl font-extrabold text-slate-900 mt-1">
                Arriving in {successOrder.etaMinutes} minutes!
              </h2>
              <p className="text-xs text-slate-500 mt-1 font-mono-tabular">
                Order ID: {successOrder.orderNumber} · Paid: ₹{successOrder.toPay}
              </p>
            </div>
            <p className="text-xs text-slate-600 max-w-xs mx-auto">
              Redirecting to live dark-store packing &amp; delivery partner tracker...
            </p>
            <button
              type="button"
              onClick={() => onOrderCompleted(successOrder)}
              className="px-6 py-2.5 rounded-xl bg-emerald-700 text-white text-xs font-extrabold"
            >
              Open Live Tracking Now →
            </button>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h2 className="font-display text-lg font-extrabold text-slate-900">
                  Payment Options
                </h2>
                <p className="text-xs text-slate-500 tabular-nums">
                  To Pay: <strong className="text-slate-900">₹{bill.toPay}</strong> ·
                  Razorpay Test Gateway ({razorpayTestKey.slice(0, 14)}…)
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close payment modal"
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Payment Failure Recovery Banner (Keeps Cart & Offers Retry or COD) */}
            {errorMsg && (
              <div className="mt-4 p-3.5 rounded-2xl bg-red-50 border border-red-200 space-y-2.5">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-extrabold text-red-950">
                      Payment / Order Alert
                    </p>
                    <p className="text-xs text-red-800 mt-0.5">{errorMsg}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    disabled={processing}
                    onClick={() => executeOrderAndPayment(paymentMethod, false)}
                    className="px-3.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-extrabold flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Retry Payment
                  </button>
                  <button
                    type="button"
                    disabled={processing}
                    onClick={() => {
                      setPaymentMethod('cod');
                      executeOrderAndPayment('cod', false);
                    }}
                    className="px-3.5 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-extrabold cursor-pointer"
                  >
                    Switch to Cash on Delivery
                  </button>
                </div>
              </div>
            )}

            {/* Payment Method Tabs */}
            <div className="mt-4 space-y-3">
              {/* 1. UPI (GPay / PhonePe / Paytm) */}
              <div
                onClick={() => setPaymentMethod('upi')}
                className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
                  paymentMethod === 'upi'
                    ? 'border-emerald-700 bg-emerald-50/50 ring-1 ring-emerald-700'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Smartphone className="w-5 h-5 text-emerald-700" />
                    <div>
                      <span className="text-xs sm:text-sm font-extrabold text-slate-900 block">
                        UPI (GPay / PhonePe / Paytm)
                      </span>
                      <span className="text-[11px] text-emerald-800 font-medium">
                        Instant confirmation · Zero convenience fee
                      </span>
                    </div>
                  </div>
                  <input
                    type="radio"
                    checked={paymentMethod === 'upi'}
                    onChange={() => setPaymentMethod('upi')}
                    aria-label="Pay via UPI"
                    className="accent-emerald-700"
                  />
                </div>

                {paymentMethod === 'upi' && (
                  <div className="mt-3 pt-3 border-t border-emerald-200/60 space-y-2.5">
                    <div className="grid grid-cols-3 gap-2">
                      {(['GPay', 'PhonePe', 'Paytm'] as const).map((app) => (
                        <button
                          key={app}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedUpiApp(app);
                          }}
                          className={`py-2 rounded-xl text-xs font-extrabold border transition-colors ${
                            selectedUpiApp === app
                              ? 'bg-emerald-700 text-white border-emerald-700'
                              : 'bg-white text-slate-700 border-slate-200'
                          }`}
                        >
                          {app}
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      value={upiId}
                      onChange={(e) => setUpiId(e.target.value)}
                      placeholder="Enter UPI ID (e.g. name@okicici)"
                      aria-label="UPI ID"
                      className="w-full h-9 px-3 rounded-xl bg-white border border-slate-200 text-xs font-mono-tabular text-slate-800"
                    />
                  </div>
                )}
              </div>

              {/* 2. Credit / Debit Cards */}
              <div
                onClick={() => setPaymentMethod('card')}
                className={`p-3.5 rounded-2xl border cursor-pointer flex items-center justify-between transition-all ${
                  paymentMethod === 'card'
                    ? 'border-emerald-700 bg-emerald-50/50 ring-1 ring-emerald-700'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <CreditCard className="w-5 h-5 text-blue-600" />
                  <div>
                    <span className="text-xs sm:text-sm font-extrabold text-slate-900 block">
                      Credit / Debit Cards (Visa, Mastercard, RuPay)
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Razorpay Test Card · 4111 •••• •••• 1111
                    </span>
                  </div>
                </div>
                <input
                  type="radio"
                  checked={paymentMethod === 'card'}
                  onChange={() => setPaymentMethod('card')}
                  aria-label="Pay via Card"
                  className="accent-emerald-700"
                />
              </div>

              {/* 3. Net Banking */}
              <div
                onClick={() => setPaymentMethod('netbanking')}
                className={`p-3.5 rounded-2xl border cursor-pointer flex items-center justify-between transition-all ${
                  paymentMethod === 'netbanking'
                    ? 'border-emerald-700 bg-emerald-50/50 ring-1 ring-emerald-700'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Landmark className="w-5 h-5 text-amber-600" />
                  <div>
                    <span className="text-xs sm:text-sm font-extrabold text-slate-900 block">
                      Net Banking (HDFC, ICICI, SBI, Axis)
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Instant Razorpay Test Bank verification
                    </span>
                  </div>
                </div>
                <input
                  type="radio"
                  checked={paymentMethod === 'netbanking'}
                  onChange={() => setPaymentMethod('netbanking')}
                  aria-label="Pay via Net Banking"
                  className="accent-emerald-700"
                />
              </div>

              {/* 4. Cash on Delivery */}
              <div
                onClick={() => setPaymentMethod('cod')}
                className={`p-3.5 rounded-2xl border cursor-pointer flex items-center justify-between transition-all ${
                  paymentMethod === 'cod'
                    ? 'border-emerald-700 bg-emerald-50/50 ring-1 ring-emerald-700'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Banknote className="w-5 h-5 text-emerald-700" />
                  <div>
                    <span className="text-xs sm:text-sm font-extrabold text-slate-900 block">
                      Cash / UPI on Delivery (COD)
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Pay by cash or scan QR at your doorstep
                    </span>
                  </div>
                </div>
                <input
                  type="radio"
                  checked={paymentMethod === 'cod'}
                  onChange={() => setPaymentMethod('cod')}
                  aria-label="Cash on Delivery"
                  className="accent-emerald-700"
                />
              </div>
            </div>

            {/* Security Note & Primary Pay CTA */}
            <div className="mt-5 pt-4 border-t border-slate-100 space-y-2.5">
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span className="flex items-center gap-1 text-emerald-800 font-semibold">
                  <ShieldCheck className="w-4 h-4 text-emerald-700" />
                  Server-verified prices &amp; HMAC signature check
                </span>
                {paymentMethod !== 'cod' && (
                  <button
                    type="button"
                    disabled={processing}
                    onClick={() => executeOrderAndPayment(paymentMethod, true)}
                    className="text-slate-400 hover:text-slate-600 underline"
                  >
                    Simulate failure
                  </button>
                )}
              </div>

              <button
                type="button"
                disabled={processing}
                onClick={() => executeOrderAndPayment(paymentMethod, false)}
                className="w-full h-12 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-sm shadow-md transition-colors cursor-pointer tabular-nums"
              >
                {processing
                  ? 'Verifying Order & Stock on Server...'
                  : paymentMethod === 'cod'
                  ? `Place COD Order · ₹${bill.toPay}`
                  : `Pay ₹${bill.toPay} via ${
                      paymentMethod === 'upi' ? selectedUpiApp : paymentMethod.toUpperCase()
                    } (Test Mode)`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
