import React, { useState } from 'react';
import { Heart, Clock, Star, Plus, Minus, ChevronDown } from 'lucide-react';
import { Product, ProductVariant } from '../types/commerce.ts';
import { resolveProductPhoto } from '../utils/productPhotoStudio.ts';

interface ProductCardProps {
  product: Product;
  etaMinutes: number;
  getQuantity: (productId: number, variantId: number | null) => number;
  onUpdateQuantity: (
    product: Product,
    variant: ProductVariant | null,
    delta: number
  ) => void;
  onOpenDetail: (product: Product) => void;
  isWishlisted: boolean;
  onToggleWishlist: (productId: number) => void;
}

export const ProductCard: React.FC<ProductCardProps> = React.memo(
  ({
    product,
    etaMinutes,
    getQuantity,
    onUpdateQuantity,
    onOpenDetail,
    isWishlisted,
    onToggleWishlist,
  }) => {
    const defaultVariant =
      product.variants && product.variants.length > 0
        ? product.variants.find((v) => v.isDefault) || product.variants[0]
        : null;

    const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(
      defaultVariant
    );
    const [showVariantSheet, setShowVariantSheet] = useState(false);

    const activeUnit = selectedVariant ? selectedVariant.unitLabel : product.unitLabel;
    const activePrice = selectedVariant ? selectedVariant.price : product.price;
    const activeMrp = selectedVariant ? selectedVariant.mrp : product.mrp;
    const activeDiscount = selectedVariant
      ? selectedVariant.discountPct
      : product.discountPct;
    const activeStock = selectedVariant ? selectedVariant.stock : product.stock;

    const qty = getQuantity(product.id, selectedVariant ? selectedVariant.id : null);
    const hasMultipleOptions = product.variants && product.variants.length > 1;
    const photoSrc = resolveProductPhoto({
      name: product.name,
      slug: product.slug,
      imageUrl: product.imageUrl,
      unitLabel: activeUnit,
    });

    return (
      <article className="group relative bg-white rounded-2xl border border-slate-200/90 p-3 flex flex-col justify-between transition-all duration-150 hover:shadow-md hover:border-emerald-600/30">
        {/* Top Section: Image + Discount Badge + Wishlist + Veg Dot */}
        <div>
          <div className="relative aspect-square w-full rounded-xl bg-slate-50 overflow-hidden mb-2.5">
            {/* Blue "XX% OFF" Badge at Top-Left */}
            {activeDiscount > 0 && (
              <div className="absolute top-0 left-2 z-10 bg-blue-600 text-white text-[10px] font-extrabold px-1.5 py-1 rounded-b-md shadow-xs leading-none tabular-nums">
                {activeDiscount}% OFF
              </div>
            )}

            {/* Heart / Wishlist Icon at Top-Right */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleWishlist(product.id);
              }}
              aria-label={
                isWishlisted
                  ? `Remove ${product.name} from wishlist`
                  : `Add ${product.name} to wishlist`
              }
              className="absolute top-2 right-2 z-10 w-7 h-7 rounded-full bg-white/90 hover:bg-white shadow-xs flex items-center justify-center text-slate-500 hover:text-rose-600 transition-colors"
            >
              <Heart
                className={`w-3.5 h-3.5 ${
                  isWishlisted ? 'fill-rose-500 text-rose-500' : ''
                }`}
              />
            </button>

            {/* Veg Dot at Bottom-Left of Photo */}
            {product.isVeg && (
              <div
                title="100% Vegetarian & Certified Organic"
                className="absolute bottom-2 left-2 z-10 w-4 h-4 rounded-xs bg-white border border-emerald-700 flex items-center justify-center"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-700" />
              </div>
            )}

            {/* Clickable Product Image */}
            <button
              type="button"
              onClick={() => onOpenDetail(product)}
              className="w-full h-full block focus:outline-none"
              aria-label={`View details for ${product.name}`}
            >
              <img
                src={photoSrc}
                alt={product.name}
                width={260}
                height={260}
                loading="lazy"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-200"
              />
            </button>
          </div>

          {/* ETA Chip + Rating Line */}
          <div className="flex items-center justify-between gap-1 mb-1">
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded-md tabular-nums">
              <Clock className="w-2.5 h-2.5 text-emerald-700" />
              {etaMinutes} MINS
            </span>

            <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-slate-600 tabular-nums">
              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
              {product.rating.toFixed(1)}
              <span className="text-slate-400 text-[10px]">({product.reviewCount})</span>
            </span>
          </div>

          {/* Benefit Tag */}
          <p className="text-[11px] font-medium text-emerald-800 truncate mb-1">
            {product.tag}
          </p>

          {/* Product Name (2-line clamp) */}
          <button
            type="button"
            onClick={() => onOpenDetail(product)}
            className="text-left block w-full focus:outline-none"
          >
            <h3 className="text-[13.5px] font-semibold text-slate-900 leading-snug line-clamp-2 min-h-[38px] group-hover:text-emerald-800 transition-colors">
              {product.name}
            </h3>
          </button>
        </div>

        {/* Bottom Section: Unit Selector + Price/MRP + ADD / Stepper Button */}
        <div className="mt-2 pt-2 border-t border-slate-100">
          {/* Unit / Size Selector */}
          <div className="mb-2">
            {hasMultipleOptions ? (
              <button
                type="button"
                onClick={() => setShowVariantSheet((prev) => !prev)}
                aria-label={`Select pack size for ${product.name}, current ${activeUnit}`}
                className="w-full flex items-center justify-between px-2 py-1 rounded-lg bg-slate-50 hover:bg-slate-100 text-xs font-medium text-slate-700 transition-colors"
              >
                <span className="truncate">{activeUnit}</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              </button>
            ) : (
              <span className="text-xs font-medium text-slate-500 block px-0.5">
                {activeUnit}
              </span>
            )}
          </div>

          {/* Inline Variant Bottom Sheet / Popover */}
          {showVariantSheet && hasMultipleOptions && (
            <div className="mb-2.5 p-2 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
              <p className="text-[10px] font-bold text-slate-500 px-1">
                CHOOSE PACK SIZE
              </p>
              {product.variants.map((v) => {
                const vQty = getQuantity(product.id, v.id);
                return (
                  <div
                    key={v.id}
                    onClick={() => {
                      setSelectedVariant(v);
                      setShowVariantSheet(false);
                    }}
                    className={`flex items-center justify-between p-1.5 rounded-lg cursor-pointer text-xs ${
                      selectedVariant?.id === v.id
                        ? 'bg-emerald-50 border border-emerald-600/40'
                        : 'bg-white border border-slate-200/80 hover:bg-slate-100'
                    }`}
                  >
                    <div>
                      <span className="font-semibold text-slate-900 block">
                        {v.unitLabel}
                      </span>
                      <span className="font-bold text-slate-900 tabular-nums">
                        ₹{v.price}
                      </span>
                      <span className="text-[10px] text-slate-400 line-through ml-1 tabular-nums">
                        ₹{v.mrp}
                      </span>
                    </div>
                    {vQty > 0 ? (
                      <span className="px-2 py-0.5 rounded-md bg-emerald-700 text-white text-[11px] font-bold tabular-nums">
                        {vQty} in cart
                      </span>
                    ) : (
                      <span className="text-[11px] font-bold text-emerald-700">
                        Select
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Price + ADD / Stepper Row */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-col leading-tight tabular-nums">
              <span className="text-sm font-extrabold text-slate-900">
                ₹{activePrice}
              </span>
              {activeMrp > activePrice && (
                <span className="text-[11px] text-slate-400 line-through">
                  MRP ₹{activeMrp}
                </span>
              )}
            </div>

            {activeStock <= 0 ? (
              <span className="px-2.5 py-1.5 rounded-xl bg-slate-100 text-slate-400 text-xs font-semibold">
                Out of Stock
              </span>
            ) : qty === 0 ? (
              <button
                type="button"
                onClick={() => onUpdateQuantity(product, selectedVariant, 1)}
                aria-label={`Add ${product.name} to cart`}
                className="relative px-3.5 py-1.5 rounded-xl border-2 border-emerald-700 bg-emerald-50/60 hover:bg-emerald-700 text-emerald-800 hover:text-white font-extrabold text-xs tracking-wide transition-all cursor-pointer shrink-0"
              >
                <span>ADD</span>
                {hasMultipleOptions && (
                  <span className="block text-[9px] font-medium opacity-80 leading-none mt-0.5">
                    {product.variants.length} options
                  </span>
                )}
              </button>
            ) : (
              <div className="flex items-center bg-emerald-700 text-white rounded-xl overflow-hidden shadow-xs shrink-0 tabular-nums">
                <button
                  type="button"
                  onClick={() => onUpdateQuantity(product, selectedVariant, -1)}
                  aria-label={`Decrease quantity of ${product.name}`}
                  className="px-2.5 py-1.5 hover:bg-emerald-800 transition-colors cursor-pointer"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="px-2 text-xs font-extrabold min-w-[22px] text-center">
                  {qty}
                </span>
                <button
                  type="button"
                  onClick={() => onUpdateQuantity(product, selectedVariant, 1)}
                  aria-label={`Increase quantity of ${product.name}`}
                  className="px-2.5 py-1.5 hover:bg-emerald-800 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </article>
    );
  }
);
