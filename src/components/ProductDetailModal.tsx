import React, { useState } from 'react';
import {
  X,
  Clock,
  Star,
  ShieldCheck,
  MapPin,
  Calendar,
  Sparkles,
  Plus,
  Minus,
} from 'lucide-react';
import { Product, ProductVariant } from '../types/commerce.ts';
import { resolveProductPhoto } from '../utils/productPhotoStudio.ts';
import { ProductCard } from './ProductCard.tsx';

interface ProductDetailModalProps {
  product: Product | null;
  onClose: () => void;
  etaMinutes: number;
  getQuantity: (productId: number, variantId: number | null) => number;
  onUpdateQuantity: (
    product: Product,
    variant: ProductVariant | null,
    delta: number
  ) => void;
  allProducts: Product[];
  onSelectProduct: (product: Product) => void;
  wishlistIds: number[];
  onToggleWishlist: (productId: number) => void;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  product,
  onClose,
  etaMinutes,
  getQuantity,
  onUpdateQuantity,
  allProducts,
  onSelectProduct,
  wishlistIds,
  onToggleWishlist,
}) => {
  if (!product) return null;

  const defaultVariant =
    product.variants && product.variants.length > 0
      ? product.variants.find((v) => v.isDefault) || product.variants[0]
      : null;

  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(
    defaultVariant
  );
  const [selectedPhotoIdx, setSelectedPhotoIdx] = useState<number>(0);

  const activeUnit = selectedVariant ? selectedVariant.unitLabel : product.unitLabel;
  const activePrice = selectedVariant ? selectedVariant.price : product.price;
  const activeMrp = selectedVariant ? selectedVariant.mrp : product.mrp;
  const activeDiscount = selectedVariant
    ? selectedVariant.discountPct
    : product.discountPct;
  const qty = getQuantity(product.id, selectedVariant ? selectedVariant.id : null);

  const galleryPhotos =
    Array.isArray(product.galleryUrls) && product.galleryUrls.length > 0
      ? product.galleryUrls
      : [
          resolveProductPhoto({
            name: product.name,
            slug: product.slug,
            imageUrl: product.imageUrl,
            unitLabel: activeUnit,
          }),
        ];

  const photoSrc = galleryPhotos[selectedPhotoIdx] || galleryPhotos[0];

  const similarProducts = allProducts
    .filter((p) => p.categoryId === product.categoryId && p.id !== product.id)
    .slice(0, 4);

  const alsoBoughtProducts = allProducts
    .filter((p) => p.categoryId !== product.categoryId && p.isBestSeller)
    .slice(0, 4);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={product.name}
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto"
    >
      <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[92vh] overflow-y-auto shadow-2xl border border-slate-200">
        {/* Top Bar */}
        <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-xs px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            <span className="text-emerald-700 font-bold">{product.brand}</span>
            <span>·</span>
            <span>{product.tag}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close product detail"
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 sm:p-7">
          {/* Contiguous Purchase Module (2-Column Split) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 items-start">
            {/* Left: Original Product Gallery */}
            <div className="space-y-2.5">
              <div className="relative aspect-square rounded-2xl bg-slate-50 border border-slate-200/80 overflow-hidden">
                {activeDiscount > 0 && (
                  <div className="absolute top-3 left-3 z-10 bg-blue-600 text-white text-xs font-extrabold px-2.5 py-1 rounded-lg">
                    {activeDiscount}% OFF
                  </div>
                )}
                <img
                  src={photoSrc}
                  alt={product.name}
                  className="w-full h-full object-cover"
                />
              </div>
              {galleryPhotos.length > 1 && (
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {galleryPhotos.map((gUrl, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setSelectedPhotoIdx(idx)}
                      className={`w-14 h-14 rounded-xl border-2 overflow-hidden shrink-0 cursor-pointer ${
                        selectedPhotoIdx === idx
                          ? 'border-emerald-600'
                          : 'border-slate-200 opacity-75 hover:opacity-100'
                      }`}
                    >
                      <img
                        src={gUrl}
                        alt={`${product.name} photo ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Right: Purchase Details, Unit Selector & Benefits */}
            <div className="space-y-4">
              <div className="flex items-center gap-2.5 text-xs font-semibold text-slate-600">
                <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-800 px-2.5 py-1 rounded-lg font-bold">
                  <Clock className="w-3.5 h-3.5" />
                  Delivering in {etaMinutes} mins
                </span>
                <span className="inline-flex items-center gap-1 text-slate-700">
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  {product.rating.toFixed(1)} ({product.reviewCount} ratings)
                </span>
              </div>

              <h2 className="font-display text-xl sm:text-2xl font-extrabold text-slate-900 leading-tight">
                {product.name}
              </h2>

              {/* Unit Selector */}
              {product.variants && product.variants.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-slate-500 mb-2">
                    SELECT UNIT / PACK SIZE
                  </p>
                  <div className="grid grid-cols-2 gap-2.5">
                    {product.variants.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setSelectedVariant(v)}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          selectedVariant?.id === v.id
                            ? 'border-emerald-700 bg-emerald-50/70 ring-1 ring-emerald-700'
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <span className="text-xs font-bold text-slate-900 block">
                          {v.unitLabel}
                        </span>
                        <div className="mt-1 flex items-baseline gap-1.5 tabular-nums">
                          <span className="text-sm font-extrabold text-slate-900">
                            ₹{v.price}
                          </span>
                          <span className="text-xs text-slate-400 line-through">
                            ₹{v.mrp}
                          </span>
                          <span className="text-[10px] font-bold text-blue-600">
                            {v.discountPct}% OFF
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Price & Primary Add CTA */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-4">
                <div className="tabular-nums">
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-extrabold text-slate-900">
                      ₹{activePrice}
                    </span>
                    <span className="text-sm text-slate-400 line-through">
                      MRP ₹{activeMrp}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Inclusive of all taxes · Net Qty: {activeUnit}
                  </p>
                </div>

                {qty === 0 ? (
                  <button
                    type="button"
                    onClick={() => onUpdateQuantity(product, selectedVariant, 1)}
                    className="px-6 py-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-sm shadow-sm transition-colors cursor-pointer"
                  >
                    ADD TO CART
                  </button>
                ) : (
                  <div className="flex items-center bg-emerald-700 text-white rounded-xl overflow-hidden shadow-sm tabular-nums">
                    <button
                      type="button"
                      onClick={() => onUpdateQuantity(product, selectedVariant, -1)}
                      aria-label="Decrease quantity"
                      className="px-3.5 py-3 hover:bg-emerald-800 transition-colors"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="px-4 text-sm font-extrabold">{qty}</span>
                    <button
                      type="button"
                      onClick={() => onUpdateQuantity(product, selectedVariant, 1)}
                      aria-label="Increase quantity"
                      className="px-3.5 py-3 hover:bg-emerald-800 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Product Highlights: Description, Benefits, Shelf Life, Origin */}
              <div className="space-y-3 pt-2 border-t border-slate-100 text-xs sm:text-sm text-slate-700">
                <div>
                  <h4 className="font-bold text-slate-900 mb-1">Why Bharat Organic?</h4>
                  <p className="text-slate-600 leading-relaxed">{product.description}</p>
                </div>

                <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/70 flex items-start gap-2.5">
                  <Sparkles className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-amber-950 block text-xs">
                      Nutritional & Wellness Benefits
                    </span>
                    <span className="text-xs text-amber-900">{product.benefits}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/70 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-emerald-700 shrink-0" />
                    <div>
                      <span className="text-[10px] font-semibold text-slate-500 block">
                        SHELF LIFE
                      </span>
                      <span className="text-xs font-bold text-slate-900">
                        {product.shelfLife}
                      </span>
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/70 flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-emerald-700 shrink-0" />
                    <div className="min-w-0">
                      <span className="text-[10px] font-semibold text-slate-500 block">
                        FARM ORIGIN
                      </span>
                      <span className="text-xs font-bold text-slate-900 truncate block">
                        {product.origin}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-emerald-800 font-semibold pt-1">
                  <ShieldCheck className="w-4 h-4 text-emerald-700" />
                  <span>NPOP & FSSAI Jaivik Bharat Certified · Zero Chemical Residue</span>
                </div>
              </div>
            </div>
          </div>

          {/* Similar Products Row */}
          {similarProducts.length > 0 && (
            <div className="mt-8 pt-6 border-t border-slate-200">
              <h3 className="font-display text-lg font-extrabold text-slate-900 mb-3">
                Similar Products
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {similarProducts.map((sim) => (
                  <ProductCard
                    key={sim.id}
                    product={sim}
                    etaMinutes={etaMinutes}
                    getQuantity={getQuantity}
                    onUpdateQuantity={onUpdateQuantity}
                    onOpenDetail={onSelectProduct}
                    isWishlisted={wishlistIds.includes(sim.id)}
                    onToggleWishlist={onToggleWishlist}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Customers Also Bought Row */}
          {alsoBoughtProducts.length > 0 && (
            <div className="mt-6 pt-6 border-t border-slate-200">
              <h3 className="font-display text-lg font-extrabold text-slate-900 mb-3">
                Customers Also Bought
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {alsoBoughtProducts.map((ab) => (
                  <ProductCard
                    key={ab.id}
                    product={ab}
                    etaMinutes={etaMinutes}
                    getQuantity={getQuantity}
                    onUpdateQuantity={onUpdateQuantity}
                    onOpenDetail={onSelectProduct}
                    isWishlisted={wishlistIds.includes(ab.id)}
                    onToggleWishlist={onToggleWishlist}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
