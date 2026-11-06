import React, { useState, useEffect, useRef } from 'react';
import {
  MapPin,
  ChevronDown,
  Search,
  ShoppingCart,
  User,
  Clock,
  X,
  Leaf,
  Package,
  Shield,
  Store,
  LogOut,
  Heart,
  Plus,
} from 'lucide-react';
import { Category, Product, UserAddress, UserProfile } from '../types/commerce.ts';

interface HeaderProps {
  currentAddress: UserAddress;
  onOpenLocationModal: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSelectProduct: (product: Product) => void;
  onSelectCategory: (category: Category) => void;
  onNavigateView: (
    view: 'home' | 'category' | 'search' | 'orders' | 'tracking' | 'seller' | 'admin'
  ) => void;
  onNavigateSellerPath?: (path: '/seller' | '/seller/dashboard' | '/seller/products/new') => void;
  activeView: string;
  activeTabGroup: 'All' | 'Fresh' | 'Cafe' | 'Wellness';
  onSelectTabGroup: (tab: 'All' | 'Fresh' | 'Cafe' | 'Wellness') => void;
  user: UserProfile | null;
  onOpenLoginModal: () => void;
  onLogout: () => void;
  onSwitchRole?: (role: 'customer' | 'seller' | 'admin') => void;
  cartItemCount: number;
  cartTotalPay: number;
  onOpenCartDrawer: () => void;
  products: Product[];
  categories: Category[];
  wishlistIds: number[];
}

const ROTATING_TERMS = ['"paneer"', '"ghee"', '"dal"', '"masala"', '"makhana"', '"kadha"'];
const SELLER_STORAGE_KEY = 'bharat_organic_seller_session_v1';

export const Header: React.FC<HeaderProps> = ({
  currentAddress,
  onOpenLocationModal,
  searchQuery,
  onSearchChange,
  onSelectProduct,
  onSelectCategory,
  onNavigateView,
  onNavigateSellerPath,
  activeView,
  activeTabGroup,
  onSelectTabGroup,
  user,
  onOpenLoginModal,
  onLogout,
  onSwitchRole,
  cartItemCount,
  cartTotalPay,
  onOpenCartDrawer,
  products,
  categories,
}) => {
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [searchFocused, setSearchFocused] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [sellerMenuOpen, setSellerMenuOpen] = useState(false);
  const [activeSellerSession, setActiveSellerSession] = useState<{
    uid: string;
    fullName?: string;
    role?: string;
  } | null>(() => {
    try {
      const raw = localStorage.getItem(SELLER_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed?.uid && parsed?.role === 'seller') {
        return parsed;
      }
      if (parsed?.user?.uid && parsed?.user?.role === 'seller') {
        return parsed.user;
      }
      return null;
    } catch {
      return null;
    }
  });
  const [recentSearches, setRecentSearches] = useState<string[]>([
    'ghee',
    'paneer',
    'lakadong haldi',
    'makhana',
  ]);
  const [cartBump, setCartBump] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const sellerMenuRef = useRef<HTMLDivElement>(null);

  const isSellerLoggedIn = Boolean(
    user?.role === 'seller' || activeSellerSession?.role === 'seller'
  );

  useEffect(() => {
    const syncSeller = () => {
      try {
        const raw = localStorage.getItem(SELLER_STORAGE_KEY);
        if (!raw) {
          setActiveSellerSession(null);
          return;
        }
        const parsed = JSON.parse(raw);
        if (parsed?.uid && parsed?.role === 'seller') {
          setActiveSellerSession(parsed);
        } else if (parsed?.user?.uid && parsed?.user?.role === 'seller') {
          setActiveSellerSession(parsed.user);
        } else {
          setActiveSellerSession(null);
        }
      } catch {
        setActiveSellerSession(null);
      }
    };
    syncSeller();
    window.addEventListener('storage', syncSeller);
    return () => window.removeEventListener('storage', syncSeller);
  }, [activeView, user?.role]);

  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % ROTATING_TERMS.length);
    }, 2600);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (cartItemCount > 0) {
      setCartBump(true);
      const t = setTimeout(() => setCartBump(false), 200);
      return () => clearTimeout(t);
    }
  }, [cartItemCount, cartTotalPay]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      ) {
        setSearchFocused(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false);
      }
      if (sellerMenuRef.current && !sellerMenuRef.current.contains(e.target as Node)) {
        setSellerMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const trimmedQuery = searchQuery.trim().toLowerCase();
  const matchingCategories = trimmedQuery
    ? categories
        .filter(
          (c) =>
            c.name.toLowerCase().includes(trimmedQuery) ||
            c.description.toLowerCase().includes(trimmedQuery)
        )
        .slice(0, 3)
    : [];

  const matchingProducts = trimmedQuery
    ? products
        .filter(
          (p) =>
            p.name.toLowerCase().includes(trimmedQuery) ||
            p.tag.toLowerCase().includes(trimmedQuery) ||
            p.slug.toLowerCase().includes(trimmedQuery)
        )
        .slice(0, 6)
    : [];

  const handleQuickSearchTerm = (term: string) => {
    onSearchChange(term);
    if (!recentSearches.includes(term)) {
      setRecentSearches((prev) => [term, ...prev.slice(0, 5)]);
    }
    onNavigateView('search');
    setSearchFocused(false);
  };

  const handleLogoClick = () => {
    if (isSellerLoggedIn) {
      if (onNavigateSellerPath) {
        onNavigateSellerPath('/seller/dashboard');
      } else {
        window.history.pushState({}, '', '/seller/dashboard');
        onNavigateView('seller');
      }
      return;
    }
    // Logged-in customer -> buyer home, Logged-out user -> landing page ('/')
    onSelectTabGroup('All');
    onNavigateView('home');
  };

  const formattedAddressLine = `${currentAddress.flatHouse ? currentAddress.flatHouse + ', ' : ''}${currentAddress.towerBuilding}, ${currentAddress.area}, ${currentAddress.city}`;

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200/90 shadow-xs">
      {/* Main Row */}
      <div className="max-w-[1360px] mx-auto px-3 sm:px-6 h-16 sm:h-20 flex items-center justify-between gap-2 sm:gap-5">
        {/* Left: Brand Logo + Live Delivery ETA & Address */}
        <div className="flex items-center gap-2 sm:gap-5 min-w-0 shrink-0">
          <button
            type="button"
            onClick={handleLogoClick}
            className="flex items-center gap-2 text-left group focus:outline-none shrink-0 cursor-pointer"
            aria-label="Bharat Organic Home"
          >
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-emerald-700 flex items-center justify-center text-amber-300 shadow-xs group-hover:bg-emerald-800 transition-colors">
              <Leaf className="w-5 h-5 sm:w-6 sm:h-6 fill-amber-300/20" />
            </div>
            <div className="hidden sm:block">
              <span className="font-display text-lg sm:text-xl font-extrabold tracking-tight text-slate-900 block leading-none">
                Bharat<span className="text-emerald-700">Organic</span>
              </span>
              <span className="text-[10px] font-semibold text-amber-700 tracking-wide block mt-0.5">
                FARM TO DOOR
              </span>
            </div>
          </button>

          <div className="h-8 w-px bg-slate-200 hidden sm:block" />

          {/* Dynamic ETA + Live Address Trigger */}
          <button
            type="button"
            onClick={onOpenLocationModal}
            className="flex flex-col text-left max-w-[148px] sm:max-w-[245px] px-1.5 sm:px-2 py-1 rounded-xl hover:bg-slate-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
            aria-label="Change delivery location"
          >
            <div className="flex items-center gap-1.5">
              <span className="font-display font-extrabold text-xs sm:text-[15px] text-slate-900 whitespace-nowrap">
                {currentAddress.isServiceable
                  ? `Delivery in ${currentAddress.etaMinutes} minutes`
                  : 'Location Unserviceable'}
              </span>
              <span className="text-[11px] font-semibold text-emerald-700 hidden md:inline">
                · {currentAddress.label}
              </span>
            </div>
            <div className="flex items-center gap-1 text-xs text-slate-600 w-full">
              <MapPin className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
              <span className="truncate font-medium">{formattedAddressLine}</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            </div>
          </button>
        </div>

        {/* Centre: Wide Rounded Search Bar with Animated Rotating Placeholder */}
        <div
          ref={searchContainerRef}
          className="relative flex-1 max-w-xl hidden md:block"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (searchQuery.trim()) {
                handleQuickSearchTerm(searchQuery.trim());
              }
            }}
            className="relative flex items-center"
          >
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onFocus={() => setSearchFocused(true)}
              onChange={(e) => {
                onSearchChange(e.target.value);
                if (activeView !== 'search' && e.target.value.trim().length > 0) {
                  onNavigateView('search');
                }
              }}
              placeholder={`Search ${ROTATING_TERMS[placeholderIndex]} or 180+ organic essentials`}
              aria-label="Search organic products"
              className="w-full h-11 pl-10 pr-9 rounded-xl bg-slate-100/90 border border-slate-200/80 text-sm text-slate-900 placeholder:text-slate-500 focus:bg-white focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15 focus:outline-none transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  onSearchChange('');
                  if (activeView === 'search') onNavigateView('home');
                }}
                aria-label="Clear search query"
                className="absolute right-3 p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </form>

          {/* Instant Search Autocomplete Dropdown */}
          {searchFocused && (
            <div className="absolute left-0 right-0 top-12 bg-white rounded-2xl border border-slate-200 shadow-xl p-4 z-50 max-h-[420px] overflow-y-auto">
              {!trimmedQuery ? (
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-2.5">
                    Recent & Popular Searches
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {recentSearches.map((term) => (
                      <button
                        key={term}
                        type="button"
                        onClick={() => handleQuickSearchTerm(term)}
                        className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-emerald-50 hover:text-emerald-800 text-xs font-medium text-slate-700 transition-colors"
                      >
                        {term}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {matchingCategories.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 mb-2">
                        Matching Categories
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {matchingCategories.map((cat) => (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => {
                              onSelectCategory(cat);
                              setSearchFocused(false);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 text-xs font-semibold hover:bg-emerald-100 transition-colors"
                          >
                            {cat.name} →
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-slate-500">
                        Products matching "{searchQuery}"
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          onNavigateView('search');
                          setSearchFocused(false);
                        }}
                        className="text-xs font-semibold text-emerald-700 hover:underline"
                      >
                        View all results →
                      </button>
                    </div>
                    {matchingProducts.length === 0 ? (
                      <p className="text-xs text-slate-500 py-3">
                        No direct matches. Try searching "ghee", "paneer", "atta", "dal", or "kadha".
                      </p>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {matchingProducts.map((prod) => (
                          <button
                            key={prod.id}
                            type="button"
                            onClick={() => {
                              onSelectProduct(prod);
                              setSearchFocused(false);
                            }}
                            className="w-full py-2 px-2 flex items-center justify-between hover:bg-slate-50 rounded-lg text-left transition-colors"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <img
                                src={prod.imageUrl}
                                alt={prod.name}
                                className="w-10 h-10 rounded-lg object-cover bg-slate-100 shrink-0"
                              />
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-slate-900 truncate">
                                  {prod.name}
                                </p>
                                <p className="text-[11px] text-slate-500">
                                  {prod.unitLabel} · {prod.tag}
                                </p>
                              </div>
                            </div>
                            <div className="text-right shrink-0 ml-3">
                              <span className="text-xs font-bold text-slate-900 tabular-nums">
                                ₹{prod.price}
                              </span>
                              <span className="text-[11px] text-slate-400 line-through ml-1 tabular-nums">
                                ₹{prod.mrp}
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Category Mode Tabs + Login/Profile + Green "My Cart" Button */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Zepto-style Quick Tabs (All, Fresh, Cafe, Wellness — only real data tabs enabled) */}
          <nav
            aria-label="Store sections"
            className="hidden xl:flex items-center bg-slate-100 p-1 rounded-xl"
          >
            {(['All', 'Fresh', 'Cafe', 'Wellness'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => {
                  onSelectTabGroup(tab);
                  if (activeView !== 'home') onNavigateView('home');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                  activeTabGroup === tab && activeView === 'home'
                    ? 'bg-white text-emerald-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab}
              </button>
            ))}
          </nav>

          {/* Login or Customer Profile Menu (Strictly NO Seller Hub / Become a Seller / Add Product in Buyer DOM) */}
          {!user ? (
            <button
              type="button"
              onClick={onOpenLoginModal}
              className="px-3.5 py-2 rounded-xl text-sm font-semibold text-slate-800 hover:bg-slate-100 transition-colors whitespace-nowrap"
            >
              Login
            </button>
          ) : (
            <div ref={profileRef} className="relative">
              <button
                type="button"
                onClick={() => setProfileMenuOpen((prev) => !prev)}
                className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200/70 text-xs sm:text-sm font-semibold text-slate-800 transition-colors"
                aria-label="Account menu"
              >
                <User className="w-4 h-4 text-emerald-700" />
                <span className="max-w-[96px] truncate hidden sm:inline">
                  {user.fullName.split(' ')[0]}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
              </button>

              {profileMenuOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl border border-slate-200 shadow-xl py-2 z-50">
                  <div className="px-4 py-2.5 border-b border-slate-100">
                    <p className="text-xs font-bold text-slate-900 truncate">
                      {user.fullName}
                    </p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {user.phone ? `+91 ${user.phone}` : user.email} · Role:{' '}
                      <span className="font-semibold text-emerald-700 uppercase">
                        {user.role}
                      </span>
                    </p>
                  </div>

                  <div className="py-1">
                    <button
                      type="button"
                      onClick={() => {
                        onNavigateView('orders');
                        setProfileMenuOpen(false);
                      }}
                      className="w-full px-4 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2.5"
                    >
                      <Package className="w-4 h-4 text-emerald-700" />
                      My Orders &amp; Invoices
                    </button>
                  </div>

                  <div className="border-t border-slate-100 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        onLogout();
                        setProfileMenuOpen(false);
                      }}
                      className="w-full px-4 py-2 text-left text-xs font-semibold text-red-600 hover:bg-red-50 flex items-center gap-2.5"
                    >
                      <LogOut className="w-4 h-4" />
                      Log Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Green "My Cart" Button */}
          <button
            type="button"
            onClick={onOpenCartDrawer}
            aria-label={
              cartItemCount > 0
                ? `My Cart, ${cartItemCount} items, total ₹${cartTotalPay}`
                : 'My Cart'
            }
            className={`flex items-center gap-1.5 sm:gap-2.5 px-2.5 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-xs sm:text-sm shadow-xs transition-all cursor-pointer shrink-0 ${
              cartBump ? 'animate-cart-bounce' : ''
            }`}
          >
            <ShoppingCart className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
            {cartItemCount === 0 ? (
              <span className="whitespace-nowrap">My Cart</span>
            ) : (
              <div className="flex flex-col items-start leading-tight tabular-nums">
                <span className="text-[11px] font-medium text-emerald-100 whitespace-nowrap">
                  {cartItemCount} {cartItemCount === 1 ? 'item' : 'items'}
                </span>
                <span className="text-xs sm:text-sm font-extrabold whitespace-nowrap">
                  ₹{cartTotalPay}
                </span>
              </div>
            )}
          </button>
        </div>
      </div>

      {/* Mobile Search Bar Row */}
      <div className="md:hidden px-3 pb-2.5">
        <div className="relative flex items-center">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => {
              onSearchChange(e.target.value);
              if (activeView !== 'search' && e.target.value.trim().length > 0) {
                onNavigateView('search');
              }
            }}
            placeholder={`Search ${ROTATING_TERMS[placeholderIndex]}...`}
            aria-label="Search organic products mobile"
            className="w-full h-10 pl-9 pr-8 rounded-xl bg-slate-100 border border-slate-200 text-xs text-slate-900 placeholder:text-slate-500 focus:bg-white focus:border-emerald-600 focus:outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              aria-label="Clear mobile search"
              className="absolute right-2.5 text-slate-400"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
