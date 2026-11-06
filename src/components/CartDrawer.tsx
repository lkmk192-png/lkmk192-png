import React, { useState } from 'react';
import {
  ArrowLeft,
  Clock,
  Tag,
  Plus,
  Minus,
  Sparkles,
  CheckCircle2,
  CalendarClock,
  ShieldAlert,
  ChevronRight,
  ShoppingBag,
} from 'lucide-react';
import {
  CartItem,
  Coupon,
  Product,
  ProductVariant,
  UserAddress,
  UserProfile,
} from '../types/commerce.ts';
import {
  BillSummaryResult,
  resolveCartActionState,
} from '../utils/commerceRules.ts';
import { resolveProductPhoto } from '../utils/productPhotoStudio.ts';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  cartItems: CartItem[];
  bill: BillSummaryResult;
  coupons: Coupon[];
  appliedCoupon: Coupon | null;
  onApplyCoupon: (coupon: Coupon | null) => void;
  onUpdateCartItemQty: (key: string, delta: number) => void;
  onAddSuggestion: (product: Product, variant: ProductVariant | null) => void;
  suggestions: Product[];
  user: UserProfile | null;
  currentAddress: UserAddress;
  hasConfirmedAddress: boolean;
  scheduledSlot: string;
  onChangeScheduledSlot: (slot: string) => void;
  onOpenLoginModal: () => void;
  onOpenLocationModal: () => void;
  onProceedToCheckout: () => void;
}

const DELIVERY_SLOTS = [
  'Instant (21 mins)',
  'Today, 6:00 PM – 7:00 PM',
  'Tomorrow, 7:00 AM – 8:00 AM (Morning Milk & Veg Run)',
];

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  cartItems,
  bill,
  coupons,
  appliedCoupon,
  onApplyCoupon,
  onUpdateCartItemQty,
  onAddSuggestion,
  suggestions,
  user,
  currentAddress,
  hasConfirmedAddress,
  scheduledSlot,
  onChangeScheduledSlot,
  onOpenLoginModal,
  onOpenLocationModal,
  onProceedToCheckout,
}) => {
  const [showCouponsList, setShowCouponsList] = useState(false);
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);

  if (!isOpen) return null;

  const isAddressReady = hasConfirmedAddress && currentAddress.isServiceable;
  const actionState = resolveCartActionState(
    Boolean(user),
    isAddressReady,
    bill.toPay
  );

  const handlePrimaryAction = () => {
    if (actionState.state === 'LOGIN_REQUIRED') {
      onOpenLoginModal();
    } else if (actionState.state === 'ADDRESS_REQUIRED') {
      onOpenLocationModal();
    } else {
      onProceedToCheckout();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Shopping Cart"
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex justify-end"
    >
      <div className="bg-slate-50 w-full sm:max-w-md h-full flex flex-col shadow-2xl">
        {/* Sticky Cart Header */}
        <div className="bg-white px-4 py-3.5 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Cart"
              className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-800"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="font-display text-lg font-extrabold text-slate-900">
              Cart
            </h2>
          </div>
          {bill.itemCount > 0 && (
            <span className="text-xs font-bold text-slate-500 tabular-nums">
              {bill.itemCount} {bill.itemCount === 1 ? 'item' : 'items'}
            </span>
          )}
        </div>

        {/* Green Savings Strip */}
        {bill.totalSavings > 0 && (
          <div className="bg-emerald-700 text-white px-4 py-2 text-xs font-bold flex items-center justify-center gap-1.5 shrink-0 tabular-nums">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>Yay! You saved ₹{bill.totalSavings} on this order</span>
          </div>
        )}

        {/* Body Content */}
        {cartItems.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center mb-4">
              <ShoppingBag className="w-8 h-8" />
            </div>
            <h3 className="font-display text-lg font-extrabold text-slate-900">
              Your organic basket is empty
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-xs">
              Add farm-fresh vegetables, Bilona A2 ghee, unpolished dals, and freshly ground masalas to get delivery in {currentAddress.etaMinutes} minutes.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-5 px-6 py-2.5 rounded-xl bg-emerald-700 text-white text-xs font-extrabold hover:bg-emerald-800 transition-colors"
            >
              Start Shopping
            </button>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5">
            {/* Coupons & Offers Card */}
            <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 shadow-2xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                    <Tag className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-extrabold text-slate-900">
                      {appliedCoupon
                        ? `Coupon ${appliedCoupon.code} applied (₹${bill.couponDiscount} saved)`
                        : 'Use Coupons & Bank Offers'}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Extra 10% instant savings on UPI & RuPay cards
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCouponsList((prev) => !prev)}
                  className="text-xs font-extrabold text-emerald-700 hover:underline flex items-center"
                >
                  {showCouponsList ? 'Hide' : 'View coupons'}
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {showCouponsList && (
                <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
                  {coupons.map((c) => {
                    const isEligible = bill.itemTotalPrice >= c.minOrderAmount;
                    const isSelected = appliedCoupon?.code === c.code;
                    return (
                      <div
                        key={c.code}
                        className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 ${
                          isSelected
                            ? 'bg-emerald-50 border-emerald-600'
                            : 'bg-slate-50 border-slate-200'
                        }`}
                      >
                        <div>
                          <span className="text-xs font-extrabold text-slate-900 block">
                            {c.code} — {c.title}
                          </span>
                          <span className="text-[11px] text-slate-500 block">
                            {c.description}
                          </span>
                          <span className="text-[10px] font-semibold text-blue-700 block mt-0.5">
                            {c.bankOfferText}
                          </span>
                        </div>
                        {isSelected ? (
                          <button
                            type="button"
                            onClick={() => onApplyCoupon(null)}
                            className="px-2.5 py-1 rounded-lg bg-red-50 text-red-600 text-xs font-bold shrink-0"
                          >
                            Remove
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={!isEligible}
                            onClick={() => {
                              onApplyCoupon(c);
                              setShowCouponsList(false);
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-extrabold shrink-0 ${
                              isEligible
                                ? 'bg-emerald-700 text-white hover:bg-emerald-800 cursor-pointer'
                                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                            }`}
                          >
                            {isEligible ? 'APPLY' : `Add ₹${c.minOrderAmount - bill.itemTotalPrice}`}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Delivery Card + Schedule Option + Cart Item Rows */}
            <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 shadow-2xs space-y-3">
              <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm font-extrabold text-slate-900 tabular-nums">
                      Delivering in {currentAddress.etaMinutes} mins · {bill.itemCount}{' '}
                      {bill.itemCount === 1 ? 'item' : 'items'}
                    </p>
                    <p className="text-[11px] text-slate-500">{scheduledSlot}</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowSchedulePicker((prev) => !prev)}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 flex items-center gap-1"
                >
                  <CalendarClock className="w-3.5 h-3.5 text-emerald-700" />
                  Schedule
                </button>
              </div>

              {showSchedulePicker && (
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                  <p className="text-[10px] font-bold text-slate-500">
                    CHOOSE DELIVERY SLOT
                  </p>
                  {DELIVERY_SLOTS.map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => {
                        onChangeScheduledSlot(slot);
                        setShowSchedulePicker(false);
                      }}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-between ${
                        scheduledSlot === slot
                          ? 'bg-emerald-700 text-white'
                          : 'bg-white text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <span>{slot}</span>
                      {scheduledSlot === slot && <CheckCircle2 className="w-3.5 h-3.5" />}
                    </button>
                  ))}
                </div>
              )}

              {/* Itemized Cart Rows */}
              <div className="divide-y divide-slate-100">
                {cartItems.map((item) => {
                  const photo = resolveProductPhoto({
                    name: item.name,
                    slug: item.name,
                    imageUrl: item.imageUrl,
                    unitLabel: item.unitLabel,
                  });
                  const numericPrice = Number(item.price);
                  return (
                    <div
                      key={item.key}
                      className="py-2.5 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <img
                          src={photo}
                          alt={item.name}
                          className="w-12 h-12 rounded-xl object-cover bg-slate-50 border border-slate-200/70 shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900 line-clamp-2">
                            {item.name}
                          </p>
                          <p className="text-[11px] text-slate-500">{item.unitLabel}</p>
                        </div>
                      </div>

                      {/* Stepper */}
                      <div className="flex items-center bg-emerald-700 text-white rounded-xl overflow-hidden shrink-0 tabular-nums">
                        <button
                          type="button"
                          onClick={() => onUpdateCartItemQty(item.key, -1)}
                          aria-label={`Decrease quantity of ${item.name}`}
                          className="px-2 py-1 hover:bg-emerald-800"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="px-2 text-xs font-extrabold">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => onUpdateCartItemQty(item.key, 1)}
                          aria-label={`Increase quantity of ${item.name}`}
                          className="px-2 py-1 hover:bg-emerald-800"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      {/* Line Total with MRP Struck Out */}
                      <div className="text-right shrink-0 w-16 tabular-nums">
                        <span className="text-xs font-extrabold text-slate-900 block">
                          ₹{numericPrice * item.quantity}
                        </span>
                        {item.mrp > numericPrice && (
                          <span className="text-[10px] text-slate-400 line-through block">
                            ₹{item.mrp * item.quantity}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* "Forgot something? Add more items" Suggestions */}
            {suggestions.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 shadow-2xs">
                <p className="text-xs font-extrabold text-slate-900 mb-2.5">
                  Forgot something? Add more items
                </p>
                <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1">
                  {suggestions.slice(0, 5).map((sug) => (
                    <div
                      key={sug.id}
                      className="w-32 shrink-0 rounded-xl border border-slate-200 p-2 flex flex-col justify-between bg-slate-50/50"
                    >
                      <div>
                        <img
                          src={resolveProductPhoto({
                            name: sug.name,
                            slug: sug.slug,
                            imageUrl: sug.imageUrl,
                            unitLabel: sug.unitLabel,
                          })}
                          alt={sug.name}
                          className="w-full aspect-square rounded-lg object-cover mb-1.5"
                        />
                        <p className="text-[11px] font-bold text-slate-900 line-clamp-2 leading-tight">
                          {sug.name}
                        </p>
                        <span className="text-[10px] text-slate-500 block mt-0.5">
                          {sug.unitLabel}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center justify-between tabular-nums">
                        <span className="text-xs font-extrabold text-slate-900">
                          ₹{sug.price}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            onAddSuggestion(
                              sug,
                              sug.variants && sug.variants[0] ? sug.variants[0] : null
                            )
                          }
                          className="px-2 py-1 rounded-lg border border-emerald-700 text-emerald-800 hover:bg-emerald-700 hover:text-white text-[10px] font-extrabold transition-colors"
                        >
                          + ADD
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Bill Summary */}
            <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs space-y-2 text-xs tabular-nums">
              <h3 className="font-display text-sm font-extrabold text-slate-900 mb-2">
                Bill Summary
              </h3>

              <div className="flex items-center justify-between text-slate-600">
                <span>Item total</span>
                <div>
                  {bill.itemTotalMrp > bill.itemTotalPrice && (
                    <span className="text-slate-400 line-through mr-1.5">
                      ₹{bill.itemTotalMrp}
                    </span>
                  )}
                  <span className="font-bold text-slate-900">
                    ₹{bill.itemTotalPrice}
                  </span>
                </div>
              </div>

              {bill.couponDiscount > 0 && (
                <div className="flex items-center justify-between text-emerald-700 font-semibold">
                  <span>Coupon discount ({bill.couponCode})</span>
                  <span>−₹{bill.couponDiscount}</span>
                </div>
              )}

              <div className="flex items-center justify-between text-slate-600">
                <span>Delivery fee</span>
                <div>
                  {bill.deliveryFee === 0 ? (
                    <>
                      <span className="text-slate-400 line-through mr-1.5">
                        ₹{bill.deliverySavings}
                      </span>
                      <span className="font-bold text-emerald-700">FREE</span>
                    </>
                  ) : (
                    <span className="font-bold text-slate-900">
                      ₹{bill.deliveryFee}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between text-slate-600">
                <span>Handling & cold-chain fee</span>
                <div>
                  <span className="text-slate-400 line-through mr-1.5">₹15</span>
                  <span className="font-bold text-slate-900">₹{bill.handlingFee}</span>
                </div>
              </div>

              <div className="flex items-center justify-between text-slate-600">
                <span>GST & packaging charges</span>
                <span className="font-bold text-slate-900">₹{bill.gstAmount}</span>
              </div>

              <div className="pt-2.5 border-t border-slate-200 flex items-center justify-between text-sm font-extrabold text-slate-900">
                <span>To Pay</span>
                <span className="text-base">₹{bill.toPay}</span>
              </div>
            </div>

            {/* Savings Breakdown on This Order */}
            {bill.totalSavings > 0 && (
              <div className="bg-emerald-50/90 rounded-2xl border border-emerald-200 p-3.5 space-y-1.5 text-xs tabular-nums">
                <p className="font-extrabold text-emerald-950 flex items-center justify-between">
                  <span>Savings on this order</span>
                  <span>₹{bill.totalSavings}</span>
                </p>
                <div className="flex justify-between text-[11px] text-emerald-800">
                  <span>Discount on MRP</span>
                  <span>₹{bill.discountOnMrp}</span>
                </div>
                {bill.couponDiscount > 0 && (
                  <div className="flex justify-between text-[11px] text-emerald-800">
                    <span>Coupon savings ({bill.couponCode})</span>
                    <span>₹{bill.couponDiscount}</span>
                  </div>
                )}
                {bill.deliverySavings > 0 && (
                  <div className="flex justify-between text-[11px] text-emerald-800">
                    <span>FREE delivery savings</span>
                    <span>₹{bill.deliverySavings}</span>
                  </div>
                )}
                <div className="flex justify-between text-[11px] text-emerald-800">
                  <span>Savings on handling fee</span>
                  <span>₹{bill.handlingSavings}</span>
                </div>
              </div>
            )}

            {/* Cancellation Policy */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-3.5 flex items-start gap-2.5 text-[11px] text-slate-500">
              <ShieldAlert className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-slate-700 block">
                  Cancellation Policy
                </span>
                Orders can be cancelled with a 100% instant refund before they are marked Packed at our organic dark store.
              </div>
            </div>
          </div>
        )}

        {/* Sticky Bottom CTA State Machine */}
        {cartItems.length > 0 && (
          <div className="bg-white p-3.5 border-t border-slate-200 shrink-0 space-y-2">
            {user && (
              <div className="flex items-center justify-between text-xs px-1">
                <span className="text-slate-500 truncate max-w-[240px]">
                  Delivering to{' '}
                  <strong className="text-slate-800">
                    {currentAddress.label}: {currentAddress.flatHouse},{' '}
                    {currentAddress.towerBuilding}
                  </strong>
                </span>
                <button
                  type="button"
                  onClick={onOpenLocationModal}
                  className="text-emerald-700 font-bold hover:underline shrink-0"
                >
                  Change
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={handlePrimaryAction}
              className="w-full h-13 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-sm sm:text-base shadow-md flex items-center justify-between px-5 transition-colors cursor-pointer tabular-nums"
            >
              <div className="text-left">
                <span className="block text-xs font-medium text-emerald-100">
                  TOTAL TO PAY
                </span>
                <span className="text-base font-extrabold">₹{bill.toPay}</span>
              </div>
              <span className="flex items-center gap-1.5">
                {actionState.label}
                <ChevronRight className="w-4 h-4" />
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
