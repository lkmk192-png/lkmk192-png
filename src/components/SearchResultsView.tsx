import React, { useState, useMemo } from 'react';
import {
  Search,
  SlidersHorizontal,
  ArrowLeft,
  Sparkles,
} from 'lucide-react';
import { Category, Product, ProductVariant } from '../types/commerce.ts';
import { ProductCard } from './ProductCard.tsx';

interface SearchResultsViewProps {
  query: string;
  onQueryChange: (q: string) => void;
  products: Product[];
  categories: Category[];
  etaMinutes: number;
  getQuantity: (productId: number, variantId: number | null) => number;
  onUpdateQuantity: (
    product: Product,
    variant: ProductVariant | null,
    delta: number
  ) => void;
  onOpenDetail: (product: Product) => void;
  onBackHome: () => void;
  wishlistIds: number[];
  onToggleWishlist: (productId: number) => void;
}

export const SearchResultsView: React.FC<SearchResultsViewProps> = ({
  query,
  onQueryChange,
  products,
  categories,
  etaMinutes,
  getQuantity,
  onUpdateQuantity,
  onOpenDetail,
  onBackHome,
  wishlistIds,
  onToggleWishlist,
}) => {
  const [selectedCatId, setSelectedCatId] = useState<number | 'all'>('all');
  const [maxPrice, setMaxPrice] = useState<number>(2000);
  const [minRating, setMinRating] = useState<number>(0);
  const [sortBy, setSortBy] = useState<
    'relevance' | 'price_asc' | 'price_desc' | 'rating' | 'discount'
  >('relevance');

  const cleanQ = query.trim().toLowerCase();

  const { matchedProducts, relatedProducts } = useMemo(() => {
    if (!cleanQ) {
      return {
        matchedProducts: products.slice(0, 24),
        relatedProducts: [],
      };
    }

    const matchingCatIds = new Set(
      categories
        .filter(
          (c) =>
            c.name.toLowerCase().includes(cleanQ) ||
            c.slug.toLowerCase().includes(cleanQ) ||
            c.description.toLowerCase().includes(cleanQ)
        )
        .map((c) => c.id)
    );

    const direct = products.filter((p) => {
      const textMatch =
        p.name.toLowerCase().includes(cleanQ) ||
        p.tag.toLowerCase().includes(cleanQ) ||
        p.benefits.toLowerCase().includes(cleanQ) ||
        p.slug.toLowerCase().includes(cleanQ) ||
        matchingCatIds.has(p.categoryId);

      if (!textMatch) return false;
      if (selectedCatId !== 'all' && p.categoryId !== selectedCatId) return false;
      if (p.price > maxPrice) return false;
      if (p.rating < minRating) return false;
      return true;
    });

    if (sortBy === 'price_asc') {
      direct.sort((a, b) => a.price - b.price);
    } else if (sortBy === 'price_desc') {
      direct.sort((a, b) => b.price - a.price);
    } else if (sortBy === 'rating') {
      direct.sort((a, b) => b.rating - a.rating);
    } else if (sortBy === 'discount') {
      direct.sort((a, b) => b.discountPct - a.discountPct);
    }

    const directIds = new Set(direct.map((d) => d.id));
    const relatedCats = new Set(direct.map((d) => d.categoryId));

    const related = products
      .filter((p) => !directIds.has(p.id) && (relatedCats.has(p.categoryId) || p.isBestSeller))
      .slice(0, 8);

    return { matchedProducts: direct, relatedProducts: related };
  }, [cleanQ, products, categories, selectedCatId, maxPrice, minRating, sortBy]);

  return (
    <div className="max-w-[1360px] mx-auto px-3 sm:px-6 py-5 space-y-5">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackHome}
            className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-xs font-extrabold text-slate-800 flex items-center gap-1.5"
          >
            <ArrowLeft className="w-4 h-4" />
            Home
          </button>
          <h1 className="font-display text-lg sm:text-2xl font-extrabold text-slate-900">
            {cleanQ ? (
              <>
                Showing results for <span className="text-emerald-700">"{query}"</span> (
                {matchedProducts.length})
              </>
            ) : (
              'Explore All Organic Products'
            )}
          </h1>
        </div>

        {/* Filter & Sort Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Filter by category"
            value={selectedCatId}
            onChange={(e) =>
              setSelectedCatId(
                e.target.value === 'all' ? 'all' : Number(e.target.value)
              )
            }
            className="h-9 px-3 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700"
          >
            <option value="all">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by max price"
            value={maxPrice}
            onChange={(e) => setMaxPrice(Number(e.target.value))}
            className="h-9 px-3 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700"
          >
            <option value={2000}>Any Price</option>
            <option value={150}>Under ₹150</option>
            <option value={300}>Under ₹300</option>
            <option value={500}>Under ₹500</option>
          </select>

          <select
            aria-label="Filter by minimum rating"
            value={minRating}
            onChange={(e) => setMinRating(Number(e.target.value))}
            className="h-9 px-3 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700"
          >
            <option value={0}>All Ratings</option>
            <option value={4.8}>★ 4.8 &amp; above</option>
            <option value={4.9}>★ 4.9 Top Rated</option>
          </select>

          <div className="flex items-center gap-1.5">
            <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
            <select
              aria-label="Sort search results"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="h-9 px-3 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-800"
            >
              <option value="relevance">Sort: Relevance</option>
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
              <option value="rating">Customer Rating</option>
              <option value="discount">Highest Discount</option>
            </select>
          </div>
        </div>
      </div>

      {/* Results Grid or Friendly Empty State */}
      {matchedProducts.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-10 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center mx-auto">
            <Search className="w-7 h-7" />
          </div>
          <div>
            <h2 className="font-display text-lg font-extrabold text-slate-900">
              No exact products found for "{query}"
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Try one of our popular organic categories or search terms below:
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {[
              'ghee',
              'paneer',
              'atta',
              'toor dal',
              'makhana',
              'haldi',
              'kadha',
              'ors',
              'honey',
              'tomato',
            ].map((term) => (
              <button
                key={term}
                type="button"
                onClick={() => {
                  setSelectedCatId('all');
                  setMaxPrice(2000);
                  onQueryChange(term);
                }}
                className="px-3.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-700 text-emerald-800 hover:text-white text-xs font-bold transition-colors"
              >
                Search "{term}"
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
          {matchedProducts.map((prod) => (
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
      )}

      {/* Related Products Section */}
      {relatedProducts.length > 0 && (
        <div className="pt-6 border-t border-slate-200 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-700" />
            <h2 className="font-display text-lg font-extrabold text-slate-900">
              Related Organic Essentials You May Also Need
            </h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            {relatedProducts.map((rel) => (
              <ProductCard
                key={rel.id}
                product={rel}
                etaMinutes={etaMinutes}
                getQuantity={getQuantity}
                onUpdateQuantity={onUpdateQuantity}
                onOpenDetail={onOpenDetail}
                isWishlisted={wishlistIds.includes(rel.id)}
                onToggleWishlist={onToggleWishlist}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
