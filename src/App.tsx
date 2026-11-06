/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ShoppingCart,
  ShieldCheck,
  Clock,
  Truck,
  Sparkles,
  Leaf,
  Database,
  ArrowRight,
} from 'lucide-react';
import {
  Category,
  Subcategory,
  Product,
  ProductVariant,
  CartItem,
  Coupon,
  UserAddress,
  UserProfile,
  OrderRecord,
} from './types/commerce.ts';
import { calculateBillSummary, OrderStatus } from './utils/commerceRules.ts';
import { resolveProductPhoto, buildStudioProductDataUri } from './utils/productPhotoStudio.ts';
import { Header } from './components/Header.tsx';
import { ProductCard } from './components/ProductCard.tsx';
import { ProductDetailModal } from './components/ProductDetailModal.tsx';
import { LocationModal } from './components/LocationModal.tsx';
import { LoginModal } from './components/LoginModal.tsx';
import { CartDrawer } from './components/CartDrawer.tsx';
import { CheckoutModal } from './components/CheckoutModal.tsx';
import { CategoryView } from './components/CategoryView.tsx';
import { SearchResultsView } from './components/SearchResultsView.tsx';
import { OrderTrackingView } from './components/OrderTrackingView.tsx';
import { SellerPortalApp } from './components/SellerPortalApp.tsx';
import { ProtectedRoute } from './components/ProtectedRoute.tsx';
import { useAuth } from './context/AuthContext.tsx';
import {
  getLogoClickTarget,
  resolveRouteGuardRedirect,
} from './utils/roleRouting.ts';

const DEFAULT_ADDRESS: UserAddress = {
  label: 'Home',
  flatHouse: 'Flat 402, 4th Floor',
  towerBuilding: 'TOWER-C, Nirvana Country',
  area: 'Sector 50, Golf Course Ext Road',
  city: 'Gurugram',
  pincode: '122018',
  landmark: 'Near Central Park Gate 2',
  lat: 28.4126,
  lng: 77.066,
  distanceKm: 1.8,
  etaMinutes: 21,
  isServiceable: true,
};

interface HorizontalShelfProps {
  title: string;
  subtitle: string;
  products: Product[];
  etaMinutes: number;
  getQuantity: (productId: number, variantId: number | null) => number;
  onUpdateQuantity: (
    product: Product,
    variant: ProductVariant | null,
    delta: number
  ) => void;
  onOpenDetail: (product: Product) => void;
  onSeeAll: () => void;
  wishlistIds: number[];
  onToggleWishlist: (productId: number) => void;
}

const HorizontalProductShelf: React.FC<HorizontalShelfProps> = ({
  title,
  subtitle,
  products,
  etaMinutes,
  getQuantity,
  onUpdateQuantity,
  onOpenDetail,
  onSeeAll,
  wishlistIds,
  onToggleWishlist,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleScroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const offset = direction === 'left' ? -560 : 560;
    scrollRef.current.scrollBy({ left: offset, behavior: 'smooth' });
  };

  if (products.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-lg sm:text-xl font-extrabold text-slate-900">
            {title}
          </h2>
          <p className="text-xs text-slate-500">{subtitle}</p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onSeeAll}
            className="text-xs sm:text-sm font-extrabold text-emerald-700 hover:text-emerald-800 mr-1 cursor-pointer"
          >
            see all →
          </button>
          <button
            type="button"
            onClick={() => handleScroll('left')}
            aria-label={`Scroll ${title} left`}
            className="w-8 h-8 rounded-full bg-white border border-slate-200 hover:bg-slate-100 flex items-center justify-center text-slate-700 shadow-2xs cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => handleScroll('right')}
            aria-label={`Scroll ${title} right`}
            className="w-8 h-8 rounded-full bg-white border border-slate-200 hover:bg-slate-100 flex items-center justify-center text-slate-700 shadow-2xs cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-3 sm:gap-4 overflow-x-auto no-scrollbar pb-2"
      >
        {products.map((prod) => (
          <div key={prod.id} className="w-[175px] sm:w-[215px] shrink-0">
            <ProductCard
              product={prod}
              etaMinutes={etaMinutes}
              getQuantity={getQuantity}
              onUpdateQuantity={onUpdateQuantity}
              onOpenDetail={onOpenDetail}
              isWishlisted={wishlistIds.includes(prod.id)}
              onToggleWishlist={onToggleWishlist}
            />
          </div>
        ))}
      </div>
    </section>
  );
};

export default function App() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [catalogError, setCatalogError] = useState('');

  // Navigation & View States (supports /seller, /admin, /buyer entry URLs)
  const [activeView, setActiveView] = useState<
    'home' | 'category' | 'search' | 'orders' | 'tracking' | 'seller' | 'admin'
  >(() => {
    if (typeof window !== 'undefined') {
      const p = window.location.pathname.toLowerCase();
      if (p === '/seller' || p.startsWith('/seller/')) return 'seller';
      if (p === '/admin' || p.startsWith('/admin/')) return 'admin';
    }
    return 'home';
  });
  const [activeTabGroup, setActiveTabGroup] = useState<
    'All' | 'Fresh' | 'Cafe' | 'Wellness'
  >('All');
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(
    null
  );
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');

  // Location & Address State
  const [currentAddress, setCurrentAddress] =
    useState<UserAddress>(DEFAULT_ADDRESS);
  const [savedAddresses, setSavedAddresses] = useState<UserAddress[]>([
    DEFAULT_ADDRESS,
  ]);
  const [hasConfirmedAddress, setHasConfirmedAddress] = useState<boolean>(true);
  const [locationModalOpen, setLocationModalOpen] = useState(false);

  // Global Auth State via AuthContext (role fetched from Supabase/Cloud SQL "profiles" table)
  const { user, role, authToken, login, logout } = useAuth();
  const [loginModalOpen, setLoginModalOpen] = useState(false);

  // Admin Standalone Login State (when visiting /admin while logged out)
  const [adminPhoneInput, setAdminPhoneInput] = useState('9999900001');
  const [adminOtpInput, setAdminOtpInput] = useState('123456');
  const [adminLoginError, setAdminLoginError] = useState('');
  const [adminLoggingIn, setAdminLoggingIn] = useState(false);

  // Cart & Coupons State
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [scheduledSlot, setScheduledSlot] = useState('Instant (21 mins)');
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [wishlistIds, setWishlistIds] = useState<number[]>([]);

  // Orders & Realtime State
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [activeOrder, setActiveOrder] = useState<OrderRecord | null>(null);

  // 300ms Debounce for Search Input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch Initial Catalogue from Cloud SQL PostgreSQL Backend
  const fetchCatalog = async (silent = false) => {
    if (!silent) setLoadingCatalog(true);
    setCatalogError('');
    try {
      const res = await fetch('/api/catalog');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load catalogue');
      setCategories(data.categories || []);
      setSubcategories(data.subcategories || []);
      setProducts(data.products || []);
      setCoupons(data.coupons || []);
    } catch (err: any) {
      if (!silent) {
        setCatalogError(err.message || 'Unable to connect to store server.');
      }
    } finally {
      if (!silent) setLoadingCatalog(false);
    }
  };

  useEffect(() => {
    fetchCatalog();
  }, []);

  // Fetch User Orders & Saved Addresses on Login + Subscribe to Live SSE Stream
  const fetchUserOrdersAndAddresses = async (token: string, role: string) => {
    if (!token) return;
    try {
      const [ordRes, addrRes] = await Promise.all([
        fetch(`/api/orders?role=${role}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/addresses', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      if (ordRes.ok) {
        const ordData = await ordRes.json();
        setOrders(ordData.orders || []);
        if (ordData.orders?.length > 0 && !activeOrder) {
          setActiveOrder(ordData.orders[0]);
        }
      }
      if (addrRes.ok) {
        const addrData = await addrRes.json();
        if (addrData.addresses && addrData.addresses.length > 0) {
          setSavedAddresses(addrData.addresses);
          setCurrentAddress(addrData.addresses[0]);
          setHasConfirmedAddress(true);
        }
      }
    } catch {
      // Ignore transient network errors
    }
  };

  useEffect(() => {
    if (!authToken || !user) return;
    fetchUserOrdersAndAddresses(authToken, user.role);

    const interval = setInterval(() => {
      fetchUserOrdersAndAddresses(authToken, user.role);
    }, 4000);
    return () => clearInterval(interval);
  }, [authToken, user?.role]);

  // Cart Quantity Helpers
  const getQuantity = (productId: number, variantId: number | null) => {
    const key = `${productId}_${variantId || 0}`;
    const found = cartItems.find((i) => i.key === key);
    if (found) return found.quantity;
    if (variantId === null) {
      return cartItems
        .filter((i) => i.productId === productId)
        .reduce((sum, i) => sum + i.quantity, 0);
    }
    return 0;
  };

  const handleUpdateQuantity = (
    product: Product,
    variant: ProductVariant | null,
    delta: number
  ) => {
    const resolvedVariant =
      variant ||
      (product.variants && product.variants.length > 0
        ? product.variants.find((v) => v.isDefault) || product.variants[0]
        : null);

    const varId = resolvedVariant ? resolvedVariant.id : null;
    const key = `${product.id}_${varId || 0}`;
    const unitLabel = resolvedVariant ? resolvedVariant.unitLabel : product.unitLabel;
    const price = resolvedVariant ? resolvedVariant.price : product.price;
    const mrp = resolvedVariant ? resolvedVariant.mrp : product.mrp;
    const discountPct = resolvedVariant
      ? resolvedVariant.discountPct
      : product.discountPct;
    const stock = resolvedVariant ? resolvedVariant.stock : product.stock;

    setCartItems((prev) => {
      const existingIndex = prev.findIndex((i) => i.key === key);
      if (existingIndex === -1) {
        if (delta <= 0) return prev;
        return [
          ...prev,
          {
            key,
            productId: product.id,
            variantId: varId,
            name: product.name,
            unitLabel,
            imageUrl: product.imageUrl,
            mrp,
            price,
            discountPct,
            quantity: delta,
            stock,
            categoryId: product.categoryId,
          },
        ];
      }

      const nextQty = prev[existingIndex].quantity + delta;
      if (nextQty <= 0) {
        return prev.filter((_, idx) => idx !== existingIndex);
      }
      const copy = [...prev];
      copy[existingIndex] = {
        ...copy[existingIndex],
        quantity: Math.min(nextQty, stock),
      };
      return copy;
    });
  };

  const handleUpdateCartItemByKey = (key: string, delta: number) => {
    setCartItems((prev) => {
      const idx = prev.findIndex((i) => i.key === key);
      if (idx === -1) return prev;
      const nextQty = prev[idx].quantity + delta;
      if (nextQty <= 0) {
        return prev.filter((_, i) => i !== idx);
      }
      const copy = [...prev];
      copy[idx] = { ...copy[idx], quantity: Math.min(nextQty, copy[idx].stock) };
      return copy;
    });
  };

  // Calculate deterministic Bill Summary
  const bill = useMemo(() => {
    return calculateBillSummary(
      cartItems.map((i) => ({
        productId: i.productId,
        variantId: i.variantId,
        mrp: i.mrp,
        price: Number(i.price),
        quantity: i.quantity,
        stock: i.stock,
      })),
      appliedCoupon,
      currentAddress.distanceKm
    );
  }, [cartItems, appliedCoupon, currentAddress.distanceKm]);

  // Suggestions for Cart Drawer ("Forgot something? Add more items")
  const cartSuggestions = useMemo(() => {
    const cartProdIds = new Set(cartItems.map((i) => i.productId));
    const cartCatIds = new Set(cartItems.map((i) => i.categoryId));
    return products
      .filter(
        (p) =>
          !cartProdIds.has(p.id) &&
          (cartCatIds.has(p.categoryId) || p.isBestSeller)
      )
      .slice(0, 6);
  }, [cartItems, products]);

  // Save Address Handler
  const handleSaveAddress = async (newAddr: UserAddress) => {
    setCurrentAddress(newAddr);
    setHasConfirmedAddress(true);
    setSavedAddresses((prev) => [
      newAddr,
      ...prev.filter((a) => a.flatHouse !== newAddr.flatHouse),
    ]);

    if (authToken) {
      try {
        const res = await fetch('/api/addresses', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify(newAddr),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.address) {
            setCurrentAddress(data.address);
          }
        }
      } catch {
        // Keep local address state
      }
    }
  };

  // Order Status Update Handler
  const handleUpdateOrderStatus = async (
    orderId: number,
    nextStatus: OrderStatus,
    note?: string,
    partnerName?: string
  ) => {
    if (!authToken) return;
    const res = await fetch(`/api/orders/${orderId}/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        status: nextStatus,
        note,
        deliveryPartnerName: partnerName,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      const updatedOrder: OrderRecord = {
        ...data.order,
        items: data.items || [],
        history: data.history || [],
      };
      setOrders((prev) =>
        prev.map((o) => (o.id === updatedOrder.id ? updatedOrder : o))
      );
      if (activeOrder?.id === updatedOrder.id) {
        setActiveOrder(updatedOrder);
      }
      fetchCatalog(true);
    }
  };

  // Reorder Handler
  const handleReorder = (ord: OrderRecord) => {
    if (!ord.items) return;
    for (const item of ord.items) {
      const prod = products.find((p) => p.id === item.productId);
      if (prod) {
        handleUpdateQuantity(prod, null, item.quantity);
      }
    }
    setCartDrawerOpen(true);
  };

  // Seller Stock Update Handler
  const handleUpdateProductStock = async (
    productId: number,
    updates: { price?: number; mrp?: number; stock?: number }
  ) => {
    if (!authToken) return;
    const res = await fetch(`/api/seller/products/${productId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      await fetchCatalog();
    }
  };

  // Filtered Categories & Product Shelves for Home View
  const displayedCategories = useMemo(() => {
    if (activeTabGroup === 'All') return categories;
    return categories.filter((c) => c.tabGroup === activeTabGroup);
  }, [categories, activeTabGroup]);

  const trendingProducts = useMemo(
    () => products.filter((p) => p.isTrending).slice(0, 12),
    [products]
  );
  const bestSellerProducts = useMemo(
    () => products.filter((p) => p.isBestSeller).slice(0, 12),
    [products]
  );
  const freshGreenProducts = useMemo(
    () => products.filter((p) => p.isFreshGreen).slice(0, 12),
    [products]
  );
  const gheeAndOilsCategory = categories.find((c) => c.slug === 'ghee-oils');
  const gheeAndOilProducts = useMemo(
    () =>
      gheeAndOilsCategory
        ? products
            .filter((p) => p.categoryId === gheeAndOilsCategory.id)
            .slice(0, 10)
        : [],
    [products, gheeAndOilsCategory]
  );

  const openCategoryBySlug = (slug: string) => {
    const found = categories.find((c) => c.slug === slug) || categories[0];
    if (found) {
      setSelectedCategory(found);
      setActiveView('category');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const heroArtUri = useMemo(
    () =>
      buildStudioProductDataUri(
        'Vedic Bilona A2 Gir Cow Ghee',
        'hero-ghee-harvest',
        'ghee-oils',
        '500 ml'
      ),
    []
  );

  // Sync URL pathname & enforce Role-Based Separation (Seller -> /seller/dashboard, Customer -> /, Admin -> /admin)
  const syncRouteWithRole = (pathname: string, currentRole = role) => {
    const p = (pathname || '/').toLowerCase();

    // 1. Logged-in Seller opening ANY buyer or admin URL (/, /cart, /checkout, /orders, /admin) -> /seller/dashboard
    if (currentRole === 'seller') {
      if (p !== '/seller' && !p.startsWith('/seller/')) {
        window.history.replaceState({}, '', '/seller/dashboard');
      } else if (p === '/seller') {
        window.history.replaceState({}, '', '/seller/dashboard');
      }
      setActiveView('seller');
      setCartDrawerOpen(false);
      setCheckoutModalOpen(false);
      return;
    }

    // 2. Logged-in Customer opening /seller, /seller/* or /admin -> redirect to Buyer Home (/)
    if (currentRole === 'customer') {
      if (p === '/seller' || p.startsWith('/seller/') || p === '/admin' || p.startsWith('/admin/')) {
        window.history.replaceState({}, '', '/');
        setActiveView('home');
        return;
      }
    }

    // 3. Logged-in Admin opening ANY buyer or seller URL -> redirect to /admin
    if (currentRole === 'admin') {
      if (p !== '/admin' && !p.startsWith('/admin/')) {
        window.history.replaceState({}, '', '/admin');
      }
      setActiveView('admin');
      setCartDrawerOpen(false);
      setCheckoutModalOpen(false);
      return;
    }

    // 4. Guest or matching role route resolution
    if (p === '/seller' || p.startsWith('/seller/')) {
      setActiveView('seller');
    } else if (p === '/admin' || p.startsWith('/admin/')) {
      setActiveView('admin');
    } else if (p === '/cart') {
      setActiveView('home');
      setCartDrawerOpen(true);
    } else if (p === '/checkout') {
      setActiveView('home');
      if (user) {
        setCheckoutModalOpen(true);
      } else {
        setCartDrawerOpen(true);
      }
    } else if (p === '/orders') {
      setActiveView('orders');
    } else {
      setActiveView((prev) => (prev === 'seller' || prev === 'admin' ? 'home' : prev));
    }
  };

  useEffect(() => {
    syncRouteWithRole(window.location.pathname, role);
  }, [role]);

  useEffect(() => {
    const onPopState = () => {
      syncRouteWithRole(window.location.pathname, role);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [role]);

  const handleAdminStandaloneLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminLoginError('');
    setAdminLoggingIn(true);
    try {
      const res = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: adminPhoneInput.replace(/\D/g, ''),
          otp: adminOtpInput.trim() || '123456',
          fullName: 'Bharat Organic Admin',
          role: 'admin',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Admin login failed');
      }
      if (data.user?.role !== 'admin') {
        throw new Error('This account does not have Admin role.');
      }
      login(data.user, data.token);
      window.history.replaceState({}, '', '/admin');
      setActiveView('admin');
    } catch (err: any) {
      setAdminLoginError(err.message || 'Invalid Admin credentials');
    } finally {
      setAdminLoggingIn(false);
    }
  };

  // Dedicated Seller Route Branch (Protected: only 'seller' role or guest on /seller)
  if (activeView === 'seller' || role === 'seller') {
    return (
      <ProtectedRoute
        allowedRoles={['seller']}
        allowGuest={true}
        onRedirect={(targetPath) => {
          syncRouteWithRole(targetPath, role);
        }}
      >
        <SellerPortalApp
          onCatalogUpdated={() => fetchCatalog(true)}
          onNavigateToStorefront={() => {
            const target = getLogoClickTarget(role);
            window.history.pushState({}, '', target);
            syncRouteWithRole(target, role);
          }}
        />
      </ProtectedRoute>
    );
  }

  // Dedicated Standalone Admin Route Branch (Admin ONLY sees /admin — neither buyer panel nor seller panel)
  if (activeView === 'admin' || role === 'admin') {
    return (
      <ProtectedRoute
        allowedRoles={['admin']}
        allowGuest={true}
        onRedirect={(targetPath) => {
          syncRouteWithRole(targetPath, role);
        }}
      >
        <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-slate-900">
          <header className="sticky top-0 z-40 bg-slate-900 text-white border-b border-slate-800 shadow-xs">
            <div className="max-w-[1360px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
              <button
                type="button"
                onClick={() => {
                  const target = getLogoClickTarget(role);
                  window.history.pushState({}, '', target);
                  syncRouteWithRole(target, role);
                }}
                className="flex items-center gap-2.5 text-left cursor-pointer"
              >
                <div className="w-9 h-9 rounded-xl bg-emerald-700 flex items-center justify-center text-white">
                  <Leaf className="w-5 h-5" />
                </div>
                <div>
                  <span className="font-display font-extrabold text-base text-white block leading-none">
                    Bharat<span className="text-emerald-400">Organic</span>
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                    Admin Command Centre
                  </span>
                </div>
              </button>

              {role === 'admin' && user && (
                <div className="flex items-center gap-3">
                  <span className="px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-xs font-extrabold">
                    Admin · +91 {user.phone}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      logout();
                      window.history.pushState({}, '', '/');
                      setActiveView('home');
                    }}
                    className="px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-extrabold cursor-pointer"
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          </header>

          {role !== 'admin' ? (
            <div className="flex-1 flex items-center justify-center p-4">
              <form
                onSubmit={handleAdminStandaloneLogin}
                className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 max-w-md w-full shadow-lg space-y-4"
              >
                <div className="flex items-center gap-2.5">
                  <ShieldCheck className="w-6 h-6 text-emerald-700" />
                  <h1 className="font-display text-xl font-extrabold text-slate-900">
                    Admin Sign In (/admin)
                  </h1>
                </div>
                <p className="text-xs text-slate-500">
                  Restricted to the designated Bharat Organic platform administrator (+91 9999900001).
                </p>
                {adminLoginError && (
                  <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-bold text-red-700">
                    {adminLoginError}
                  </div>
                )}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Admin Mobile Number
                  </label>
                  <input
                    type="tel"
                    maxLength={10}
                    value={adminPhoneInput}
                    onChange={(e) => setAdminPhoneInput(e.target.value.replace(/\D/g, ''))}
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-200 text-sm font-mono-tabular"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    6-Digit OTP
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    value={adminOtpInput}
                    onChange={(e) => setAdminOtpInput(e.target.value.replace(/\D/g, ''))}
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-200 text-sm font-mono-tabular"
                  />
                </div>
                <button
                  type="submit"
                  disabled={adminLoggingIn}
                  className="w-full h-11 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-extrabold cursor-pointer"
                >
                  {adminLoggingIn ? 'Verifying Admin...' : 'Login to Admin Command Centre →'}
                </button>
              </form>
            </div>
          ) : (
            <main className="flex-1">
              <OrderTrackingView
                mode="admin"
                activeOrder={activeOrder || orders[0] || null}
                orders={orders}
                products={products}
                categories={categories}
                subcategories={subcategories}
                user={user}
                onSelectOrderForTracking={(ord) => {
                  setActiveOrder(ord);
                }}
                onUpdateOrderStatus={handleUpdateOrderStatus}
                onReorder={handleReorder}
                onUpdateProductStock={handleUpdateProductStock}
                onRefreshCatalog={() => fetchCatalog(true)}
                onBackToStore={() => {
                  window.history.pushState({}, '', '/admin');
                }}
              />
            </main>
          )}
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute
      allowedRoles={['customer']}
      allowGuest={true}
      onRedirect={(targetPath) => {
        syncRouteWithRole(targetPath, role);
      }}
    >
      <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-slate-900 pb-20 sm:pb-0">
        {/* 1. STICKY BUYER HEADER (Customer/Guest only — no Seller or Admin icons) */}
        <Header
          currentAddress={currentAddress}
          onOpenLocationModal={() => setLocationModalOpen(true)}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSelectProduct={(prod) => setDetailProduct(prod)}
          onSelectCategory={(cat) => {
            setSelectedCategory(cat);
            setActiveView('category');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          onNavigateView={(v) => {
            if (window.location.pathname !== '/') {
              window.history.pushState({}, '', '/');
            }
            setActiveView(v);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          activeView={activeView}
          activeTabGroup={activeTabGroup}
          onSelectTabGroup={setActiveTabGroup}
          user={user}
          onOpenLoginModal={() => setLoginModalOpen(true)}
          onLogout={() => {
            logout();
            window.history.pushState({}, '', '/');
            setActiveView('home');
          }}
          cartItemCount={bill.itemCount}
          cartTotalPay={bill.toPay}
          onOpenCartDrawer={() => setCartDrawerOpen(true)}
          products={products}
          categories={categories}
          wishlistIds={wishlistIds}
        />

      {/* Non-Serviceable Location Warning Banner */}
      {!currentAddress.isServiceable && (
        <div className="bg-amber-500 text-slate-950 px-4 py-2 text-xs font-extrabold text-center flex items-center justify-center gap-3">
          <span>
            We don't deliver to {currentAddress.city} ({currentAddress.pincode}) yet —
            currently browsing in read-only mode.
          </span>
          <button
            type="button"
            onClick={() => setLocationModalOpen(true)}
            className="px-2.5 py-1 rounded-lg bg-slate-950 text-white text-[11px] font-bold"
          >
            Switch Location
          </button>
        </div>
      )}

      {/* MAIN CONTENT AREA */}
      <main className="flex-1">
        {loadingCatalog ? (
          /* Skeleton Loader State */
          <div className="max-w-[1360px] mx-auto px-4 sm:px-6 py-6 space-y-6">
            <div className="h-56 rounded-3xl bg-slate-200/80 animate-pulse" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((n) => (
                <div
                  key={n}
                  className="h-36 rounded-2xl bg-slate-200/70 animate-pulse"
                />
              ))}
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 md:grid-cols-9 gap-3">
              {Array.from({ length: 18 }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-square rounded-2xl bg-slate-200/70 animate-pulse"
                />
              ))}
            </div>
          </div>
        ) : catalogError ? (
          <div className="max-w-lg mx-auto my-16 p-8 bg-white rounded-3xl border border-slate-200 text-center space-y-4">
            <p className="text-sm font-bold text-red-600">{catalogError}</p>
            <button
              type="button"
              onClick={() => fetchCatalog(false)}
              className="px-5 py-2.5 rounded-xl bg-emerald-700 text-white text-xs font-extrabold"
            >
              Retry Loading Store
            </button>
          </div>
        ) : activeView === 'category' && selectedCategory ? (
          <CategoryView
            category={selectedCategory}
            allCategories={categories}
            subcategories={subcategories}
            products={products}
            etaMinutes={currentAddress.etaMinutes}
            getQuantity={getQuantity}
            onUpdateQuantity={handleUpdateQuantity}
            onOpenDetail={(prod) => setDetailProduct(prod)}
            onSelectCategory={(cat) => setSelectedCategory(cat)}
            onBackHome={() => setActiveView('home')}
            wishlistIds={wishlistIds}
            onToggleWishlist={(id) =>
              setWishlistIds((prev) =>
                prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
              )
            }
          />
        ) : activeView === 'search' ? (
          <SearchResultsView
            query={debouncedSearchQuery}
            onQueryChange={setSearchQuery}
            products={products}
            categories={categories}
            etaMinutes={currentAddress.etaMinutes}
            getQuantity={getQuantity}
            onUpdateQuantity={handleUpdateQuantity}
            onOpenDetail={(prod) => setDetailProduct(prod)}
            onBackHome={() => {
              setSearchQuery('');
              setActiveView('home');
            }}
            wishlistIds={wishlistIds}
            onToggleWishlist={(id) =>
              setWishlistIds((prev) =>
                prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
              )
            }
          />
        ) : activeView === 'tracking' || activeView === 'orders' ? (
          <OrderTrackingView
            mode={activeView}
            activeOrder={activeOrder || orders[0] || null}
            orders={orders}
            products={products}
            categories={categories}
            subcategories={subcategories}
            user={user}
            onSelectOrderForTracking={(ord) => {
              setActiveOrder(ord);
              setActiveView('tracking');
            }}
            onUpdateOrderStatus={handleUpdateOrderStatus}
            onReorder={handleReorder}
            onUpdateProductStock={handleUpdateProductStock}
            onRefreshCatalog={() => fetchCatalog(true)}
            onBackToStore={() => setActiveView('home')}
          />
        ) : (
          /* 2. HOME PAGE */
          <div className="max-w-[1360px] mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-8">
            {/* Hero Banner */}
            <section className="rounded-3xl bg-gradient-to-r from-emerald-900 via-emerald-800 to-teal-900 text-white p-6 sm:p-8 lg:p-10 shadow-md overflow-hidden relative">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
                <div className="lg:col-span-8 space-y-4">
                  <div className="inline-flex items-center gap-2 text-xs font-extrabold text-amber-300 tracking-wide uppercase">
                    <Sparkles className="w-4 h-4" />
                    <span>NPOP Certified Organic · 21-Minute Express Delivery</span>
                  </div>
                  <h1
                    className="font-display text-2xl sm:text-4xl lg:text-[42px] font-extrabold leading-[1.12] tracking-tight"
                    style={{ textWrap: 'balance' }}
                  >
                    Stock up on daily essentials – farm-fresh vegetables, ghee, dal &amp; more
                  </h1>
                  <p className="text-xs sm:text-sm text-emerald-100 max-w-2xl leading-relaxed">
                    Direct from 14,000+ certified Indian organic farmers. Vedic Bilona A2 Gir Cow Ghee, unpolished Toor Dal, stone-ground Sharbati Atta, and residue-free greens delivered in {currentAddress.etaMinutes} minutes.
                  </p>
                  <div className="pt-1 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => openCategoryBySlug('fruits-vegetables')}
                      className="px-6 py-3 rounded-2xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-xs sm:text-sm shadow-sm flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      <span>Shop Now</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => openCategoryBySlug('ghee-oils')}
                      className="px-5 py-3 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/25 text-white font-bold text-xs sm:text-sm transition-colors cursor-pointer"
                    >
                      Explore Vedic A2 Ghee
                    </button>
                  </div>
                </div>

                <div className="lg:col-span-4 hidden lg:flex justify-end">
                  <div className="w-64 h-64 rounded-3xl bg-white/10 p-3 backdrop-blur-xs border border-white/20 shadow-xl">
                    <img
                      src={heroArtUri}
                      alt="Bharat Organic A2 Ghee and Harvest"
                      className="w-full h-full rounded-2xl object-cover"
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* Row of 4 Promo Cards with Distinct Colours */}
            <section
              aria-label="Featured promotions"
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4"
            >
              {[
                {
                  title: 'Fresh Vegetables & Greens',
                  subtitle: 'Harvested at 5 AM · 100% Pesticide-Free',
                  bg: 'bg-emerald-50 border-emerald-200/90',
                  titleColor: 'text-emerald-950',
                  subColor: 'text-emerald-800',
                  btnBg: 'bg-emerald-700 hover:bg-emerald-800 text-white',
                  slug: 'fruits-vegetables',
                },
                {
                  title: 'Home Remedies at your doorstep',
                  subtitle: 'Kadha Mix, Fresh Tulsi, Ginger, Honey & ORS',
                  bg: 'bg-teal-50 border-teal-200/90',
                  titleColor: 'text-teal-950',
                  subColor: 'text-teal-800',
                  btnBg: 'bg-teal-700 hover:bg-teal-800 text-white',
                  slug: 'home-remedies-wellness',
                },
                {
                  title: 'Pure A2 Ghee & Cold-Pressed Oils',
                  subtitle: 'Vedic Bilona Gir Ghee & Lakdi Ghani Sarson',
                  bg: 'bg-amber-50 border-amber-200/90',
                  titleColor: 'text-amber-950',
                  subColor: 'text-amber-800',
                  btnBg: 'bg-amber-600 hover:bg-amber-700 text-white',
                  slug: 'ghee-oils',
                },
                {
                  title: 'Zero-Palm-Oil Snacks & Makhana',
                  subtitle: 'GI Mithila Jumbo Makhana & Coconut Oil Chips',
                  bg: 'bg-purple-50 border-purple-200/90',
                  titleColor: 'text-purple-950',
                  subColor: 'text-purple-800',
                  btnBg: 'bg-purple-700 hover:bg-purple-800 text-white',
                  slug: 'makhana-more',
                },
              ].map((promo) => (
                <div
                  key={promo.title}
                  onClick={() => openCategoryBySlug(promo.slug)}
                  className={`rounded-2xl border p-5 flex flex-col justify-between cursor-pointer transition-transform duration-150 hover:-translate-y-0.5 shadow-2xs ${promo.bg}`}
                >
                  <div>
                    <h3
                      className={`font-display text-base sm:text-lg font-extrabold leading-snug ${promo.titleColor}`}
                    >
                      {promo.title}
                    </h3>
                    <p className={`text-xs mt-1 font-medium ${promo.subColor}`}>
                      {promo.subtitle}
                    </p>
                  </div>
                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openCategoryBySlug(promo.slug);
                      }}
                      className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-colors cursor-pointer ${promo.btnBg}`}
                    >
                      Order Now →
                    </button>
                  </div>
                </div>
              ))}
            </section>

            {/* "Shop by Category" Grid (18 Rounded Tiles with Studio Product Photos & 2-Line Labels) */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-display text-lg sm:text-xl font-extrabold text-slate-900">
                    Shop by Category
                  </h2>
                  <p className="text-xs text-slate-500">
                    18 certified organic aisles · Direct from farmer producer collectives
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openCategoryBySlug('fruits-vegetables')}
                  className="text-xs sm:text-sm font-extrabold text-emerald-700 hover:underline cursor-pointer"
                >
                  See all ({categories.length}) →
                </button>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-9 gap-2.5 sm:gap-3.5">
                {displayedCategories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      setSelectedCategory(cat);
                      setActiveView('category');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="group flex flex-col items-center text-center focus:outline-none cursor-pointer"
                  >
                    <div className="w-full aspect-square rounded-2xl bg-white border border-slate-200/80 p-1.5 shadow-2xs group-hover:border-emerald-600 group-hover:shadow-md transition-all overflow-hidden">
                      <img
                        src={resolveProductPhoto({
                          name: cat.name,
                          slug: cat.slug,
                          imageUrl: cat.imageUrl,
                          unitLabel: 'Organic',
                        })}
                        alt={cat.name}
                        width={140}
                        height={140}
                        loading="lazy"
                        className="w-full h-full rounded-xl object-cover group-hover:scale-105 transition-transform duration-200"
                      />
                    </div>
                    <span className="mt-2 text-[11px] sm:text-xs font-bold text-slate-800 group-hover:text-emerald-800 leading-tight line-clamp-2 min-h-[30px]">
                      {cat.name}
                    </span>
                  </button>
                ))}
              </div>
            </section>

            {/* Horizontal Product Rows per Category with Arrow Scroll Buttons */}
            <HorizontalProductShelf
              title="Trending Now Near You"
              subtitle="Most ordered in Sector 50 & NCR in the last hour"
              products={trendingProducts}
              etaMinutes={currentAddress.etaMinutes}
              getQuantity={getQuantity}
              onUpdateQuantity={handleUpdateQuantity}
              onOpenDetail={(prod) => setDetailProduct(prod)}
              onSeeAll={() => openCategoryBySlug('fruits-vegetables')}
              wishlistIds={wishlistIds}
              onToggleWishlist={(id) =>
                setWishlistIds((prev) =>
                  prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                )
              }
            />

            <HorizontalProductShelf
              title="Best Sellers — Daily Organic Staples"
              subtitle="Vedic A2 Ghee, Malai Paneer, Sharbati Atta & Unpolished Toor Dal"
              products={bestSellerProducts}
              etaMinutes={currentAddress.etaMinutes}
              getQuantity={getQuantity}
              onUpdateQuantity={handleUpdateQuantity}
              onOpenDetail={(prod) => setDetailProduct(prod)}
              onSeeAll={() => openCategoryBySlug('atta-rice-oil-dal')}
              wishlistIds={wishlistIds}
              onToggleWishlist={(id) =>
                setWishlistIds((prev) =>
                  prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                )
              }
            />

            <HorizontalProductShelf
              title="Fresh Greens & Dawn Harvest"
              subtitle="Residue-free baby palak, desi tomatoes, pahadi aloo & herbs"
              products={freshGreenProducts}
              etaMinutes={currentAddress.etaMinutes}
              getQuantity={getQuantity}
              onUpdateQuantity={handleUpdateQuantity}
              onOpenDetail={(prod) => setDetailProduct(prod)}
              onSeeAll={() => openCategoryBySlug('fruits-vegetables')}
              wishlistIds={wishlistIds}
              onToggleWishlist={(id) =>
                setWishlistIds((prev) =>
                  prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                )
              }
            />

            <HorizontalProductShelf
              title="Pure Bilona A2 Ghee & Lakdi Ghani Oils"
              subtitle="Hand-churned curd ghee & cold wood-pressed mustard, groundnut & coconut oils"
              products={gheeAndOilProducts}
              etaMinutes={currentAddress.etaMinutes}
              getQuantity={getQuantity}
              onUpdateQuantity={handleUpdateQuantity}
              onOpenDetail={(prod) => setDetailProduct(prod)}
              onSeeAll={() => openCategoryBySlug('ghee-oils')}
              wishlistIds={wishlistIds}
              onToggleWishlist={(id) =>
                setWishlistIds((prev) =>
                  prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                )
              }
            />
          </div>
        )}
      </main>

      {/* STICKY MOBILE BOTTOM CART BAR ("X items • ₹Y • View Cart") */}
      {bill.itemCount > 0 && !cartDrawerOpen && (
        <div className="fixed bottom-3 left-3 right-3 z-30 md:hidden">
          <button
            type="button"
            onClick={() => setCartDrawerOpen(true)}
            className="w-full h-13 rounded-2xl bg-emerald-700 text-white px-4 shadow-xl flex items-center justify-between font-extrabold text-sm tabular-nums"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-800 flex items-center justify-center">
                <ShoppingCart className="w-4 h-4 text-amber-300" />
              </div>
              <span>
                {bill.itemCount} {bill.itemCount === 1 ? 'item' : 'items'} • ₹
                {bill.toPay}
              </span>
            </div>
            <span className="flex items-center gap-1">
              View Cart
              <ChevronRight className="w-4 h-4" />
            </span>
          </button>
        </div>
      )}

      {/* FOOTER (Customer-only links; zero Seller or Admin links in DOM) */}
      <footer className="bg-white border-t border-slate-200 mt-14 py-8 px-4 sm:px-6">
        <div className="max-w-[1360px] mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 text-xs text-slate-500">
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => {
                const target = getLogoClickTarget(role);
                window.history.pushState({}, '', target);
                syncRouteWithRole(target, role);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="flex items-center gap-2 font-display font-extrabold text-base text-slate-900 hover:text-emerald-700 cursor-pointer"
            >
              <Leaf className="w-5 h-5 text-emerald-700" />
              <span>Bharat Organic Quick-Commerce</span>
            </button>
            <p>
              100% Certified Organic Groceries, A2 Dairy, Unpolished Staples &amp; Non-Prescription Home Wellness.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setActiveView('orders')}
              className="hover:text-emerald-700 font-semibold cursor-pointer"
            >
              My Orders
            </button>
          </div>
        </div>
      </footer>

      {/* MODALS & DRAWERS */}
      <ProductDetailModal
        product={detailProduct}
        onClose={() => setDetailProduct(null)}
        etaMinutes={currentAddress.etaMinutes}
        getQuantity={getQuantity}
        onUpdateQuantity={handleUpdateQuantity}
        allProducts={products}
        onSelectProduct={(prod) => setDetailProduct(prod)}
        wishlistIds={wishlistIds}
        onToggleWishlist={(id) =>
          setWishlistIds((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
          )
        }
      />

      <LocationModal
        isOpen={locationModalOpen}
        onClose={() => setLocationModalOpen(false)}
        currentAddress={currentAddress}
        savedAddresses={savedAddresses}
        onSaveAddress={handleSaveAddress}
      />

      <LoginModal
        isOpen={loginModalOpen}
        onClose={() => setLoginModalOpen(false)}
        onLoginSuccess={(loggedInUser, token) => {
          login(loggedInUser, token);
        }}
      />

      <CartDrawer
        isOpen={cartDrawerOpen}
        onClose={() => setCartDrawerOpen(false)}
        cartItems={cartItems}
        bill={bill}
        coupons={coupons}
        appliedCoupon={appliedCoupon}
        onApplyCoupon={setAppliedCoupon}
        onUpdateCartItemQty={handleUpdateCartItemByKey}
        onAddSuggestion={(prod, variant) => handleUpdateQuantity(prod, variant, 1)}
        suggestions={cartSuggestions}
        user={user}
        currentAddress={currentAddress}
        hasConfirmedAddress={hasConfirmedAddress}
        scheduledSlot={scheduledSlot}
        onChangeScheduledSlot={setScheduledSlot}
        onOpenLoginModal={() => setLoginModalOpen(true)}
        onOpenLocationModal={() => setLocationModalOpen(true)}
        onProceedToCheckout={() => {
          setCartDrawerOpen(false);
          setCheckoutModalOpen(true);
        }}
      />

      {user && (
        <CheckoutModal
          isOpen={checkoutModalOpen}
          onClose={() => setCheckoutModalOpen(false)}
          cartItems={cartItems}
          bill={bill}
          appliedCoupon={appliedCoupon}
          user={user}
          authToken={authToken}
          currentAddress={currentAddress}
          scheduledSlot={scheduledSlot}
          onOrderCompleted={(createdOrder) => {
            setCheckoutModalOpen(false);
            setCartItems([]);
            setAppliedCoupon(null);
            setOrders((prev) => [
              createdOrder,
              ...prev.filter((o) => o.id !== createdOrder.id),
            ]);
            setActiveOrder(createdOrder);
            setActiveView('tracking');
            fetchCatalog(true);
          }}
        />
      )}
      </div>
    </ProtectedRoute>
  );
}
