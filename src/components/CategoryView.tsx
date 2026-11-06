import React, { useState, useEffect, useRef } from 'react';
import {
  ChevronRight,
  Leaf,
  Sparkles,
  Sun,
  ShieldCheck,
  Droplet,
  Flame,
  Award,
  Heart,
  ShoppingBag,
  Layers,
  Loader2,
  SlidersHorizontal,
} from 'lucide-react';
import {
  Category,
  Product,
  ProductVariant,
  Subcategory,
} from '../types/commerce.ts';
import { ProductCard } from './ProductCard.tsx';
import { resolveProductPhoto } from '../utils/productPhotoStudio.ts';

interface CategoryViewProps {
  category: Category;
  allCategories: Category[];
  subcategories: Subcategory[];
  products: Product[];
  etaMinutes: number;
  getQuantity: (productId: number, variantId: number | null) => number;
  onUpdateQuantity: (
    product: Product,
    variant: ProductVariant | null,
    delta: number
  ) => void;
  onOpenDetail: (product: Product) => void;
  onSelectCategory: (category: Category) => void;
  onBackHome: () => void;
  wishlistIds: number[];
  onToggleWishlist: (productId: number) => void;
}

function renderSubIcon(iconName: string, isActive: boolean) {
  const cls = `w-4 h-4 ${isActive ? 'text-emerald-700' : 'text-slate-500'}`;
  switch (iconName) {
    case 'Sparkles':
      return <Sparkles className={cls} />;
    case 'Sun':
      return <Sun className={cls} />;
    case 'ShieldCheck':
      return <ShieldCheck className={cls} />;
    case 'Droplet':
      return <Droplet className={cls} />;
    case 'Flame':
      return <Flame className={cls} />;
    case 'Award':
      return <Award className={cls} />;
    case 'Heart':
      return <Heart className={cls} />;
    case 'ShoppingBag':
      return <ShoppingBag className={cls} />;
    case 'Layers':
      return <Layers className={cls} />;
    default:
      return <Leaf className={cls} />;
  }
}

export const CategoryView: React.FC<CategoryViewProps> = ({
  category,
  allCategories,
  subcategories,
  products,
  etaMinutes,
  getQuantity,
  onUpdateQuantity,
  onOpenDetail,
  onSelectCategory,
  onBackHome,
  wishlistIds,
  onToggleWishlist,
}) => {
  const [activeSubId, setActiveSubId] = useState<number | 'all'>('all');
  const [sortBy, setSortBy] = useState<
    'popular' | 'price_asc' | 'price_desc' | 'rating' | 'discount'
  >('popular');
  const [visibleCount, setVisibleCount] = useState(20);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setActiveSubId('all');
    setVisibleCount(20);
  }, [category.id]);

  const catSubcategories = subcategories.filter(
    (s) => s.categoryId === category.id
  );

  const catProducts = products.filter((p) => {
    if (p.categoryId !== category.id) return false;
    if (activeSubId !== 'all' && p.subcategoryId !== activeSubId) return false;
    return true;
  });

  const sortedProducts = [...catProducts].sort((a, b) => {
    if (sortBy === 'price_asc') return a.price - b.price;
    if (sortBy === 'price_desc') return b.price - a.price;
    if (sortBy === 'rating') return b.rating - a.rating;
    if (sortBy === 'discount') return b.discountPct - a.discountPct;
    return Number(b.isBestSeller) - Number(a.isBestSeller);
  });

  const visibleProducts = sortedProducts.slice(0, visibleCount);

  // Infinite scroll observer (20 items per page)
  useEffect(() => {
    if (!sentinelRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0].isIntersecting &&
          visibleCount < sortedProducts.length &&
          !loadingMore
        ) {
          setLoadingMore(true);
          setTimeout(() => {
            setVisibleCount((prev) => prev + 20);
            setLoadingMore(false);
          }, 220);
        }
      },
      { threshold: 0.2 }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [visibleCount, sortedProducts.length, loadingMore]);

  const activeSubObj =
    activeSubId === 'all'
      ? null
      : catSubcategories.find((s) => s.id === activeSubId);

  return (
    <div className="max-w-[1360px] mx-auto px-3 sm:px-6 py-4 sm:py-6">
      {/* Top Category Switcher Strip */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-3 mb-3 border-b border-slate-200/80">
        {allCategories.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelectCategory(c)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors shrink-0 ${
              c.id === category.id
                ? 'bg-emerald-700 text-white shadow-2xs'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>

      {/* Breadcrumb Bar + Sort Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-500"
        >
          <button
            type="button"
            onClick={onBackHome}
            className="hover:text-emerald-700 transition-colors"
          >
            Home
          </button>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          <button
            type="button"
            onClick={() => setActiveSubId('all')}
            className="text-slate-800 font-bold hover:text-emerald-700"
          >
            {category.name}
          </button>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-emerald-700 font-extrabold">
            {activeSubObj ? activeSubObj.name : 'All'}
          </span>
        </nav>

        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
          <label htmlFor="category-sort-select" className="text-xs font-semibold text-slate-600">
            Sort:
          </label>
          <select
            id="category-sort-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="h-8 px-2.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-800 focus:border-emerald-600 focus:outline-none"
          >
            <option value="popular">Relevance (Best Sellers)</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
            <option value="rating">Customer Rating (4.8★+)</option>
            <option value="discount">Highest Discount</option>
          </select>
        </div>
      </div>

      {/* Blinkit Layout: LEFT Sticky Sidebar of Subcategories + RIGHT Product Grid */}
      <div className="flex items-start gap-3 sm:gap-6">
        {/* LEFT Sticky Sub-Category Sidebar */}
        <aside
          aria-label={`${category.name} subcategories`}
          className="sticky top-24 w-24 sm:w-56 shrink-0 bg-white rounded-2xl border border-slate-200/90 overflow-hidden shadow-2xs max-h-[calc(100vh-120px)] overflow-y-auto"
        >
          <div className="divide-y divide-slate-100">
            {/* "All" Item */}
            <button
              type="button"
              onClick={() => setActiveSubId('all')}
              className={`w-full p-2.5 sm:px-3.5 sm:py-3 flex flex-col sm:flex-row items-center gap-2 text-center sm:text-left transition-colors cursor-pointer ${
                activeSubId === 'all'
                  ? 'bg-emerald-50/90 text-emerald-900 font-extrabold ring-inset ring-2 ring-emerald-700/20'
                  : 'text-slate-600 hover:bg-slate-50 font-semibold'
              }`}
            >
              <div
                className={`w-10 h-10 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center shrink-0 overflow-hidden ${
                  activeSubId === 'all'
                    ? 'bg-emerald-700 text-white'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                <Leaf className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-[11px] sm:text-xs block leading-tight">
                  All {category.name.split(' ')[0]}
                </span>
                <span className="text-[10px] text-slate-400 hidden sm:block">
                  {products.filter((p) => p.categoryId === category.id).length} items
                </span>
              </div>
            </button>

            {/* Individual Sub-Categories */}
            {catSubcategories.map((sub) => {
              const isSelected = activeSubId === sub.id;
              const count = products.filter(
                (p) => p.subcategoryId === sub.id
              ).length;
              return (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => setActiveSubId(sub.id)}
                  className={`w-full p-2.5 sm:px-3.5 sm:py-3 flex flex-col sm:flex-row items-center gap-2 text-center sm:text-left transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-emerald-50/90 text-emerald-900 font-extrabold ring-inset ring-2 ring-emerald-700/20'
                      : 'text-slate-600 hover:bg-slate-50 font-semibold'
                  }`}
                >
                  <div className="w-10 h-10 sm:w-9 sm:h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 overflow-hidden border border-slate-200/60">
                    <img
                      src={resolveProductPhoto({
                        name: sub.name,
                        slug: sub.slug,
                        imageUrl: sub.imageUrl,
                        unitLabel: 'Pack',
                      })}
                      alt={sub.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-[11px] sm:text-xs block leading-tight line-clamp-2">
                      {sub.name}
                    </span>
                    <span className="text-[10px] text-slate-400 hidden sm:flex items-center gap-1 mt-0.5">
                      {renderSubIcon(sub.iconName, isSelected)}
                      {count} items
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* RIGHT Content: Category Banner Strip + Product Grid + Infinite Scroll + SEO Text Block */}
        <div className="flex-1 min-w-0 space-y-5">
          {/* Category Banner Strip */}
          <div className="rounded-2xl bg-gradient-to-r from-emerald-900 via-emerald-800 to-teal-800 text-white p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 shadow-xs">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-amber-300">
                100% Certified Organic · Residue Tested
              </span>
              <h1 className="font-display text-lg sm:text-2xl font-extrabold mt-0.5">
                {activeSubObj ? activeSubObj.name : category.bannerText}
              </h1>
              <p className="text-xs text-emerald-100 mt-1 max-w-2xl">
                {category.description}
              </p>
            </div>
            <div className="bg-white/10 backdrop-blur-xs border border-white/20 rounded-xl px-3.5 py-2 text-right tabular-nums">
              <span className="text-[10px] text-emerald-200 block">SHOWING</span>
              <span className="text-sm font-extrabold">
                {sortedProducts.length} Organic Items
              </span>
            </div>
          </div>

          {/* Product Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
            {visibleProducts.map((prod) => (
              <ProductCard
                key={prod.id}
                product={prod}
                etaMinutes={etaMinutes}
                getQuantity={getQuantity}
                onUpdateQuantity={onUpdateQuantity}
                onOpenDetail={onOpenDetail}
                isWishlisted={wishlistIds.includes(prod.id)}
                onToggleWishlist={onToggleWishlist}
              />
            ))}
          </div>

          {/* Infinite Scroll Sentinel & Loading Spinner */}
          <div ref={sentinelRef} className="py-4 flex justify-center">
            {loadingMore && (
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-700">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading more organic products...
              </div>
            )}
          </div>

          {/* Bottom SEO Text Block */}
          <section className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 space-y-2.5 text-xs text-slate-600 leading-relaxed">
            <h2 className="font-display text-sm sm:text-base font-extrabold text-slate-900">
              {category.seoTitle}
            </h2>
            <p>{category.seoDescription}</p>
            <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
              <span>• Direct Farm Sourcing</span>
              <span>• Cold-Chain 21-Minute Delivery</span>
              <span>• NPOP &amp; FSSAI Jaivik Bharat Verified</span>
              <span>• Zero Artificial Preservatives</span>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
