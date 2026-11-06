import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Leaf,
  CheckCircle2,
  AlertCircle,
  Lock,
  LogOut,
  Edit3,
  Plus,
  Trash2,
  Upload,
  Building2,
  Award,
  FileText,
  Landmark,
  MapPin,
  PenTool,
  ShieldCheck,
  Package,
  LayoutDashboard,
  ShoppingBag,
  Boxes,
  IndianRupee,
  Settings,
  Clock,
  RefreshCw,
  ChevronRight,
  ArrowLeft,
  Eye,
  Phone,
  Mail,
  Sparkles,
  Check,
  XCircle,
} from 'lucide-react';
import {
  SELLER_CATEGORIES_LIST,
  BUSINESS_TYPES_LIST,
  SPOC_DESIGNATIONS_LIST,
  INDIAN_STATES_LIST,
  PICKUP_TIME_SLOTS_LIST,
  validatePan,
  validateGstin,
  validateIfsc,
  validatePincode,
  validateMobile,
  validateFssai,
  lookupIfscLocally,
  validateSellerWizardStep,
} from '../utils/sellerValidation.ts';
import {
  supabase,
  signInWithPhoneOtp,
  syncSellerToSupabaseTable,
  syncProductToSupabaseTable,
} from '../lib/supabase.ts';
import {
  RESEND_OTP_COOLDOWN_SECONDS,
  formatE164IndianPhone,
  formatSupabaseAuthError,
} from '../utils/phoneAuth.ts';

interface SellerSession {
  token: string;
  uid: string;
  phone: string;
  email: string;
  role: string;
}

const SELLER_SESSION_STORAGE_KEY = 'bharat_organic_seller_session_v1';

const WIZARD_STEPS = [
  { step: 1, title: 'Business Details', subtitle: 'Categories, retail & SPOC', icon: Building2 },
  { step: 2, title: 'Brand Details', subtitle: 'Logo, story & sample photos', icon: Award },
  { step: 3, title: 'Seller & KYC Details', subtitle: 'PAN, GSTIN, FSSAI & address', icon: FileText },
  { step: 4, title: 'Bank Details', subtitle: 'IFSC & cancelled cheque', icon: Landmark },
  { step: 5, title: 'Pickup Locations', subtitle: 'Warehouses & time slots', icon: MapPin },
  { step: 6, title: 'Digital Signature', subtitle: 'Sign & accept agreement', icon: PenTool },
  { step: 7, title: 'Verify & Submit', subtitle: 'Review all steps & submit', icon: ShieldCheck },
] as const;

type DashboardTab =
  | 'dashboard'
  | 'products'
  | 'add-product'
  | 'orders'
  | 'inventory'
  | 'payments'
  | 'settings';

interface SellerPortalAppProps {
  onNavigateToStorefront?: () => void;
  onCatalogUpdated?: () => void;
}

/**
 * Reads an uploaded image or document file as a Data URL (preserving exact user pixels as-is)
 * and attempts optional upload to Supabase Storage bucket when configured.
 */
async function readFileAsDataUrlAndUpload(
  file: File,
  bucketName: 'seller-logos' | 'seller-documents' | 'product-images',
  userUid: string
): Promise<string> {
  // Try Supabase Storage if configured
  if (supabase) {
    try {
      const safeName = `${userUid}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const { data, error } = await supabase.storage.from(bucketName).upload(safeName, file, {
        upsert: true,
      });
      if (!error && data?.path && bucketName !== 'seller-documents') {
        const { data: pub } = supabase.storage.from(bucketName).getPublicUrl(data.path);
        if (pub?.publicUrl) {
          return pub.publicUrl;
        }
      }
    } catch {
      // Fallback to direct data URL storage below
    }
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read file'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export const SellerPortalApp: React.FC<SellerPortalAppProps> = ({
  onNavigateToStorefront,
  onCatalogUpdated,
}) => {
  // 1. Seller Auth State
  const [session, setSession] = useState<SellerSession | null>(() => {
    try {
      const raw = localStorage.getItem(SELLER_SESSION_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const [authPhone, setAuthPhone] = useState('');
  const [authPhoneOtpSent, setAuthPhoneOtpSent] = useState(false);
  const [authPhoneOtp, setAuthPhoneOtp] = useState('');
  const [authPhoneResendTimer, setAuthPhoneResendTimer] = useState(0);
  const [authEmail, setAuthEmail] = useState('');
  const [authEmailOtpSent, setAuthEmailOtpSent] = useState(false);
  const [authEmailOtp, setAuthEmailOtp] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [roleConflictState, setRoleConflictState] = useState<{
    existingRole: string;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (authPhoneResendTimer <= 0) return;
    const t = setInterval(() => {
      setAuthPhoneResendTimer((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [authPhoneResendTimer]);

  // 2. Loaded Seller Bundle
  const [bundle, setBundle] = useState<any | null>(null);
  const [loadingBundle, setLoadingBundle] = useState(false);
  const [activeStep, setActiveStep] = useState<number>(1);
  const [savingStep, setSavingStep] = useState(false);
  const [autosaveStatus, setAutosaveStatus] = useState<string>('');
  const [wizardBannerError, setWizardBannerError] = useState<string | null>(null);
  const [forceEditOnboarding, setForceEditOnboarding] = useState(false);

  // Sidebar Contact Edit Modal
  const [editingContacts, setEditingContacts] = useState(false);
  const [editPhoneInput, setEditPhoneInput] = useState('');
  const [editEmailInput, setEditEmailInput] = useState('');
  const [contactSaveMsg, setContactSaveMsg] = useState<string | null>(null);

  // 3. Step 1 Form State (Business Details)
  const [categoriesSold, setCategoriesSold] = useState<string[]>([]);
  const [retailChannels, setRetailChannels] = useState<
    { channel: string; monthlySales: string; referenceLink: string }[]
  >([]);
  const [socialChannels, setSocialChannels] = useState<
    { platform: string; followers: string; link: string }[]
  >([]);
  const [spocName, setSpocName] = useState('');
  const [spocDesignation, setSpocDesignation] = useState<string>(SPOC_DESIGNATIONS_LIST[0]);

  // 4. Step 2 Form State (Brand Details)
  const [brandName, setBrandName] = useState('');
  const [brandLogoUrl, setBrandLogoUrl] = useState('');
  const [shortDescription, setShortDescription] = useState('');
  const [brandStory, setBrandStory] = useState('');
  const [brandPhotos, setBrandPhotos] = useState<string[]>([]);
  const [websiteUrl, setWebsiteUrl] = useState('');

  // 5. Step 3 Form State (Seller & KYC Details)
  const [businessType, setBusinessType] = useState<string>(BUSINESS_TYPES_LIST[1]);
  const [legalBusinessName, setLegalBusinessName] = useState('');
  const [panNumber, setPanNumber] = useState('');
  const [gstinNumber, setGstinNumber] = useState('');
  const [gstBelowThreshold, setGstBelowThreshold] = useState(false);
  const [fssaiNumber, setFssaiNumber] = useState('');
  const [fssaiExpiryDate, setFssaiExpiryDate] = useState('');
  const [fssaiCertificateUrl, setFssaiCertificateUrl] = useState('');
  const [registeredState, setRegisteredState] = useState('Haryana');
  const [registeredDistrict, setRegisteredDistrict] = useState('');
  const [registeredPincode, setRegisteredPincode] = useState('');

  // 6. Step 4 Form State (Bank Details)
  const [accountHolderName, setAccountHolderName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [confirmAccountNumber, setConfirmAccountNumber] = useState('');
  const [accountNumberMasked, setAccountNumberMasked] = useState('');
  const [editingBankAccount, setEditingBankAccount] = useState(false);
  const [ifscCode, setIfscCode] = useState('');
  const [bankName, setBankName] = useState('');
  const [branchName, setBranchName] = useState('');
  const [cancelledChequeUrl, setCancelledChequeUrl] = useState('');

  // 7. Step 5 Form State (Shipping / Pickup Locations)
  const [warehouses, setWarehouses] = useState<
    {
      warehouseName: string;
      pickupAddress: string;
      pincode: string;
      contactPerson: string;
      contactPhone: string;
      pickupTimeSlots: string[];
      isPrimary: boolean;
    }[]
  >([]);

  // 8. Step 6 Form State (Digital Signature & Agreement)
  const [signatureDataUrl, setSignatureDataUrl] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawingSignature, setIsDrawingSignature] = useState(false);

  // 9. Seller Dashboard & Add/Edit Product State (/seller/dashboard & /seller/products/new)
  const [dashboardTab, setDashboardTab] = useState<DashboardTab>(() => {
    const p = window.location.pathname.toLowerCase();
    if (p.startsWith('/seller/products/new')) return 'add-product';
    return 'dashboard';
  });
  const [showSubmittedSuccessScreen, setShowSubmittedSuccessScreen] = useState(false);
  const [wizardSubmitSuccessMsg, setWizardSubmitSuccessMsg] = useState<string | null>(null);
  const [routeGuardNotice, setRouteGuardNotice] = useState<string | null>(null);

  // Add Product Form (/seller/products/new) State
  const [newProdName, setNewProdName] = useState('');
  const [newProdSellerCategory, setNewProdSellerCategory] = useState<string>(
    SELLER_CATEGORIES_LIST[0]
  );
  const [newProdBrand, setNewProdBrand] = useState('');
  const [newProdDescription, setNewProdDescription] = useState('');
  const [newProdMrp, setNewProdMrp] = useState('225');
  const [newProdPrice, setNewProdPrice] = useState('180');
  const [newProdUnitQty, setNewProdUnitQty] = useState('500');
  const [newProdUnitType, setNewProdUnitType] = useState<'g' | 'kg' | 'ml' | 'l' | 'pcs'>('g');
  const [newProdStock, setNewProdStock] = useState('60');
  const [newProdCertificateUrl, setNewProdCertificateUrl] = useState('');
  const [newProdPhotos, setNewProdPhotos] = useState<string[]>([]);
  const [creatingProduct, setCreatingProduct] = useState(false);
  const [productStatusBanner, setProductStatusBanner] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Edit Product & Stock Update State on My Products
  const [editingProduct, setEditingProduct] = useState<any | null>(null);
  const [editProdName, setEditProdName] = useState('');
  const [editProdCategory, setEditProdCategory] = useState<string>(SELLER_CATEGORIES_LIST[0]);
  const [editProdBrand, setEditProdBrand] = useState('');
  const [editProdDescription, setEditProdDescription] = useState('');
  const [editProdMrp, setEditProdMrp] = useState('');
  const [editProdPrice, setEditProdPrice] = useState('');
  const [editProdUnitType, setEditProdUnitType] = useState<'g' | 'kg' | 'ml' | 'l' | 'pcs'>('g');
  const [editProdUnitLabel, setEditProdUnitLabel] = useState('');
  const [editProdStock, setEditProdStock] = useState('');
  const [editProdPhotos, setEditProdPhotos] = useState<string[]>([]);
  const [savingProductEdit, setSavingProductEdit] = useState(false);
  const [stockDrafts, setStockDrafts] = useState<Record<number, string>>({});

  // Navigate helper that keeps URL synced with /seller, /seller/dashboard, and /seller/products/new
  const navigateSellerSubRoute = useCallback(
    (targetPath: '/seller' | '/seller/dashboard' | '/seller/products/new', tab?: DashboardTab) => {
      if (window.location.pathname !== targetPath) {
        window.history.pushState({}, '', targetPath);
      }
      if (targetPath === '/seller/products/new') {
        setForceEditOnboarding(false);
        setShowSubmittedSuccessScreen(false);
        setDashboardTab('add-product');
      } else if (targetPath === '/seller/dashboard') {
        setForceEditOnboarding(false);
        setShowSubmittedSuccessScreen(false);
        setDashboardTab(tab || 'dashboard');
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    []
  );

  // Route Guard: Block /seller/dashboard or /seller/products/new if not logged in with seller role
  useEffect(() => {
    const p = window.location.pathname.toLowerCase();
    if ((!session || session.role !== 'seller') && p.startsWith('/seller/') && p !== '/seller') {
      window.history.replaceState({}, '', '/seller');
      setRouteGuardNotice(
        'Please sign in with a verified Seller Account to access /seller/dashboard or /seller/products/new.'
      );
    }
  }, [session]);

  // Listen to browser back/forward within /seller/*
  useEffect(() => {
    const handlePop = () => {
      const p = window.location.pathname.toLowerCase();
      if (p.startsWith('/seller/products/new')) {
        setForceEditOnboarding(false);
        setDashboardTab('add-product');
      } else if (p.startsWith('/seller/dashboard')) {
        setForceEditOnboarding(false);
        setDashboardTab('dashboard');
      }
    };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, []);

  // Populate local wizard form fields whenever `bundle` loads
  const hydrateWizardFromBundle = useCallback((b: any, preserveActiveStep = false) => {
    if (!b || !b.profile) return;
    const p = b.profile;
    const bnk = b.bank || {};

    if (!preserveActiveStep) {
      setActiveStep(Math.min(7, Math.max(1, Number(p.currentStep || 1))));
    }

    setCategoriesSold(Array.isArray(p.categoriesSold) ? p.categoriesSold : []);
    setRetailChannels(
      Array.isArray(p.retailChannels) && p.retailChannels.length > 0
        ? p.retailChannels
        : [{ channel: '', monthlySales: '₹1L – ₹5L / month', referenceLink: '' }]
    );
    setSocialChannels(
      Array.isArray(p.socialChannels) && p.socialChannels.length > 0
        ? p.socialChannels
        : [{ platform: 'Instagram', followers: '1K – 10K', link: '' }]
    );
    setSpocName(p.spocName || '');
    setSpocDesignation(p.spocDesignation || SPOC_DESIGNATIONS_LIST[0]);

    setBrandName(p.brandName || '');
    setBrandLogoUrl(p.brandLogoUrl || '');
    setShortDescription(p.shortDescription || '');
    setBrandStory(p.brandStory || '');
    setBrandPhotos(Array.isArray(p.brandPhotos) ? p.brandPhotos : []);
    setWebsiteUrl(p.websiteUrl || '');

    setBusinessType(p.businessType || BUSINESS_TYPES_LIST[1]);
    setLegalBusinessName(p.legalBusinessName || '');
    setPanNumber(p.panNumber || '');
    setGstinNumber(p.gstinNumber || '');
    setGstBelowThreshold(Boolean(p.gstBelowThreshold));
    setFssaiNumber(p.fssaiNumber || '');
    setFssaiExpiryDate(p.fssaiExpiryDate || '');
    setFssaiCertificateUrl(p.fssaiCertificateUrl || '');
    setRegisteredState(p.registeredState || 'Haryana');
    setRegisteredDistrict(p.registeredDistrict || '');
    setRegisteredPincode(p.registeredPincode || '');

    setAccountHolderName(bnk.accountHolderName || '');
    setAccountNumberMasked(bnk.accountNumberMasked || '');
    setEditingBankAccount(!bnk.accountNumberMasked);
    setIfscCode(bnk.ifscCode || '');
    setBankName(bnk.bankName || '');
    setBranchName(bnk.branchName || '');
    setCancelledChequeUrl(bnk.cancelledChequeUrl || '');

    setWarehouses(
      Array.isArray(b.warehouses) && b.warehouses.length > 0
        ? b.warehouses.map((w: any) => ({
            warehouseName: w.warehouseName || 'Primary Warehouse',
            pickupAddress: w.pickupAddress || '',
            pincode: w.pincode || '',
            contactPerson: w.contactPerson || p.spocName || '',
            contactPhone: w.contactPhone || p.phone || '',
            pickupTimeSlots:
              Array.isArray(w.pickupTimeSlots) && w.pickupTimeSlots.length > 0
                ? w.pickupTimeSlots
                : [PICKUP_TIME_SLOTS_LIST[1]],
            isPrimary: Boolean(w.isPrimary),
          }))
        : [
            {
              warehouseName: 'Primary Organic Hub',
              pickupAddress: '',
              pincode: '',
              contactPerson: p.spocName || '',
              contactPhone: p.phone || '',
              pickupTimeSlots: [PICKUP_TIME_SLOTS_LIST[1]],
              isPrimary: true,
            },
          ]
    );

    setSignatureDataUrl(p.signatureDataUrl || '');
    setAcceptedTerms(Boolean(p.acceptedTerms));

    if (p.brandName) {
      setNewProdBrand(p.brandName);
    }
    if (Array.isArray(p.categoriesSold) && p.categoriesSold.length > 0) {
      setNewProdSellerCategory(p.categoriesSold[0]);
    }
  }, []);

  const fetchSellerBundle = useCallback(
    async (activeSession: SellerSession, preserveStep = false) => {
      setLoadingBundle(true);
      try {
        const res = await fetch('/api/seller-portal/me', {
          headers: {
            Authorization: `Bearer ${activeSession.token}`,
          },
        });
        if (!res.ok) {
          throw new Error('Session expired');
        }
        const data = await res.json();
        if (data.bundle) {
          setBundle(data.bundle);
          hydrateWizardFromBundle(data.bundle, preserveStep);
        }
      } catch {
        localStorage.removeItem(SELLER_SESSION_STORAGE_KEY);
        setSession(null);
        setBundle(null);
      } finally {
        setLoadingBundle(false);
      }
    },
    [hydrateWizardFromBundle]
  );

  useEffect(() => {
    if (session && !bundle) {
      fetchSellerBundle(session);
    }
  }, [session, bundle, fetchSellerBundle]);

  // Auto-lookup Bank & Branch whenever IFSC changes
  useEffect(() => {
    const clean = ifscCode.trim().toUpperCase();
    if (clean.length === 11) {
      const localMatch = lookupIfscLocally(clean);
      if (localMatch) {
        setBankName(localMatch.bank);
        setBranchName(localMatch.branch);
      }
    }
  }, [ifscCode]);

  // Build step payload helper
  const getStepPayload = useCallback(
    (stepNum: number) => {
      if (stepNum === 1) {
        return {
          categoriesSold,
          retailChannels,
          socialChannels,
          spocName,
          spocDesignation,
        };
      }
      if (stepNum === 2) {
        return {
          brandName,
          brandLogoUrl,
          shortDescription,
          brandStory,
          brandPhotos,
          websiteUrl,
        };
      }
      if (stepNum === 3) {
        return {
          businessType,
          legalBusinessName,
          panNumber,
          gstinNumber,
          gstBelowThreshold,
          fssaiNumber,
          fssaiExpiryDate,
          fssaiCertificateUrl,
          registeredState,
          registeredDistrict,
          registeredPincode,
        };
      }
      if (stepNum === 4) {
        const effectiveAccountNum =
          !editingBankAccount && accountNumberMasked ? '999999999999' : accountNumber;
        const effectiveConfirmNum =
          !editingBankAccount && accountNumberMasked ? '999999999999' : confirmAccountNumber;
        return {
          accountHolderName,
          accountNumber: effectiveAccountNum,
          confirmAccountNumber: effectiveConfirmNum,
          ifscCode,
          bankName,
          branchName,
          cancelledChequeUrl,
        };
      }
      if (stepNum === 5) {
        return { warehouses };
      }
      if (stepNum === 6) {
        return {
          signatureDataUrl,
          acceptedTerms,
        };
      }
      return {};
    },
    [
      categoriesSold,
      retailChannels,
      socialChannels,
      spocName,
      spocDesignation,
      brandName,
      brandLogoUrl,
      shortDescription,
      brandStory,
      brandPhotos,
      websiteUrl,
      businessType,
      legalBusinessName,
      panNumber,
      gstinNumber,
      gstBelowThreshold,
      fssaiNumber,
      fssaiExpiryDate,
      fssaiCertificateUrl,
      registeredState,
      registeredDistrict,
      registeredPincode,
      accountHolderName,
      accountNumber,
      confirmAccountNumber,
      accountNumberMasked,
      editingBankAccount,
      ifscCode,
      bankName,
      branchName,
      cancelledChequeUrl,
      warehouses,
      signatureDataUrl,
      acceptedTerms,
    ]
  );

  // Compute live validation for current active step (and all steps 1..6 for green ticks)
  const stepValidationMap = React.useMemo(() => {
    const map: Record<number, { valid: boolean; errors: Record<string, string> }> = {};
    for (let s = 1; s <= 6; s++) {
      map[s] = validateSellerWizardStep(s, getStepPayload(s));
    }
    map[7] = {
      valid: [1, 2, 3, 4, 5, 6].every((s) => map[s].valid),
      errors: {},
    };
    return map;
  }, [getStepPayload]);

  const currentStepValidation = stepValidationMap[activeStep] || {
    valid: false,
    errors: {},
  };

  // Debounced Autosave Draft for Steps 1..6 when user edits fields in draft/rejected state
  useEffect(() => {
    if (!session || !bundle || activeStep > 6) return;
    const appStatus = bundle.application?.status;
    if (appStatus === 'approved' && !forceEditOnboarding) return;
    if (appStatus === 'under_review' && !forceEditOnboarding) return;

    const timer = setTimeout(async () => {
      try {
        setAutosaveStatus('Autosaving draft...');
        const payload = getStepPayload(activeStep);
        // Do not overwrite masked bank number with placeholder
        if (activeStep === 4 && !editingBankAccount && accountNumberMasked) {
          delete (payload as any).accountNumber;
        }
        await fetch(`/api/seller-portal/wizard/step/${activeStep}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.token}`,
          },
          body: JSON.stringify({ data: payload }),
        });
        setAutosaveStatus('Draft saved');
      } catch {
        setAutosaveStatus('');
      }
    }, 1200);

    return () => clearTimeout(timer);
  }, [
    session,
    bundle,
    activeStep,
    getStepPayload,
    editingBankAccount,
    accountNumberMasked,
    forceEditOnboarding,
  ]);

  // Handlers for Dual-Factor Seller Login (Mobile OTP + Email OTP)
  const handleSendMobileOtp = async () => {
    if (authPhoneResendTimer > 0) return;
    setAuthError(null);
    const clean = authPhone.replace(/\D/g, '');
    if (!validateMobile(clean)) {
      setAuthError('Enter a valid 10-digit Indian mobile number starting with 6–9.');
      return;
    }
    try {
      const fullPhone = formatE164IndianPhone(clean);
      await signInWithPhoneOtp(fullPhone);
      setAuthPhoneOtpSent(true);
      setAuthPhoneOtp('');
      setAuthPhoneResendTimer(RESEND_OTP_COOLDOWN_SECONDS);
    } catch (err: any) {
      setAuthError(err?.message || 'Failed to send Mobile OTP');
    }
  };

  const handleSendEmailOtp = async () => {
    setAuthError(null);
    const cleanEmail = authEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setAuthError('Please enter a valid business email address.');
      return;
    }
    if (supabase) {
      try {
        await supabase.auth.signInWithOtp({ email: cleanEmail });
      } catch {
        // Fallback to backend email OTP
      }
    }
    const res = await fetch('/api/seller-portal/auth/send-email-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: cleanEmail }),
    });
    const data = await res.json();
    if (!res.ok) {
      setAuthError(data.error || 'Failed to send Email OTP');
      return;
    }
    setAuthEmailOtpSent(true);
  };

  const handleVerifySellerAuth = async (registerAsSeller = false) => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      const fullPhone = formatE164IndianPhone(authPhone);
      if (!supabase) {
        throw new Error('Supabase is not configured. Please check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
      }
      const { error: verifyErr } = await supabase.auth.verifyOtp({
        phone: fullPhone,
        token: authPhoneOtp.trim(),
        type: 'sms',
      });
      if (verifyErr) {
        throw new Error(formatSupabaseAuthError(verifyErr, 'Invalid or expired Mobile OTP.'));
      }

      const res = await fetch('/api/seller-portal/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: authPhone,
          phoneOtp: authPhoneOtp,
          email: authEmail,
          emailOtp: authEmailOtp,
          registerAsSeller,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || 'Verification failed');
        return;
      }

      if (data.roleConflict) {
        setRoleConflictState({
          existingRole: data.existingRole,
          message: data.message || 'This account is not a seller account',
        });
        return;
      }

      setRoleConflictState(null);
      const newSession: SellerSession = {
        token: data.token,
        uid: data.user.uid,
        phone: data.user.phone,
        email: data.user.email,
        role: 'seller',
      };
      localStorage.setItem(SELLER_SESSION_STORAGE_KEY, JSON.stringify(newSession));
      localStorage.setItem(
        'bharat_organic_auth_session_v1',
        JSON.stringify({
          user: {
            uid: data.user.uid,
            phone: data.user.phone,
            email: data.user.email,
            fullName: data.bundle?.profile?.brandName || data.user.fullName || 'Organic Seller Partner',
            role: 'seller',
          },
          token: data.token,
        })
      );
      window.dispatchEvent(new Event('bharat-auth-changed'));
      setSession(newSession);
      if (data.bundle) {
        setBundle(data.bundle);
        hydrateWizardFromBundle(data.bundle, false);
      }
      navigateSellerSubRoute('/seller/dashboard', 'dashboard');
    } catch (err: any) {
      setAuthError(err.message || 'Authentication failed');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem(SELLER_SESSION_STORAGE_KEY);
    localStorage.removeItem('bharat_organic_auth_session_v1');
    window.dispatchEvent(new Event('bharat-auth-changed'));
    setSession(null);
    setBundle(null);
    setRoleConflictState(null);
    setForceEditOnboarding(false);
    window.history.replaceState({}, '', '/seller');
  };

  // Save & Continue handler for Steps 1..6
  const handleSaveAndContinue = async () => {
    if (!session || !currentStepValidation.valid) return;
    setWizardBannerError(null);
    setSavingStep(true);
    try {
      const nextStep = Math.min(7, activeStep + 1);
      const payload = getStepPayload(activeStep);
      if (activeStep === 4 && !editingBankAccount && accountNumberMasked) {
        delete (payload as any).accountNumber;
      }
      const res = await fetch(`/api/seller-portal/wizard/step/${activeStep}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({
          data: payload,
          advanceToStep: nextStep,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save step');
      }
      setBundle(data.bundle);
      hydrateWizardFromBundle(data.bundle, true);
      setActiveStep(nextStep);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      setWizardBannerError(err.message || 'Could not save step');
    } finally {
      setSavingStep(false);
    }
  };

  // Final Submit for Review (Step 7) — Saves to Supabase "sellers" table + PostgreSQL "sellers" table (status = "pending")
  // Bounded timeout + guaranteed finally so "Submitting..." never runs infinitely
  const handleSubmitApplication = async () => {
    if (!session) return;
    const allSixComplete = [1, 2, 3, 4, 5, 6].every((s) => stepValidationMap[s]?.valid);
    if (!allSixComplete) {
      setWizardBannerError('Please complete all 6 onboarding steps before submitting.');
      return;
    }

    setWizardBannerError(null);
    setWizardSubmitSuccessMsg(null);
    setSavingStep(true);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      // Sync to Supabase "sellers" table (user_id, business, brand, KYC, bank, pickup, status = "pending")
      await syncSellerToSupabaseTable({
        user_id: session.uid,
        business: getStepPayload(1),
        brand: getStepPayload(2),
        kyc: { ...getStepPayload(3), ...getStepPayload(6) },
        bank: getStepPayload(4),
        pickup: warehouses,
        status: 'pending',
      });

      const res = await fetch('/api/seller-portal/wizard/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Submission failed');
      }

      setBundle(data.bundle);
      setWizardSubmitSuccessMsg(
        'Application submitted! Saved in sellers table with status = "pending".'
      );
      setForceEditOnboarding(false);
      setShowSubmittedSuccessScreen(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });

      // Auto-redirect to /seller/dashboard after displaying "Application Submitted" screen
      setTimeout(() => {
        setShowSubmittedSuccessScreen(false);
        navigateSellerSubRoute('/seller/dashboard', 'dashboard');
      }, 1500);
    } catch (err: any) {
      const msg =
        err?.name === 'AbortError'
          ? 'Submission timed out. Please check your connection and try again.'
          : err?.message || 'Could not submit application';
      setWizardBannerError(msg);
    } finally {
      clearTimeout(timeoutId);
      setSavingStep(false);
    }
  };

  // Update Seller Login Email & Phone from Sidebar
  const handleSaveContacts = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;
    setContactSaveMsg(null);
    try {
      const res = await fetch('/api/seller-portal/contact', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({
          phone: editPhoneInput,
          email: editEmailInput,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setContactSaveMsg(data.error || 'Failed to update contact details');
        return;
      }
      setBundle(data.bundle);
      const updatedSession = {
        ...session,
        phone: data.bundle.profile.phone,
        email: data.bundle.profile.email,
      };
      setSession(updatedSession);
      localStorage.setItem(SELLER_SESSION_STORAGE_KEY, JSON.stringify(updatedSession));
      setEditingContacts(false);
    } catch (err: any) {
      setContactSaveMsg(err.message || 'Failed to update contact details');
    }
  };

  // Digital Signature Canvas Drawing Handlers
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    ctx.strokeStyle = '#064E3B';
    ctx.lineWidth = 2.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
    setIsDrawingSignature(true);
  };

  const drawSignatureMove = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawingSignature) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.stroke();
  };

  const endDrawing = () => {
    if (!isDrawingSignature) return;
    setIsDrawingSignature(false);
    const canvas = canvasRef.current;
    if (canvas) {
      setSignatureDataUrl(canvas.toDataURL('image/png'));
    }
  };

  const clearSignatureCanvas = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
    setSignatureDataUrl('');
  };

  // Add Product Handler (/seller/products/new) — Saves with seller_id and status = "pending_approval", then navigates to My Products
  const handleCreateSellerProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !bundle) return;
    setProductStatusBanner(null);

    if (newProdName.trim().length < 2) {
      setProductStatusBanner({ type: 'error', text: 'Please enter a valid product name.' });
      return;
    }
    if (newProdPhotos.length === 0) {
      setProductStatusBanner({
        type: 'error',
        text: 'Please upload at least 1 original product photo.',
      });
      return;
    }

    const mrpNum = Number(newProdMrp || 190);
    const priceNum = Number(newProdPrice || 150);
    if (priceNum > mrpNum) {
      setProductStatusBanner({
        type: 'error',
        text: 'Selling price cannot exceed MRP.',
      });
      return;
    }

    const combinedUnitLabel = `${newProdUnitQty.trim() || '1'} ${newProdUnitType}`.trim();

    setCreatingProduct(true);
    try {
      const res = await fetch('/api/seller/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({
          sellerUid: session.uid,
          brand: newProdBrand.trim() || bundle.profile.brandName || 'Certified Organic Seller',
          sellerCategory: newProdSellerCategory,
          name: newProdName.trim(),
          unit: newProdUnitType,
          unitLabel: combinedUnitLabel,
          price: priceNum,
          mrp: mrpNum,
          stock: Number(newProdStock ?? 50),
          description: newProdDescription.trim(),
          certificateUrl: newProdCertificateUrl,
          imageUrl: newProdPhotos[0],
          galleryUrls: newProdPhotos,
          status: 'pending_approval',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save product');
      }

      // Sync to Supabase "products" table with seller_id and status = "pending_approval"
      await syncProductToSupabaseTable(data.product);

      setProductStatusBanner({
        type: 'success',
        text: `"${data.product.name}" saved with status "pending_approval"! Redirecting to My Products...`,
      });
      setNewProdName('');
      setNewProdDescription('');
      setNewProdCertificateUrl('');
      setNewProdPhotos([]);
      await fetchSellerBundle(session, true);
      onCatalogUpdated?.();

      // Navigate to My Products where Edit / Delete / Stock update are available
      navigateSellerSubRoute('/seller/dashboard', 'products');
    } catch (err: any) {
      setProductStatusBanner({
        type: 'error',
        text: err.message || 'Could not save product',
      });
    } finally {
      setCreatingProduct(false);
    }
  };

  // Open Edit Modal for a Seller Product
  const openEditProductModal = (prod: any) => {
    setEditingProduct(prod);
    setEditProdName(prod.name || '');
    setEditProdCategory(prod.sellerCategory || SELLER_CATEGORIES_LIST[0]);
    setEditProdBrand(prod.brand || bundle?.profile?.brandName || '');
    setEditProdDescription(prod.description || '');
    setEditProdMrp(String(prod.mrp || 180));
    setEditProdPrice(String(prod.price || 150));
    setEditProdUnitType((prod.unit as any) || 'g');
    setEditProdUnitLabel(prod.unitLabel || '500 g');
    setEditProdStock(String(prod.stock ?? 50));
    setEditProdPhotos(
      Array.isArray(prod.galleryUrls) && prod.galleryUrls.length > 0
        ? prod.galleryUrls
        : prod.imageUrl
        ? [prod.imageUrl]
        : []
    );
  };

  // Save Edited Product
  const handleSaveEditedProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !editingProduct) return;
    setSavingProductEdit(true);
    try {
      const res = await fetch(`/api/seller/products/${editingProduct.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({
          name: editProdName.trim(),
          sellerCategory: editProdCategory,
          brand: editProdBrand.trim(),
          description: editProdDescription.trim(),
          mrp: Number(editProdMrp),
          price: Number(editProdPrice),
          unit: editProdUnitType,
          unitLabel: editProdUnitLabel.trim(),
          stock: Number(editProdStock),
          imageUrl: editProdPhotos[0] || editingProduct.imageUrl,
          galleryUrls: editProdPhotos.length > 0 ? editProdPhotos : editingProduct.galleryUrls,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update product');
      }
      setEditingProduct(null);
      setProductStatusBanner({
        type: 'success',
        text: `Updated "${data.product.name}" successfully.`,
      });
      await fetchSellerBundle(session, true);
      onCatalogUpdated?.();
    } catch (err: any) {
      setProductStatusBanner({
        type: 'error',
        text: err.message || 'Failed to update product',
      });
    } finally {
      setSavingProductEdit(false);
    }
  };

  // Delete Seller Product
  const handleDeleteSellerProduct = async (prod: any) => {
    if (!session) return;
    try {
      const res = await fetch(`/api/seller/products/${prod.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${session.token}`,
        },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete product');
      }
      setProductStatusBanner({
        type: 'success',
        text: `Deleted "${prod.name}" from your catalog.`,
      });
      await fetchSellerBundle(session, true);
      onCatalogUpdated?.();
    } catch (err: any) {
      setProductStatusBanner({
        type: 'error',
        text: err.message || 'Could not delete product',
      });
    }
  };

  // Quick Stock Update on My Products
  const handleQuickStockUpdate = async (prod: any, nextStockValue: number) => {
    if (!session) return;
    const cleanStock = Math.max(0, Math.round(nextStockValue));
    try {
      const res = await fetch(`/api/seller/products/${prod.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({ stock: cleanStock }),
      });
      if (res.ok) {
        setStockDrafts((prev) => ({ ...prev, [prod.id]: String(cleanStock) }));
        setProductStatusBanner({
          type: 'success',
          text: `Stock for "${prod.name}" updated to ${cleanStock} units.`,
        });
        await fetchSellerBundle(session, true);
        onCatalogUpdated?.();
      }
    } catch {
      // Ignore transient error
    }
  };

  // Logo click handler: Logged-in seller -> /seller/dashboard; Logged-out user -> landing page (/)
  const handleLogoClick = () => {
    if (session && session.role === 'seller') {
      navigateSellerSubRoute('/seller/dashboard', 'dashboard');
    } else {
      window.history.pushState({}, '', '/');
      if (onNavigateToStorefront) {
        onNavigateToStorefront();
      } else {
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
    }
  };

  // ============================================================================
  // VIEW 1: DEDICATED SELLER AUTHENTICATION SCREEN (/seller)
  // ============================================================================
  if (!session) {
    return (
      <div className="min-h-screen bg-[#FAF7F2] flex flex-col lg:flex-row">
        {/* Left Emerald Brand Sidebar */}
        <aside className="lg:w-[420px] bg-emerald-950 text-white p-8 lg:p-10 flex flex-col justify-between shrink-0">
          <div>
            <button
              type="button"
              onClick={handleLogoClick}
              className="flex items-center gap-3 text-left group focus:outline-none cursor-pointer"
              aria-label="Bharat Organic Home"
            >
              <div className="w-11 h-11 rounded-2xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center group-hover:bg-emerald-500/30 transition-colors">
                <Leaf className="w-6 h-6 text-emerald-300" />
              </div>
              <div>
                <span className="font-display text-xl font-extrabold tracking-tight block">
                  BHARAT ORGANIC
                </span>
                <span className="text-xs font-bold uppercase tracking-widest text-emerald-300 block">
                  Seller Hub · Partner Portal
                </span>
              </div>
            </button>

            <div className="mt-10 space-y-6">
              <h1 className="font-display text-2xl sm:text-3xl font-extrabold leading-tight">
                Sell certified organic produce & staples in 21-minute express slots.
              </h1>
              <p className="text-sm text-emerald-100/80 leading-relaxed">
                Direct farm-to-doorstep onboarding inspired by Blinkit Seller Hub. Complete your
                7-step digital KYC & warehouse setup in minutes.
              </p>

              <div className="space-y-3.5 pt-2">
                {[
                  'Dual-verified Seller Account (Mobile OTP + Email OTP)',
                  'Automated IFSC Bank verification & FSSAI compliance',
                  'Dedicated Seller Dashboard for inventory, orders & payouts',
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-2.5 text-xs text-emerald-100">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-10 pt-6 border-t border-emerald-800/60 text-xs text-emerald-300/80">
            <p className="font-semibold text-emerald-200">
              Verified Farm &amp; Organic Brand Partner Onboarding · Bharat Organic
            </p>
          </div>
        </aside>

        {/* Right Login / Sign-up Card */}
        <main className="flex-1 flex items-center justify-center p-6 sm:p-12">
          <div className="w-full max-w-lg bg-white rounded-3xl border border-slate-200/90 shadow-xl p-7 sm:p-9">
            <div className="flex items-center justify-between mb-6">
              <div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-800 text-xs font-extrabold">
                  <Lock className="w-3.5 h-3.5" />
                  /seller · Dedicated Seller Auth
                </span>
                <h2 className="font-display text-2xl font-extrabold text-slate-900 mt-2">
                  Seller Sign-In / Registration
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Both Mobile Number + OTP and Business Email + OTP are mandatory.
                </p>
              </div>
            </div>

            {routeGuardNotice && (
              <div
                role="alert"
                className="mb-4 p-3.5 rounded-2xl bg-amber-50 border border-amber-300 text-xs font-extrabold text-amber-900 flex items-center gap-2"
              >
                <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
                <span>{routeGuardNotice}</span>
              </div>
            )}

            {roleConflictState ? (
              <div
                role="alert"
                className="p-5 rounded-2xl bg-amber-50 border border-amber-300 space-y-4"
              >
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900">
                      This account is not a seller account
                    </h3>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                      The mobile number <strong>+91 {authPhone}</strong> is currently registered as a{' '}
                      <strong className="uppercase">{roleConflictState.existingRole}</strong>{' '}
                      account. One account can hold only one role.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3 pt-1">
                  <button
                    type="button"
                    disabled={authLoading}
                    onClick={() => handleVerifySellerAuth(true)}
                    className="px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-extrabold transition-colors"
                  >
                    Register as Seller
                  </button>
                  <button
                    type="button"
                    onClick={() => setRoleConflictState(null)}
                    className="px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50"
                  >
                    Use a Different Mobile Number
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                {authError && (
                  <div
                    role="alert"
                    className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs font-bold text-red-700 flex items-center gap-2"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{authError}</span>
                  </div>
                )}

                {/* Step A: Mobile Number + OTP */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
                  <label
                    htmlFor="seller-auth-phone"
                    className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider"
                  >
                    1. Mobile Number Verification (Mandatory)
                  </label>
                  <div className="flex gap-2">
                    <div className="flex items-center px-3 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-600">
                      +91
                    </div>
                    <input
                      id="seller-auth-phone"
                      type="tel"
                      maxLength={10}
                      value={authPhone}
                      onChange={(e) => setAuthPhone(e.target.value.replace(/\D/g, ''))}
                      placeholder="10-digit mobile number"
                      className="flex-1 px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                    <button
                      type="button"
                      disabled={authPhoneResendTimer > 0}
                      onClick={handleSendMobileOtp}
                      className="px-3.5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-300 disabled:text-slate-500 text-white text-xs font-extrabold shrink-0 transition-colors"
                    >
                      {authPhoneOtpSent
                        ? authPhoneResendTimer > 0
                          ? `Resend in ${authPhoneResendTimer}s`
                          : 'Resend OTP'
                        : 'Send Mobile OTP'}
                    </button>
                  </div>

                  {authPhoneOtpSent && (
                    <div className="pt-1">
                      <label
                        htmlFor="seller-auth-phone-otp"
                        className="block text-[11px] font-bold text-emerald-800 mb-1"
                      >
                        Enter 6-Digit Mobile OTP sent to +91 {authPhone}
                      </label>
                      <input
                        id="seller-auth-phone-otp"
                        type="text"
                        maxLength={6}
                        value={authPhoneOtp}
                        onChange={(e) => setAuthPhoneOtp(e.target.value.replace(/\D/g, ''))}
                        placeholder="Enter 6-digit OTP"
                        className="w-full px-3.5 py-2 rounded-xl bg-white border border-emerald-400 text-sm font-mono font-bold tracking-widest text-slate-900"
                      />
                    </div>
                  )}
                </div>

                {/* Step B: Email + OTP */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
                  <label
                    htmlFor="seller-auth-email"
                    className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider"
                  >
                    2. Business Email Verification (Mandatory)
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="seller-auth-email"
                      type="email"
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      placeholder="founder@yourorganicbrand.in"
                      className="flex-1 px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                    <button
                      type="button"
                      onClick={handleSendEmailOtp}
                      className="px-3.5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-extrabold shrink-0 transition-colors"
                    >
                      {authEmailOtpSent ? 'Resend OTP' : 'Verify Email'}
                    </button>
                  </div>

                  {authEmailOtpSent && (
                    <div className="pt-1">
                      <label
                        htmlFor="seller-auth-email-otp"
                        className="block text-[11px] font-bold text-emerald-800 mb-1"
                      >
                        Enter 6-Digit Email Verification Code (Demo Code: 123456)
                      </label>
                      <input
                        id="seller-auth-email-otp"
                        type="text"
                        maxLength={6}
                        value={authEmailOtp}
                        onChange={(e) => setAuthEmailOtp(e.target.value.replace(/\D/g, ''))}
                        placeholder="123456"
                        className="w-full px-3.5 py-2 rounded-xl bg-white border border-emerald-400 text-sm font-mono font-bold tracking-widest text-slate-900"
                      />
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  disabled={
                    authLoading ||
                    authPhone.length !== 10 ||
                    authPhoneOtp.length !== 6 ||
                    !authEmail.includes('@') ||
                    authEmailOtp.length !== 6
                  }
                  onClick={() => handleVerifySellerAuth(false)}
                  className="w-full py-3.5 rounded-2xl bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-300 disabled:text-slate-500 text-white font-extrabold text-sm shadow-md transition-all"
                >
                  {authLoading
                    ? 'Verifying Seller Credentials...'
                    : 'Verify Mobile & Email to Continue'}
                </button>
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  if (loadingBundle || !bundle) {
    return (
      <div className="min-h-screen bg-[#FAF7F2] flex items-center justify-center p-8">
        <div className="flex items-center gap-3 text-emerald-900 font-bold text-sm">
          <RefreshCw className="w-5 h-5 animate-spin text-emerald-700" />
          <span>Loading your Seller Hub workspace...</span>
        </div>
      </div>
    );
  }

  const applicationStatus: string = bundle.application?.status || 'draft';
  const currentPathname = window.location.pathname.toLowerCase();
  const isDashboardOrProductUrl =
    currentPathname.startsWith('/seller/dashboard') ||
    currentPathname.startsWith('/seller/products/new');

  // ============================================================================
  // VIEW 2: "APPLICATION SUBMITTED" CONFIRMATION SCREEN (Auto-redirects to /seller/dashboard)
  // ============================================================================
  if (showSubmittedSuccessScreen) {
    return (
      <div className="min-h-screen bg-[#FAF7F2] flex flex-col items-center justify-center p-6">
        <div className="max-w-lg w-full bg-white rounded-3xl border border-emerald-200 shadow-xl p-8 text-center space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-9 h-9" />
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 text-xs font-extrabold">
            Status: Pending Approval
          </span>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-slate-900">
            Application Submitted
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            {wizardSubmitSuccessMsg ||
              'Your 6-step Seller Onboarding application has been saved to the sellers table with status = "pending". Redirecting you to your Seller Dashboard (/seller/dashboard)...'}
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={() => {
                setShowSubmittedSuccessScreen(false);
                navigateSellerSubRoute('/seller/dashboard', 'dashboard');
              }}
              className="w-full py-3.5 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs sm:text-sm font-extrabold shadow-md cursor-pointer"
            >
              Go to Seller Dashboard (/seller/dashboard) →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // VIEW 3: SELLER DASHBOARD (/seller/dashboard) & ADD PRODUCT (/seller/products/new)
  // Seller login ke baad seedha /seller/dashboard khule (unless seller explicitly opened onboarding wizard)
  // ============================================================================
  const shouldShowDashboard = !forceEditOnboarding;

  if (shouldShowDashboard) {
    const myProducts = bundle.myProducts || [];
    const myOrders = bundle.myOrders || [];
    const myPayments = bundle.myPayments || [];
    const totalRevenue = myPayments
      .filter((p: any) => p.payoutStatus !== 'Cancelled')
      .reduce((s: number, p: any) => s + Number(p.netPayout || 0), 0);

    const isSellerApproved = applicationStatus === 'approved';
    const sellerDisplayName =
      bundle.profile.brandName || bundle.profile.spocName || 'Organic Seller Partner';

    return (
      <div className="min-h-screen bg-[#FAF7F2] flex flex-col">
        {/* SELLER HEADER: Strictly ONLY Bharat Organic logo, Dashboard, Add Product, My Products, Orders, Earnings, Profile, Logout */}
        <header className="sticky top-0 z-30 bg-emerald-950 text-white border-b border-emerald-800 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 sm:h-20 flex items-center justify-between gap-3">
            {/* 1. Clickable Bharat Organic Logo -> /seller/dashboard */}
            <button
              type="button"
              onClick={handleLogoClick}
              className="flex items-center gap-2.5 text-left group focus:outline-none cursor-pointer shrink-0"
              aria-label="Bharat Organic"
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-700 flex items-center justify-center text-amber-300 shadow-xs group-hover:bg-emerald-600 transition-colors">
                <Leaf className="w-5 h-5" />
              </div>
              <div>
                <span className="font-display text-base sm:text-lg font-extrabold tracking-tight text-white block leading-none">
                  Bharat <span className="text-emerald-400">Organic</span>
                </span>
              </div>
            </button>

            {/* 2–7. Navigation Links: Dashboard, Add Product, My Products, Orders, Earnings, Profile */}
            <nav
              aria-label="Seller Navigation"
              className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto no-scrollbar"
            >
              <button
                type="button"
                onClick={() => navigateSellerSubRoute('/seller/dashboard', 'dashboard')}
                className={`px-3 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition-colors cursor-pointer ${
                  dashboardTab === 'dashboard'
                    ? 'bg-emerald-700 text-white'
                    : 'text-emerald-100 hover:bg-emerald-900'
                }`}
              >
                Dashboard
              </button>

              <button
                type="button"
                onClick={() => navigateSellerSubRoute('/seller/products/new')}
                className={`px-3 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition-colors cursor-pointer ${
                  dashboardTab === 'add-product'
                    ? 'bg-emerald-500 text-slate-950'
                    : 'bg-emerald-800/80 text-emerald-200 hover:bg-emerald-700 hover:text-white'
                }`}
              >
                Add Product
              </button>

              <button
                type="button"
                onClick={() => navigateSellerSubRoute('/seller/dashboard', 'products')}
                className={`px-3 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition-colors cursor-pointer ${
                  dashboardTab === 'products'
                    ? 'bg-emerald-700 text-white'
                    : 'text-emerald-100 hover:bg-emerald-900'
                }`}
              >
                My Products
              </button>

              <button
                type="button"
                onClick={() => navigateSellerSubRoute('/seller/dashboard', 'orders')}
                className={`px-3 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition-colors cursor-pointer ${
                  dashboardTab === 'orders'
                    ? 'bg-emerald-700 text-white'
                    : 'text-emerald-100 hover:bg-emerald-900'
                }`}
              >
                Orders
              </button>

              <button
                type="button"
                onClick={() => navigateSellerSubRoute('/seller/dashboard', 'payments')}
                className={`px-3 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition-colors cursor-pointer ${
                  dashboardTab === 'payments'
                    ? 'bg-emerald-700 text-white'
                    : 'text-emerald-100 hover:bg-emerald-900'
                }`}
              >
                Earnings
              </button>

              <button
                type="button"
                onClick={() => navigateSellerSubRoute('/seller/dashboard', 'settings')}
                className={`px-3 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition-colors cursor-pointer ${
                  dashboardTab === 'settings'
                    ? 'bg-emerald-700 text-white'
                    : 'text-emerald-100 hover:bg-emerald-900'
                }`}
              >
                Profile
              </button>
            </nav>

            {/* 8. Logout */}
            <div className="flex items-center shrink-0">
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-200 text-xs font-extrabold border border-red-400/30 transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </header>

        {/* Seller Sub-Bar: Seller Name, Status Badge (Pending / Approved), and Large Green "+ Add Product" CTA */}
        <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="font-display text-sm sm:text-base font-extrabold text-slate-900">
                {sellerDisplayName}
              </span>
              <span
                data-testid="seller-status-badge"
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold uppercase tracking-wide ${
                  isSellerApproved
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : 'bg-amber-100 text-amber-800 border border-amber-300'
                }`}
              >
                {isSellerApproved ? (
                  <>
                    <CheckCircle2 className="w-3 h-3" />
                    Approved
                  </>
                ) : (
                  <>
                    <Clock className="w-3 h-3" />
                    Pending
                  </>
                )}
              </span>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setForceEditOnboarding(true);
                  window.history.pushState({}, '', '/seller');
                }}
                className="px-3 py-2 rounded-xl border border-slate-300 hover:bg-slate-50 text-xs font-extrabold text-slate-700 cursor-pointer"
              >
                6-Step Onboarding KYC Wizard
              </button>
              <button
                type="button"
                onClick={() => navigateSellerSubRoute('/seller/products/new')}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs sm:text-sm shadow-xs transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>+ Add Product</span>
              </button>
            </div>
          </div>
        </div>

        {/* Pending Status Information Banner (Sellers can still add products while Pending!) */}
        {!isSellerApproved && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 sm:px-6 py-3">
            <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2 text-xs text-amber-950">
              <div className="flex items-center gap-2 font-bold">
                <Clock className="w-4 h-4 text-amber-700 shrink-0" />
                <span>
                  Your Seller Account status is currently <strong>Pending</strong> Admin review. You
                  can add products right now — they will remain hidden from buyers until Admin
                  approval.
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setForceEditOnboarding(true);
                  setActiveStep(7);
                  window.history.pushState({}, '', '/seller');
                }}
                className="font-extrabold text-emerald-800 hover:underline shrink-0 cursor-pointer"
              >
                Complete / View Onboarding →
              </button>
            </div>
          </div>
        )}

        {/* Main Workspace Container */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
          {/* 5 DASHBOARD CARDS: Add Product, My Products, Orders, Earnings, Profile/KYC */}
          <section
            aria-label="Seller Dashboard Navigation Cards"
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5"
          >
            <button
              type="button"
              onClick={() => navigateSellerSubRoute('/seller/products/new')}
              className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                dashboardTab === 'add-product'
                  ? 'bg-emerald-700 text-white border-emerald-700 shadow-md'
                  : 'bg-emerald-50/90 hover:bg-emerald-100/80 border-emerald-300 text-emerald-950'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase tracking-wider">Add Product</span>
                <Plus className="w-5 h-5" />
              </div>
              <p className="font-display text-base sm:text-lg font-extrabold mt-2">
                + Add Product
              </p>
              <span
                className={`text-[11px] font-semibold mt-0.5 ${
                  dashboardTab === 'add-product' ? 'text-emerald-100' : 'text-emerald-800'
                }`}
              >
                /seller/products/new
              </span>
            </button>

            <button
              type="button"
              onClick={() => navigateSellerSubRoute('/seller/dashboard', 'products')}
              className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                dashboardTab === 'products'
                  ? 'bg-emerald-950 text-white border-emerald-950 shadow-md'
                  : 'bg-white hover:border-emerald-500 border-slate-200/90 text-slate-900'
              }`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`text-xs font-bold ${
                    dashboardTab === 'products' ? 'text-emerald-300' : 'text-slate-500'
                  }`}
                >
                  My Products
                </span>
                <ShoppingBag className="w-4 h-4 text-emerald-600" />
              </div>
              <p className="font-display text-2xl font-extrabold mt-1 tabular-nums">
                {myProducts.length}
              </p>
              <span
                className={`text-[11px] font-semibold ${
                  dashboardTab === 'products' ? 'text-emerald-200' : 'text-emerald-700'
                }`}
              >
                Edit · Delete · Stock
              </span>
            </button>

            <button
              type="button"
              onClick={() => navigateSellerSubRoute('/seller/dashboard', 'orders')}
              className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                dashboardTab === 'orders'
                  ? 'bg-emerald-950 text-white border-emerald-950 shadow-md'
                  : 'bg-white hover:border-emerald-500 border-slate-200/90 text-slate-900'
              }`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`text-xs font-bold ${
                    dashboardTab === 'orders' ? 'text-emerald-300' : 'text-slate-500'
                  }`}
                >
                  Orders
                </span>
                <Package className="w-4 h-4 text-emerald-600" />
              </div>
              <p className="font-display text-2xl font-extrabold mt-1 tabular-nums">
                {myOrders.length}
              </p>
              <span
                className={`text-[11px] font-semibold ${
                  dashboardTab === 'orders' ? 'text-emerald-200' : 'text-slate-500'
                }`}
              >
                21-min slot dispatches
              </span>
            </button>

            <button
              type="button"
              onClick={() => navigateSellerSubRoute('/seller/dashboard', 'payments')}
              className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                dashboardTab === 'payments'
                  ? 'bg-emerald-950 text-white border-emerald-950 shadow-md'
                  : 'bg-white hover:border-emerald-500 border-slate-200/90 text-slate-900'
              }`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`text-xs font-bold ${
                    dashboardTab === 'payments' ? 'text-emerald-300' : 'text-slate-500'
                  }`}
                >
                  Earnings
                </span>
                <IndianRupee className="w-4 h-4 text-emerald-600" />
              </div>
              <p className="font-display text-2xl font-extrabold mt-1 tabular-nums">
                ₹{totalRevenue.toLocaleString('en-IN')}
              </p>
              <span
                className={`text-[11px] font-semibold ${
                  dashboardTab === 'payments' ? 'text-emerald-200' : 'text-slate-500'
                }`}
              >
                A/C: {bundle.bank.accountNumberMasked || 'XXXX'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => navigateSellerSubRoute('/seller/dashboard', 'settings')}
              className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                dashboardTab === 'settings'
                  ? 'bg-emerald-950 text-white border-emerald-950 shadow-md'
                  : 'bg-white hover:border-emerald-500 border-slate-200/90 text-slate-900'
              }`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`text-xs font-bold ${
                    dashboardTab === 'settings' ? 'text-emerald-300' : 'text-slate-500'
                  }`}
                >
                  Profile/KYC
                </span>
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
              </div>
              <p className="font-display text-base font-extrabold mt-1 truncate">
                {isSellerApproved ? 'KYC Approved' : 'KYC Pending'}
              </p>
              <span
                className={`text-[11px] font-semibold truncate ${
                  dashboardTab === 'settings' ? 'text-emerald-200' : 'text-emerald-700'
                }`}
              >
                FSSAI: {bundle.profile.fssaiNumber || 'Submitted'}
              </span>
            </button>
          </section>

          {productStatusBanner && (
            <div
              role="alert"
              className={`p-4 rounded-2xl text-xs font-extrabold flex items-center justify-between gap-2 ${
                productStatusBanner.type === 'success'
                  ? 'bg-emerald-50 text-emerald-900 border border-emerald-300'
                  : 'bg-red-50 text-red-700 border border-red-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{productStatusBanner.text}</span>
              </div>
              <button
                type="button"
                onClick={() => setProductStatusBanner(null)}
                className="text-xs font-bold underline"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* ==================================================================== */}
          {/* ADD PRODUCT FORM (/seller/products/new)                              */}
          {/* ==================================================================== */}
          {dashboardTab === 'add-product' && (
            <div className="bg-white rounded-3xl border border-slate-200/90 p-6 sm:p-8 max-w-4xl mx-auto shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
                <div>
                  <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-700">
                    /seller/products/new · Seller Catalog Listing
                  </span>
                  <h2 className="font-display text-2xl font-extrabold text-slate-900 mt-0.5">
                    Add New Organic Product
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Upload multiple original product photos to <code>product-images</code>. Your
                    original photo is displayed everywhere on the buyer site without replacement.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => navigateSellerSubRoute('/seller/dashboard', 'products')}
                  className="px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-extrabold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  ← Back to My Products
                </button>
              </div>

              <form onSubmit={handleCreateSellerProduct} className="mt-6 space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-1">
                    <label
                      htmlFor="add-prod-name"
                      className="block text-xs font-extrabold text-slate-700 mb-1"
                    >
                      Product Name *
                    </label>
                    <input
                      id="add-prod-name"
                      type="text"
                      required
                      value={newProdName}
                      onChange={(e) => setNewProdName(e.target.value)}
                      placeholder="e.g. Himalayan Raw Multiflora Honey"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="add-prod-cat"
                      className="block text-xs font-extrabold text-slate-700 mb-1"
                    >
                      Category *
                    </label>
                    <select
                      id="add-prod-cat"
                      value={newProdSellerCategory}
                      onChange={(e) => setNewProdSellerCategory(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold bg-white"
                    >
                      {SELLER_CATEGORIES_LIST.map((catName) => (
                        <option key={catName} value={catName}>
                          {catName}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="add-prod-brand"
                      className="block text-xs font-extrabold text-slate-700 mb-1"
                    >
                      Brand *
                    </label>
                    <input
                      id="add-prod-brand"
                      type="text"
                      required
                      value={newProdBrand}
                      onChange={(e) => setNewProdBrand(e.target.value)}
                      placeholder={bundle.profile.brandName || 'Your Organic Brand'}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                  <div>
                    <label
                      htmlFor="add-prod-mrp"
                      className="block text-xs font-extrabold text-slate-700 mb-1"
                    >
                      MRP (₹) *
                    </label>
                    <input
                      id="add-prod-mrp"
                      type="number"
                      min={1}
                      required
                      value={newProdMrp}
                      onChange={(e) => setNewProdMrp(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="add-prod-price"
                      className="block text-xs font-extrabold text-slate-700 mb-1"
                    >
                      Selling Price (₹) *
                    </label>
                    <input
                      id="add-prod-price"
                      type="number"
                      min={1}
                      required
                      value={newProdPrice}
                      onChange={(e) => setNewProdPrice(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="add-prod-unit-qty"
                      className="block text-xs font-extrabold text-slate-700 mb-1"
                    >
                      Pack Size / Qty *
                    </label>
                    <input
                      id="add-prod-unit-qty"
                      type="text"
                      required
                      value={newProdUnitQty}
                      onChange={(e) => setNewProdUnitQty(e.target.value)}
                      placeholder="500"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="add-prod-unit-type"
                      className="block text-xs font-extrabold text-slate-700 mb-1"
                    >
                      Unit (g/kg/ml/l/pcs) *
                    </label>
                    <select
                      id="add-prod-unit-type"
                      value={newProdUnitType}
                      onChange={(e) => setNewProdUnitType(e.target.value as any)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold bg-white"
                    >
                      <option value="g">g (Grams)</option>
                      <option value="kg">kg (Kilograms)</option>
                      <option value="ml">ml (Millilitres)</option>
                      <option value="l">l (Litres)</option>
                      <option value="pcs">pcs (Pieces)</option>
                    </select>
                  </div>

                  <div className="col-span-2 sm:col-span-1">
                    <label
                      htmlFor="add-prod-stock"
                      className="block text-xs font-extrabold text-slate-700 mb-1"
                    >
                      Stock Quantity *
                    </label>
                    <input
                      id="add-prod-stock"
                      type="number"
                      min={0}
                      required
                      value={newProdStock}
                      onChange={(e) => setNewProdStock(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="add-prod-desc"
                    className="block text-xs font-extrabold text-slate-700 mb-1"
                  >
                    Description *
                  </label>
                  <textarea
                    id="add-prod-desc"
                    rows={3}
                    required
                    value={newProdDescription}
                    onChange={(e) => setNewProdDescription(e.target.value)}
                    placeholder="Describe farm origin, harvest method, and organic purity..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm"
                  />
                </div>

                {/* Multiple Original Product Photos Upload (Supabase Storage "product-images" bucket) */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-xs font-extrabold text-slate-800 block">
                        Multiple Original Product Photos (Supabase Storage: product-images) *
                      </span>
                      <span className="text-[11px] text-slate-500">
                        Upload 1 to 5 original product photos. Your exact uploaded photo will appear
                        everywhere on the buyer site without replacement.
                      </span>
                    </div>
                    <label className="cursor-pointer inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-extrabold">
                      <Upload className="w-3.5 h-3.5" />
                      <span>Upload Product Photos</span>
                      <input
                        id="add-prod-photos-input"
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={async (e) => {
                          const files = Array.from(e.target.files || []);
                          const uploaded: string[] = [];
                          for (const f of files.slice(0, 5)) {
                            const url = await readFileAsDataUrlAndUpload(
                              f,
                              'product-images',
                              session.uid
                            );
                            uploaded.push(url);
                          }
                          setNewProdPhotos((prev) => [...prev, ...uploaded].slice(0, 5));
                        }}
                        className="hidden"
                      />
                    </label>
                  </div>

                  {newProdPhotos.length > 0 && (
                    <div className="flex flex-wrap gap-3 pt-2">
                      {newProdPhotos.map((photo, idx) => (
                        <div
                          key={idx}
                          className="relative w-20 h-20 rounded-xl overflow-hidden border border-slate-300 bg-white"
                        >
                          <img
                            src={photo}
                            alt={`Uploaded product ${idx + 1}`}
                            className="w-full h-full object-cover"
                          />
                          <button
                            type="button"
                            aria-label={`Remove photo ${idx + 1}`}
                            onClick={() =>
                              setNewProdPhotos((prev) => prev.filter((_, i) => i !== idx))
                            }
                            className="absolute top-1 right-1 w-5 h-5 rounded-full bg-slate-900/80 text-white flex items-center justify-center text-[10px]"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Optional FSSAI / Organic Certificate Upload */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <span className="text-xs font-extrabold text-slate-800 block">
                      FSSAI / Organic Certificate (Optional)
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {newProdCertificateUrl
                        ? '✓ Lab / Organic Certificate attached to this product'
                        : 'Optional: Upload NPOP / PGS-India / FSSAI batch certificate'}
                    </span>
                  </div>
                  <label className="cursor-pointer inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 text-xs font-extrabold">
                    <Upload className="w-3.5 h-3.5 text-emerald-700" />
                    <span>
                      {newProdCertificateUrl ? 'Change Certificate' : 'Upload Certificate (Optional)'}
                    </span>
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const url = await readFileAsDataUrlAndUpload(
                          file,
                          'seller-documents',
                          session.uid
                        );
                        setNewProdCertificateUrl(url);
                      }}
                      className="hidden"
                    />
                  </label>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
                  <span className="text-xs text-slate-500">
                    Saves to <code>products</code> table with <code>seller_id</code> and{' '}
                    <code>status = &quot;pending_approval&quot;</code>.
                  </span>
                  <button
                    type="submit"
                    disabled={creatingProduct}
                    className="px-7 py-3.5 rounded-2xl bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-300 text-white text-xs sm:text-sm font-extrabold shadow-md cursor-pointer"
                  >
                    {creatingProduct ? 'Saving Product...' : 'Save Product'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ==================================================================== */}
          {/* MY PRODUCTS LIST (Shown on Dashboard Home & My Products Tab)         */}
          {/* Has large green "+ Add Product" button above list + Edit/Delete/Stock*/}
          {/* ==================================================================== */}
          {(dashboardTab === 'dashboard' || dashboardTab === 'products') && (
            <div className="bg-white rounded-3xl border border-slate-200/90 p-6 space-y-5 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="font-display text-xl font-extrabold text-slate-900">
                    My Products ({myProducts.length})
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Manage your listed organic products. Edit details, update live stock, or delete
                    items. Products with <code>pending_approval</code> stay hidden from buyers until
                    Admin approval.
                  </p>
                </div>

                {/* Large Green "+ Add Product" Button right above My Products list */}
                <button
                  type="button"
                  onClick={() => navigateSellerSubRoute('/seller/products/new')}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-extrabold shadow-md transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                  <span>+ Add Product</span>
                </button>
              </div>

              {myProducts.length === 0 ? (
                <div className="p-10 rounded-2xl border-2 border-dashed border-slate-200 text-center space-y-3">
                  <p className="text-sm font-bold text-slate-700">
                    You haven&apos;t added any products yet.
                  </p>
                  <p className="text-xs text-slate-500">
                    Click the green <strong>+ Add Product</strong> button above to upload your first
                    organic product.
                  </p>
                  <button
                    type="button"
                    onClick={() => navigateSellerSubRoute('/seller/products/new')}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-700 text-white text-xs font-extrabold cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>+ Add Product</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {myProducts.map((prod: any) => {
                    const isProdApproved = !prod.status || prod.status === 'approved';
                    const currentStockVal =
                      stockDrafts[prod.id] !== undefined
                        ? stockDrafts[prod.id]
                        : String(prod.stock ?? 0);

                    return (
                      <div
                        key={prod.id}
                        className="rounded-2xl border border-slate-200 p-4 flex flex-col justify-between gap-4 bg-white hover:border-emerald-300 transition-colors"
                      >
                        <div className="flex gap-3.5">
                          <img
                            src={prod.imageUrl}
                            alt={prod.name}
                            className="w-20 h-20 rounded-xl object-cover border border-slate-200 bg-slate-50 shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1.5">
                              <span className="text-[10px] font-extrabold uppercase text-emerald-700 truncate">
                                {prod.sellerCategory || prod.brand}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold shrink-0 ${
                                  isProdApproved
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-amber-100 text-amber-900'
                                }`}
                              >
                                {isProdApproved ? 'Approved' : 'Pending Approval'}
                              </span>
                            </div>
                            <h3 className="text-sm font-extrabold text-slate-900 line-clamp-2 mt-0.5">
                              {prod.name}
                            </h3>
                            <p className="text-xs text-slate-500 font-semibold mt-0.5">
                              {prod.unitLabel} · Brand: {prod.brand}
                            </p>
                            <div className="flex items-baseline gap-2 mt-1">
                              <span className="text-sm font-extrabold text-emerald-800">
                                ₹{prod.price}
                              </span>
                              <span className="text-xs text-slate-400 line-through">
                                ₹{prod.mrp}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Stock Update + Edit + Delete Controls */}
                        <div className="pt-3 border-t border-slate-100 space-y-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <label
                              htmlFor={`stock-input-${prod.id}`}
                              className="text-[11px] font-bold text-slate-600"
                            >
                              Stock Qty:
                            </label>
                            <div className="flex items-center gap-1.5">
                              <input
                                id={`stock-input-${prod.id}`}
                                type="number"
                                min={0}
                                value={currentStockVal}
                                onChange={(e) =>
                                  setStockDrafts((prev) => ({
                                    ...prev,
                                    [prod.id]: e.target.value,
                                  }))
                                }
                                className="w-20 px-2.5 py-1 rounded-lg border border-slate-300 text-xs font-bold text-slate-900"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  handleQuickStockUpdate(prod, Number(currentStockVal || 0))
                                }
                                className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-[11px] font-extrabold cursor-pointer"
                              >
                                Stock Update
                              </button>
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => openEditProductModal(prod)}
                              className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-extrabold cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteSellerProduct(prod)}
                              className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 text-xs font-extrabold cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {dashboardTab === 'orders' && (
            <div className="bg-white rounded-3xl border border-slate-200/90 p-6 space-y-4">
              <h2 className="font-display text-xl font-extrabold text-slate-900">
                Seller Orders ({myOrders.length})
              </h2>
              <p className="text-xs text-slate-500">
                Showing only orders containing items from {sellerDisplayName}.
              </p>
              {myOrders.length === 0 ? (
                <p className="text-sm text-slate-500 py-8 text-center">
                  No orders placed for your products yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {myOrders.map((ord: any) => (
                    <div
                      key={ord.id}
                      className="p-4 rounded-2xl border border-slate-200 flex flex-wrap items-center justify-between gap-4"
                    >
                      <div>
                        <span className="text-xs font-mono font-extrabold text-emerald-800">
                          {ord.orderNumber}
                        </span>
                        <p className="text-sm font-bold text-slate-900 mt-0.5">
                          {ord.sellerItems
                            .map((i: any) => `${i.productName} × ${i.quantity}`)
                            .join(', ')}
                        </p>
                        <span className="text-xs text-slate-500">
                          Status: <strong className="uppercase">{ord.status}</strong>
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-base font-extrabold text-slate-900">
                          ₹{ord.sellerSubtotal}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {dashboardTab === 'payments' && (
            <div className="bg-white rounded-3xl border border-slate-200/90 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-display text-xl font-extrabold text-slate-900">
                    Seller Earnings & Bank Settlements
                  </h2>
                  <p className="text-xs text-slate-500">
                    Settled to verified bank account {bundle.bank.accountNumberMasked} (
                    {bundle.bank.bankName} · {bundle.bank.ifscCode})
                  </p>
                </div>
              </div>
              {myPayments.length === 0 ? (
                <p className="text-sm text-slate-500 py-8 text-center">
                  No payout settlements recorded yet.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {myPayments.map((pay: any) => (
                    <div
                      key={pay.id}
                      className="p-4 rounded-2xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <span className="font-mono font-extrabold text-slate-900">{pay.id}</span>
                        <p className="text-slate-500 mt-0.5">
                          Gross: ₹{pay.grossAmount} · Platform Fee (8%): ₹{pay.commissionFee}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-extrabold text-emerald-800">
                          Net Payout: ₹{pay.netPayout}
                        </p>
                        <span className="text-[11px] font-bold text-slate-600">
                          {pay.payoutStatus} ({pay.bankMasked})
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {dashboardTab === 'settings' && (
            <div className="bg-white rounded-3xl border border-slate-200/90 p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-xl font-extrabold text-slate-900">
                    Profile / KYC & Onboarding Summary
                  </h2>
                  <p className="text-xs text-slate-500">
                    Status: <strong className="uppercase">{applicationStatus}</strong> · Your PAN &
                    Bank Account details are masked for security.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setForceEditOnboarding(true);
                    setActiveStep(1);
                    window.history.pushState({}, '', '/seller');
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-extrabold cursor-pointer"
                >
                  View / Edit 6-Step Onboarding Wizard
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
                  <span className="font-bold text-slate-500">Legal Entity & KYC</span>
                  <p className="font-extrabold text-slate-900">
                    {bundle.profile.legalBusinessName || sellerDisplayName} (
                    {bundle.profile.businessType})
                  </p>
                  <p className="font-mono text-slate-700">
                    PAN:{' '}
                    {bundle.profile.panNumber
                      ? `${bundle.profile.panNumber.slice(0, 2)}XXXXX${bundle.profile.panNumber.slice(-3)}`
                      : 'Pending'}{' '}
                    · FSSAI: {bundle.profile.fssaiNumber || 'Pending'}
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
                  <span className="font-bold text-slate-500">Verified Bank Settlement Account</span>
                  <p className="font-extrabold text-slate-900">
                    {bundle.bank.accountHolderName || sellerDisplayName}
                  </p>
                  <p className="font-mono text-slate-700">
                    A/C: {bundle.bank.accountNumberMasked || 'XXXX'} · IFSC:{' '}
                    {bundle.bank.ifscCode || 'N/A'} ({bundle.bank.bankName || 'Bank'})
                  </p>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* EDIT PRODUCT MODAL */}
        {editingProduct && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Edit Product"
            className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 overflow-y-auto"
          >
            <div className="bg-white rounded-3xl max-w-xl w-full p-6 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg font-extrabold text-slate-900">
                  Edit Product: {editingProduct.name}
                </h3>
                <button
                  type="button"
                  onClick={() => setEditingProduct(null)}
                  className="text-xs font-bold text-slate-500 hover:text-slate-800"
                >
                  Close ✕
                </button>
              </div>
              <form onSubmit={handleSaveEditedProduct} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-extrabold text-slate-700 mb-1">
                      Product Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={editProdName}
                      onChange={(e) => setEditProdName(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-extrabold text-slate-700 mb-1">
                      Category *
                    </label>
                    <select
                      value={editProdCategory}
                      onChange={(e) => setEditProdCategory(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold bg-white"
                    >
                      {SELLER_CATEGORIES_LIST.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-extrabold text-slate-700 mb-1">
                      MRP (₹) *
                    </label>
                    <input
                      type="number"
                      required
                      value={editProdMrp}
                      onChange={(e) => setEditProdMrp(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-extrabold text-slate-700 mb-1">
                      Selling Price (₹) *
                    </label>
                    <input
                      type="number"
                      required
                      value={editProdPrice}
                      onChange={(e) => setEditProdPrice(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-extrabold text-slate-700 mb-1">
                      Unit Label *
                    </label>
                    <input
                      type="text"
                      required
                      value={editProdUnitLabel}
                      onChange={(e) => setEditProdUnitLabel(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-extrabold text-slate-700 mb-1">
                      Stock Qty *
                    </label>
                    <input
                      type="number"
                      required
                      value={editProdStock}
                      onChange={(e) => setEditProdStock(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-slate-700 mb-1">
                    Description
                  </label>
                  <textarea
                    rows={2}
                    value={editProdDescription}
                    onChange={(e) => setEditProdDescription(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditingProduct(null)}
                    className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingProductEdit}
                    className="px-5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-extrabold"
                  >
                    {savingProductEdit ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ============================================================================
  // VIEW 4: 7-STEP BLINKIT SELLER HUB ONBOARDING WIZARD (6 Steps + Verify & Submit)
  // ============================================================================
  return (
    <div className="min-h-screen bg-[#FAF7F2] flex flex-col lg:flex-row">
      {/* Left Dark Emerald Sidebar (Brand, Tagline, Login Details + Edit, Step Tracker, Log Out) */}
      <aside className="lg:w-[340px] bg-emerald-950 text-white p-6 lg:p-7 flex flex-col justify-between shrink-0">
        <div>
          <button
            type="button"
            onClick={handleLogoClick}
            className="flex items-center gap-3 pb-5 border-b border-emerald-800/80 w-full text-left group focus:outline-none cursor-pointer"
            aria-label="Bharat Organic Seller Dashboard"
          >
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center group-hover:bg-emerald-500/30 transition-colors">
              <Leaf className="w-5 h-5 text-emerald-300" />
            </div>
            <div>
              <span className="font-display text-lg font-extrabold tracking-tight block">
                BHARAT ORGANIC
              </span>
              <span className="text-[11px] text-emerald-300 font-semibold block">
                21-Min Organic Seller Hub
              </span>
            </div>
          </button>

          {/* Seller Login Details with Edit Option */}
          <div className="mt-4 p-3.5 rounded-2xl bg-emerald-900/60 border border-emerald-800/90 text-xs space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-300">
                Seller Login Details
              </span>
              <button
                type="button"
                onClick={() => {
                  setEditPhoneInput(bundle.profile.phone);
                  setEditEmailInput(bundle.profile.email);
                  setEditingContacts(true);
                }}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-300 hover:text-white"
              >
                <Edit3 className="w-3 h-3" />
                Edit
              </button>
            </div>
            <div className="flex items-center gap-1.5 text-emerald-100">
              <Phone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>+91 {bundle.profile.phone}</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 ml-auto" />
            </div>
            <div className="flex items-center gap-1.5 text-emerald-100">
              <Mail className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="truncate">{bundle.profile.email}</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 ml-auto shrink-0" />
            </div>
          </div>

          {/* 7-Step Tracker with Green Ticks on Completed Steps */}
          <div className="mt-6 space-y-1.5" role="list" aria-label="Onboarding steps">
            {WIZARD_STEPS.map((item) => {
              const isCompleted = stepValidationMap[item.step]?.valid;
              const isCurrent = activeStep === item.step;
              return (
                <button
                  key={item.step}
                  type="button"
                  onClick={() => setActiveStep(item.step)}
                  className={`w-full flex items-center gap-3 p-3 rounded-2xl text-left transition-all ${
                    isCurrent
                      ? 'bg-emerald-800/90 border border-emerald-400/50 shadow-sm'
                      : 'hover:bg-emerald-900/50'
                  }`}
                >
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold shrink-0 ${
                      isCompleted
                        ? 'bg-emerald-400 text-slate-950'
                        : isCurrent
                        ? 'bg-white text-emerald-950'
                        : 'bg-emerald-900 text-emerald-300 border border-emerald-700'
                    }`}
                  >
                    {isCompleted ? <Check className="w-4 h-4 stroke-[3]" /> : item.step}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-extrabold text-white truncate">
                      {item.step}. {item.title}
                    </p>
                    <p className="text-[11px] text-emerald-300/80 truncate">{item.subtitle}</p>
                  </div>
                  {isCompleted && (
                    <span
                      aria-label={`Step ${item.step} completed`}
                      className="text-[10px] font-extrabold text-emerald-300 bg-emerald-900/80 px-2 py-0.5 rounded-full"
                    >
                      ✓
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-6 pt-5 border-t border-emerald-800/70 space-y-2">
          {(applicationStatus === 'approved' ||
            applicationStatus === 'pending' ||
            applicationStatus === 'under_review' ||
            applicationStatus === 'submitted') && (
            <button
              type="button"
              onClick={() => navigateSellerSubRoute('/seller/dashboard', 'dashboard')}
              className="w-full py-2.5 rounded-xl bg-emerald-500 text-slate-950 text-xs font-extrabold cursor-pointer"
            >
              Go to Seller Dashboard (/seller/dashboard)
            </button>
          )}
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-200 text-xs font-extrabold border border-red-400/30 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Log out</span>
          </button>
        </div>
      </aside>

      {/* Right-Side Form Card + Sticky "Save & Continue" Footer */}
      <main className="flex-1 flex flex-col justify-between p-5 sm:p-9 max-w-4xl mx-auto w-full">
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs p-6 sm:p-8 space-y-6">
          {/* Step Header + Autosave Badge */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-100">
            <div>
              <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-700">
                Step {activeStep} of 7 · {WIZARD_STEPS[activeStep - 1].title}
              </span>
              <h1 className="font-display text-2xl font-extrabold text-slate-900 mt-0.5">
                {WIZARD_STEPS[activeStep - 1].subtitle}
              </h1>
            </div>
            {autosaveStatus && (
              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full">
                {autosaveStatus}
              </span>
            )}
          </div>

          {wizardBannerError && (
            <div
              role="alert"
              className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-xs font-bold text-red-700 flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{wizardBannerError}</span>
            </div>
          )}

          {/* STEP 1: BUSINESS DETAILS */}
          {activeStep === 1 && (
            <div className="space-y-6">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
                    Categories Sold (Multi-select, up to 10) *
                  </label>
                  <span className="text-xs font-bold text-emerald-700">
                    {categoriesSold.length} / 10 selected
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {SELLER_CATEGORIES_LIST.map((cat) => {
                    const selected = categoriesSold.includes(cat);
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => {
                          if (selected) {
                            setCategoriesSold((prev) => prev.filter((c) => c !== cat));
                          } else if (categoriesSold.length < 10) {
                            setCategoriesSold((prev) => [...prev, cat]);
                          }
                        }}
                        className={`p-3 rounded-xl border text-left text-xs font-extrabold flex items-center justify-between transition-all ${
                          selected
                            ? 'bg-emerald-50 border-emerald-700 text-emerald-950 ring-1 ring-emerald-700'
                            : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                        }`}
                      >
                        <span>{cat}</span>
                        {selected && <Check className="w-4 h-4 text-emerald-700 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
                {currentStepValidation.errors.categoriesSold && (
                  <p className="text-xs font-bold text-red-600 mt-1.5">
                    {currentStepValidation.errors.categoriesSold}
                  </p>
                )}
              </div>

              {/* Retail Channels (Optional, Repeatable) */}
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
                    Retail Channels (Optional)
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setRetailChannels((prev) => [
                        ...prev,
                        { channel: '', monthlySales: '₹1L – ₹5L / month', referenceLink: '' },
                      ])
                    }
                    className="text-xs font-extrabold text-emerald-700 hover:underline"
                  >
                    + Add more
                  </button>
                </div>
                {retailChannels.map((row, idx) => (
                  <div key={idx} className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-center">
                    <input
                      type="text"
                      value={row.channel}
                      onChange={(e) =>
                        setRetailChannels((prev) =>
                          prev.map((r, i) => (i === idx ? { ...r, channel: e.target.value } : r))
                        )
                      }
                      placeholder="Channel (e.g. Modern Trade / Haat)"
                      className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold"
                    />
                    <select
                      value={row.monthlySales}
                      onChange={(e) =>
                        setRetailChannels((prev) =>
                          prev.map((r, i) =>
                            i === idx ? { ...r, monthlySales: e.target.value } : r
                          )
                        )
                      }
                      className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold bg-white"
                    >
                      <option value="Below ₹1L / month">Below ₹1L / month</option>
                      <option value="₹1L – ₹5L / month">₹1L – ₹5L / month</option>
                      <option value="₹5L – ₹15L / month">₹5L – ₹15L / month</option>
                      <option value="Above ₹15L / month">Above ₹15L / month</option>
                    </select>
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={row.referenceLink}
                        onChange={(e) =>
                          setRetailChannels((prev) =>
                            prev.map((r, i) =>
                              i === idx ? { ...r, referenceLink: e.target.value } : r
                            )
                          )
                        }
                        placeholder="Reference link (optional)"
                        className="flex-1 px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold"
                      />
                      {retailChannels.length > 1 && (
                        <button
                          type="button"
                          aria-label="Remove retail channel"
                          onClick={() =>
                            setRetailChannels((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="p-2 text-slate-400 hover:text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Social Channels (Optional, Repeatable) */}
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
                    Social Channels (Optional)
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setSocialChannels((prev) => [
                        ...prev,
                        { platform: 'Instagram', followers: '1K – 10K', link: '' },
                      ])
                    }
                    className="text-xs font-extrabold text-emerald-700 hover:underline"
                  >
                    + Add more
                  </button>
                </div>
                {socialChannels.map((soc, idx) => (
                  <div key={idx} className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-center">
                    <select
                      value={soc.platform}
                      onChange={(e) =>
                        setSocialChannels((prev) =>
                          prev.map((s, i) => (i === idx ? { ...s, platform: e.target.value } : s))
                        )
                      }
                      className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold bg-white"
                    >
                      <option value="Instagram">Instagram</option>
                      <option value="YouTube">YouTube</option>
                      <option value="Facebook">Facebook</option>
                      <option value="LinkedIn">LinkedIn</option>
                    </select>
                    <select
                      value={soc.followers}
                      onChange={(e) =>
                        setSocialChannels((prev) =>
                          prev.map((s, i) => (i === idx ? { ...s, followers: e.target.value } : s))
                        )
                      }
                      className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold bg-white"
                    >
                      <option value="1K – 10K">1K – 10K followers</option>
                      <option value="10K – 50K">10K – 50K followers</option>
                      <option value="50K+">50K+ followers</option>
                    </select>
                    <input
                      type="url"
                      value={soc.link}
                      onChange={(e) =>
                        setSocialChannels((prev) =>
                          prev.map((s, i) => (i === idx ? { ...s, link: e.target.value } : s))
                        )
                      }
                      placeholder="Profile URL"
                      className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold"
                    />
                  </div>
                ))}
              </div>

              {/* Contact Person (SPOC) */}
              <div className="pt-3 border-t border-slate-100 space-y-4">
                <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wider block">
                  Single Point of Contact (SPOC) *
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="spoc-name"
                      className="block text-xs font-bold text-slate-700 mb-1"
                    >
                      Contact Person Full Name *
                    </label>
                    <input
                      id="spoc-name"
                      type="text"
                      value={spocName}
                      onChange={(e) => setSpocName(e.target.value)}
                      placeholder="e.g. Rajendra Prasad Verma"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold"
                    />
                    {currentStepValidation.errors.spocName && (
                      <p className="text-xs font-bold text-red-600 mt-1">
                        {currentStepValidation.errors.spocName}
                      </p>
                    )}
                  </div>
                  <div>
                    <label
                      htmlFor="spoc-designation"
                      className="block text-xs font-bold text-slate-700 mb-1"
                    >
                      Designation *
                    </label>
                    <select
                      id="spoc-designation"
                      value={spocDesignation}
                      onChange={(e) => setSpocDesignation(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold bg-white"
                    >
                      {SPOC_DESIGNATIONS_LIST.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">
                      Verified Login Email (Auto-filled, Read-only)
                    </label>
                    <input
                      type="email"
                      readOnly
                      value={bundle.profile.email}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-sm font-semibold text-slate-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">
                      Verified Mobile Number (Auto-filled, Read-only)
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={`+91 ${bundle.profile.phone}`}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-sm font-semibold text-slate-600"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: BRAND DETAILS */}
          {activeStep === 2 && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="wizard-brand-name"
                    className="block text-xs font-extrabold text-slate-700 mb-1"
                  >
                    Brand Name *
                  </label>
                  <input
                    id="wizard-brand-name"
                    type="text"
                    value={brandName}
                    onChange={(e) => setBrandName(e.target.value)}
                    placeholder="e.g. Himalayan Organic Harvest"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold"
                  />
                  {currentStepValidation.errors.brandName && (
                    <p className="text-xs font-bold text-red-600 mt-1">
                      {currentStepValidation.errors.brandName}
                    </p>
                  )}
                </div>
                <div>
                  <label
                    htmlFor="wizard-brand-website"
                    className="block text-xs font-extrabold text-slate-700 mb-1"
                  >
                    Brand Website URL (Optional)
                  </label>
                  <input
                    id="wizard-brand-website"
                    type="url"
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    placeholder="https://yourbrand.in"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold"
                  />
                </div>
              </div>

              {/* Brand Logo Upload */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  {brandLogoUrl ? (
                    <img
                      src={brandLogoUrl}
                      alt="Brand Logo Preview"
                      className="w-16 h-16 rounded-2xl object-cover border border-emerald-400 bg-white"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-2xl bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-500">
                      Logo
                    </div>
                  )}
                  <div>
                    <span className="text-xs font-extrabold text-slate-900 block">
                      Brand Logo Upload (Bucket: seller-logos) *
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Square PNG/JPG/SVG logo for your storefront header
                    </span>
                    {currentStepValidation.errors.brandLogoUrl && (
                      <p className="text-xs font-bold text-red-600 mt-0.5">
                        {currentStepValidation.errors.brandLogoUrl}
                      </p>
                    )}
                  </div>
                </div>
                <label className="cursor-pointer inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-extrabold">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload Logo</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const url = await readFileAsDataUrlAndUpload(
                        file,
                        'seller-logos',
                        session.uid
                      );
                      setBrandLogoUrl(url);
                    }}
                    className="hidden"
                  />
                </label>
              </div>

              <div>
                <label
                  htmlFor="wizard-short-desc"
                  className="block text-xs font-extrabold text-slate-700 mb-1"
                >
                  Short Tagline / Description *
                </label>
                <input
                  id="wizard-short-desc"
                  type="text"
                  value={shortDescription}
                  onChange={(e) => setShortDescription(e.target.value)}
                  placeholder="100% certified single-origin organic staples & cold-pressed oils"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold"
                />
                {currentStepValidation.errors.shortDescription && (
                  <p className="text-xs font-bold text-red-600 mt-1">
                    {currentStepValidation.errors.shortDescription}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="wizard-brand-story"
                  className="block text-xs font-extrabold text-slate-700 mb-1"
                >
                  Brand Story & Sourcing Philosophy *
                </label>
                <textarea
                  id="wizard-brand-story"
                  rows={3}
                  value={brandStory}
                  onChange={(e) => setBrandStory(e.target.value)}
                  placeholder="Tell customers about your farmer network, soil practices, and purity standards..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm"
                />
                {currentStepValidation.errors.brandStory && (
                  <p className="text-xs font-bold text-red-600 mt-1">
                    {currentStepValidation.errors.brandStory}
                  </p>
                )}
              </div>

              {/* Up to 5 Product Sample Photos */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-extrabold text-slate-800 block">
                      Brand Product Sample Photos (Up to 5)
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Show packaging & label clarity ({brandPhotos.length}/5 uploaded)
                    </span>
                  </div>
                  <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 text-xs font-extrabold text-slate-800">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Add Photos</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={async (e) => {
                        const files = Array.from(e.target.files || []);
                        const urls: string[] = [];
                        for (const f of files.slice(0, 5)) {
                          const u = await readFileAsDataUrlAndUpload(
                            f,
                            'product-images',
                            session.uid
                          );
                          urls.push(u);
                        }
                        setBrandPhotos((prev) => [...prev, ...urls].slice(0, 5));
                      }}
                      className="hidden"
                    />
                  </label>
                </div>
                {brandPhotos.length > 0 && (
                  <div className="flex flex-wrap gap-2.5">
                    {brandPhotos.map((u, i) => (
                      <img
                        key={i}
                        src={u}
                        alt={`Brand sample ${i + 1}`}
                        className="w-16 h-16 rounded-xl object-cover border border-slate-300 bg-white"
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 3: SELLER DETAILS & KYC */}
          {activeStep === 3 && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="kyc-bus-type"
                    className="block text-xs font-extrabold text-slate-700 mb-1"
                  >
                    Business Type *
                  </label>
                  <select
                    id="kyc-bus-type"
                    value={businessType}
                    onChange={(e) => setBusinessType(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold bg-white"
                  >
                    {BUSINESS_TYPES_LIST.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="kyc-legal-name"
                    className="block text-xs font-extrabold text-slate-700 mb-1"
                  >
                    Legal Business Name *
                  </label>
                  <input
                    id="kyc-legal-name"
                    type="text"
                    value={legalBusinessName}
                    onChange={(e) => setLegalBusinessName(e.target.value)}
                    placeholder="As per PAN / Registration Certificate"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold"
                  />
                  {currentStepValidation.errors.legalBusinessName && (
                    <p className="text-xs font-bold text-red-600 mt-1">
                      {currentStepValidation.errors.legalBusinessName}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="kyc-pan"
                    className="block text-xs font-extrabold text-slate-700 mb-1"
                  >
                    PAN Number (Format: AAAAA9999A) *
                  </label>
                  <input
                    id="kyc-pan"
                    type="text"
                    maxLength={10}
                    value={panNumber}
                    onChange={(e) => setPanNumber(e.target.value.toUpperCase())}
                    placeholder="ABCDE1234F"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-mono font-bold uppercase"
                  />
                  {currentStepValidation.errors.panNumber ? (
                    <p className="text-xs font-bold text-red-600 mt-1">
                      {currentStepValidation.errors.panNumber}
                    </p>
                  ) : (
                    panNumber &&
                    validatePan(panNumber) && (
                      <p className="text-xs font-bold text-emerald-700 mt-1">✓ Valid PAN format</p>
                    )
                  )}
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label
                      htmlFor="kyc-gstin"
                      className="text-xs font-extrabold text-slate-700"
                    >
                      GSTIN (15 characters)
                    </label>
                    <label className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={gstBelowThreshold}
                        onChange={(e) => setGstBelowThreshold(e.target.checked)}
                      />
                      <span>Exempt / Below threshold</span>
                    </label>
                  </div>
                  <input
                    id="kyc-gstin"
                    type="text"
                    maxLength={15}
                    disabled={gstBelowThreshold}
                    value={gstinNumber}
                    onChange={(e) => setGstinNumber(e.target.value.toUpperCase())}
                    placeholder={gstBelowThreshold ? 'Exempt (Below GST threshold)' : '06ABCDE1234F1Z5'}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 disabled:bg-slate-100 text-sm font-mono font-bold uppercase"
                  />
                  {currentStepValidation.errors.gstinNumber && (
                    <p className="text-xs font-bold text-red-600 mt-1">
                      {currentStepValidation.errors.gstinNumber}
                    </p>
                  )}
                </div>
              </div>

              {/* FSSAI License Details */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="kyc-fssai"
                      className="block text-xs font-extrabold text-slate-700 mb-1"
                    >
                      FSSAI License Number (14 digits) *
                    </label>
                    <input
                      id="kyc-fssai"
                      type="text"
                      maxLength={14}
                      value={fssaiNumber}
                      onChange={(e) => setFssaiNumber(e.target.value.replace(/\D/g, ''))}
                      placeholder="10823005001492"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-sm font-mono font-bold"
                    />
                    {currentStepValidation.errors.fssaiNumber && (
                      <p className="text-xs font-bold text-red-600 mt-1">
                        {currentStepValidation.errors.fssaiNumber}
                      </p>
                    )}
                  </div>
                  <div>
                    <label
                      htmlFor="kyc-fssai-exp"
                      className="block text-xs font-extrabold text-slate-700 mb-1"
                    >
                      FSSAI Expiry Date *
                    </label>
                    <input
                      id="kyc-fssai-exp"
                      type="date"
                      value={fssaiExpiryDate}
                      onChange={(e) => setFssaiExpiryDate(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-sm font-semibold"
                    />
                    {currentStepValidation.errors.fssaiExpiryDate && (
                      <p className="text-xs font-bold text-red-600 mt-1">
                        {currentStepValidation.errors.fssaiExpiryDate}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div>
                    <span className="text-xs font-extrabold text-slate-800 block">
                      FSSAI Certificate Upload (Private Bucket: seller-documents) *
                    </span>
                    {fssaiCertificateUrl ? (
                      <span className="text-xs font-bold text-emerald-700">
                        ✓ FSSAI Certificate attached
                      </span>
                    ) : (
                      <span className="text-xs font-bold text-red-600">
                        {currentStepValidation.errors.fssaiCertificateUrl}
                      </span>
                    )}
                  </div>
                  <label className="cursor-pointer inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-extrabold">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload FSSAI Certificate</span>
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const url = await readFileAsDataUrlAndUpload(
                          file,
                          'seller-documents',
                          session.uid
                        );
                        setFssaiCertificateUrl(url);
                      }}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {/* Registered Address */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label
                    htmlFor="kyc-state"
                    className="block text-xs font-extrabold text-slate-700 mb-1"
                  >
                    Registered State *
                  </label>
                  <select
                    id="kyc-state"
                    value={registeredState}
                    onChange={(e) => setRegisteredState(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold bg-white"
                  >
                    {INDIAN_STATES_LIST.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="kyc-district"
                    className="block text-xs font-extrabold text-slate-700 mb-1"
                  >
                    District / City *
                  </label>
                  <input
                    id="kyc-district"
                    type="text"
                    value={registeredDistrict}
                    onChange={(e) => setRegisteredDistrict(e.target.value)}
                    placeholder="e.g. Gurugram"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold"
                  />
                  {currentStepValidation.errors.registeredDistrict && (
                    <p className="text-xs font-bold text-red-600 mt-1">
                      {currentStepValidation.errors.registeredDistrict}
                    </p>
                  )}
                </div>
                <div>
                  <label
                    htmlFor="kyc-pincode"
                    className="block text-xs font-extrabold text-slate-700 mb-1"
                  >
                    Pincode (6 digits) *
                  </label>
                  <input
                    id="kyc-pincode"
                    type="text"
                    maxLength={6}
                    value={registeredPincode}
                    onChange={(e) => setRegisteredPincode(e.target.value.replace(/\D/g, ''))}
                    placeholder="122018"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-mono font-bold"
                  />
                  {currentStepValidation.errors.registeredPincode && (
                    <p className="text-xs font-bold text-red-600 mt-1">
                      {currentStepValidation.errors.registeredPincode}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: BANK DETAILS */}
          {activeStep === 4 && (
            <div className="space-y-5">
              <div>
                <label
                  htmlFor="bank-holder"
                  className="block text-xs font-extrabold text-slate-700 mb-1"
                >
                  Account Holder Name (As per Bank Records) *
                </label>
                <input
                  id="bank-holder"
                  type="text"
                  value={accountHolderName}
                  onChange={(e) => setAccountHolderName(e.target.value)}
                  placeholder="e.g. Kisan Organic Producer Company Limited"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold"
                />
                {currentStepValidation.errors.accountHolderName && (
                  <p className="text-xs font-bold text-red-600 mt-1">
                    {currentStepValidation.errors.accountHolderName}
                  </p>
                )}
              </div>

              {!editingBankAccount && accountNumberMasked ? (
                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-extrabold text-emerald-900 block">
                      Saved Bank Account Number (Masked for Security)
                    </span>
                    <span className="font-mono text-base font-extrabold text-slate-900">
                      {accountNumberMasked}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingBankAccount(true);
                      setAccountNumber('');
                      setConfirmAccountNumber('');
                    }}
                    className="px-3.5 py-2 rounded-xl bg-white border border-emerald-300 text-xs font-extrabold text-emerald-800"
                  >
                    Change Account Number
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="bank-acc"
                      className="block text-xs font-extrabold text-slate-700 mb-1"
                    >
                      Bank Account Number (9–18 digits) *
                    </label>
                    <input
                      id="bank-acc"
                      type="password"
                      maxLength={18}
                      value={accountNumber}
                      onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ''))}
                      placeholder="Enter account number"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-mono font-bold"
                    />
                    {currentStepValidation.errors.accountNumber && (
                      <p className="text-xs font-bold text-red-600 mt-1">
                        {currentStepValidation.errors.accountNumber}
                      </p>
                    )}
                  </div>
                  <div>
                    <label
                      htmlFor="bank-acc-confirm"
                      className="block text-xs font-extrabold text-slate-700 mb-1"
                    >
                      Re-enter Account Number to Confirm *
                    </label>
                    <input
                      id="bank-acc-confirm"
                      type="text"
                      maxLength={18}
                      value={confirmAccountNumber}
                      onChange={(e) => setConfirmAccountNumber(e.target.value.replace(/\D/g, ''))}
                      placeholder="Confirm account number"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-mono font-bold"
                    />
                    {currentStepValidation.errors.confirmAccountNumber && (
                      <p className="text-xs font-bold text-red-600 mt-1">
                        {currentStepValidation.errors.confirmAccountNumber}
                      </p>
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label
                    htmlFor="bank-ifsc"
                    className="block text-xs font-extrabold text-slate-700 mb-1"
                  >
                    IFSC Code (AAAA0XXXXXX) *
                  </label>
                  <input
                    id="bank-ifsc"
                    type="text"
                    maxLength={11}
                    value={ifscCode}
                    onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
                    placeholder="HDFC0000240"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-mono font-bold uppercase"
                  />
                  {currentStepValidation.errors.ifscCode && (
                    <p className="text-xs font-bold text-red-600 mt-1">
                      {currentStepValidation.errors.ifscCode}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-extrabold text-slate-700 mb-1">
                    Auto-Fetched Bank Name
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={bankName}
                    placeholder="Auto-filled from IFSC"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-sm font-bold text-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-extrabold text-slate-700 mb-1">
                    Auto-Fetched Branch Name
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={branchName}
                    placeholder="Auto-filled from IFSC"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-sm font-bold text-slate-700"
                  />
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <span className="text-xs font-extrabold text-slate-800 block">
                    Cancelled Cheque Upload (Private Bucket: seller-documents) *
                  </span>
                  {cancelledChequeUrl ? (
                    <span className="text-xs font-bold text-emerald-700">
                      ✓ Cancelled Cheque uploaded
                    </span>
                  ) : (
                    <span className="text-xs font-bold text-red-600">
                      {currentStepValidation.errors.cancelledChequeUrl}
                    </span>
                  )}
                </div>
                <label className="cursor-pointer inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-extrabold">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload Cancelled Cheque</span>
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const url = await readFileAsDataUrlAndUpload(
                        file,
                        'seller-documents',
                        session.uid
                      );
                      setCancelledChequeUrl(url);
                    }}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          )}

          {/* STEP 5: SHIPPING / PICKUP LOCATION */}
          {activeStep === 5 && (
            <div className="space-y-6">
              {warehouses.map((wh, idx) => (
                <div
                  key={idx}
                  className="p-5 rounded-2xl bg-slate-50 border border-slate-200/90 space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-800">
                      Warehouse #{idx + 1} {idx === 0 ? '(Primary Dispatch Hub)' : ''}
                    </span>
                    {warehouses.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setWarehouses((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="text-xs font-bold text-red-600 hover:underline"
                      >
                        Remove Warehouse
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-extrabold text-slate-700 mb-1">
                        Warehouse / Dark Store Name *
                      </label>
                      <input
                        type="text"
                        value={wh.warehouseName}
                        onChange={(e) =>
                          setWarehouses((prev) =>
                            prev.map((w, i) =>
                              i === idx ? { ...w, warehouseName: e.target.value } : w
                            )
                          )
                        }
                        className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-sm font-semibold"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-extrabold text-slate-700 mb-1">
                        Pickup Pincode (6 digits) *
                      </label>
                      <input
                        type="text"
                        maxLength={6}
                        value={wh.pincode}
                        onChange={(e) =>
                          setWarehouses((prev) =>
                            prev.map((w, i) =>
                              i === idx
                                ? { ...w, pincode: e.target.value.replace(/\D/g, '') }
                                : w
                            )
                          )
                        }
                        placeholder="122018"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-sm font-mono font-bold"
                      />
                      {currentStepValidation.errors[`warehouse_${idx}_pincode`] && (
                        <p className="text-xs font-bold text-red-600 mt-1">
                          {currentStepValidation.errors[`warehouse_${idx}_pincode`]}
                        </p>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-extrabold text-slate-700 mb-1">
                      Complete Pickup Address *
                    </label>
                    <input
                      type="text"
                      value={wh.pickupAddress}
                      onChange={(e) =>
                        setWarehouses((prev) =>
                          prev.map((w, i) =>
                            i === idx ? { ...w, pickupAddress: e.target.value } : w
                          )
                        )
                      }
                      placeholder="Plot / Building, Street, Industrial Area, Landmark"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-sm font-semibold"
                    />
                    {currentStepValidation.errors[`warehouse_${idx}_address`] && (
                      <p className="text-xs font-bold text-red-600 mt-1">
                        {currentStepValidation.errors[`warehouse_${idx}_address`]}
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-extrabold text-slate-700 mb-1">
                        Dispatch Contact Person *
                      </label>
                      <input
                        type="text"
                        value={wh.contactPerson}
                        onChange={(e) =>
                          setWarehouses((prev) =>
                            prev.map((w, i) =>
                              i === idx ? { ...w, contactPerson: e.target.value } : w
                            )
                          )
                        }
                        className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-sm font-semibold"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-extrabold text-slate-700 mb-1">
                        Contact Mobile (10 digits) *
                      </label>
                      <input
                        type="tel"
                        maxLength={10}
                        value={wh.contactPhone}
                        onChange={(e) =>
                          setWarehouses((prev) =>
                            prev.map((w, i) =>
                              i === idx
                                ? { ...w, contactPhone: e.target.value.replace(/\D/g, '') }
                                : w
                            )
                          )
                        }
                        className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-sm font-mono font-bold"
                      />
                      {currentStepValidation.errors[`warehouse_${idx}_phone`] && (
                        <p className="text-xs font-bold text-red-600 mt-1">
                          {currentStepValidation.errors[`warehouse_${idx}_phone`]}
                        </p>
                      )}
                    </div>
                  </div>

                  <div>
                    <span className="block text-xs font-extrabold text-slate-700 mb-2">
                      Preferred Daily Pickup Time Slots *
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {PICKUP_TIME_SLOTS_LIST.map((slot) => {
                        const active = wh.pickupTimeSlots.includes(slot);
                        return (
                          <button
                            key={slot}
                            type="button"
                            onClick={() => {
                              const next = active
                                ? wh.pickupTimeSlots.filter((s) => s !== slot)
                                : [...wh.pickupTimeSlots, slot];
                              setWarehouses((prev) =>
                                prev.map((w, i) =>
                                  i === idx ? { ...w, pickupTimeSlots: next } : w
                                )
                              );
                            }}
                            className={`p-2.5 rounded-xl border text-xs font-bold text-left flex items-center justify-between ${
                              active
                                ? 'bg-emerald-50 border-emerald-700 text-emerald-950'
                                : 'bg-white border-slate-200 text-slate-600'
                            }`}
                          >
                            <span>{slot}</span>
                            {active && <Check className="w-3.5 h-3.5 text-emerald-700" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={() =>
                  setWarehouses((prev) => [
                    ...prev,
                    {
                      warehouseName: `Secondary Warehouse #${prev.length + 1}`,
                      pickupAddress: '',
                      pincode: '',
                      contactPerson: spocName,
                      contactPhone: bundle.profile.phone,
                      pickupTimeSlots: [PICKUP_TIME_SLOTS_LIST[1]],
                      isPrimary: false,
                    },
                  ])
                }
                className="px-4 py-2.5 rounded-xl border border-emerald-700 text-emerald-800 text-xs font-extrabold hover:bg-emerald-50"
              >
                + Add Multiple Warehouses
              </button>
            </div>
          )}

          {/* STEP 6: DIGITAL SIGNATURE & SELLER AGREEMENT */}
          {activeStep === 6 && (
            <div className="space-y-6">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-extrabold text-slate-800 block">
                      Draw Digital Signature (Mouse / Touch) or Upload Image *
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Sign inside the box below or upload an image of your authorized signature
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={clearSignatureCanvas}
                      className="px-3 py-1.5 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-700"
                    >
                      Clear Pad
                    </button>
                    <label className="cursor-pointer px-3 py-1.5 rounded-xl bg-emerald-700 text-white text-xs font-extrabold">
                      Upload Signature
                      <input
                        type="file"
                        accept="image/*"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const url = await readFileAsDataUrlAndUpload(
                            file,
                            'seller-documents',
                            session.uid
                          );
                          setSignatureDataUrl(url);
                        }}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>

                <canvas
                  ref={canvasRef}
                  width={540}
                  height={140}
                  onMouseDown={startDrawing}
                  onMouseMove={drawSignatureMove}
                  onMouseUp={endDrawing}
                  onMouseLeave={endDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={drawSignatureMove}
                  onTouchEnd={endDrawing}
                  className="w-full h-36 bg-white rounded-xl border-2 border-dashed border-slate-300 cursor-crosshair touch-none"
                />

                {signatureDataUrl && (
                  <div className="flex items-center gap-3 pt-1">
                    <span className="text-xs font-bold text-emerald-700">
                      ✓ Captured Signature Preview:
                    </span>
                    <img
                      src={signatureDataUrl}
                      alt="Captured Digital Signature"
                      className="h-10 rounded border border-slate-200 bg-white px-2"
                    />
                  </div>
                )}
              </div>

              {/* Seller Agreement Preview & Checkbox */}
              <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-slate-900">
                    Bharat Organic Marketplace Seller Agreement (2026)
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowTermsModal((v) => !v)}
                    className="text-xs font-extrabold text-emerald-800 underline"
                  >
                    {showTermsModal ? 'Hide Agreement Preview' : 'Preview Full Terms'}
                  </button>
                </div>
                {showTermsModal && (
                  <div className="p-3.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-600 space-y-1.5 max-h-40 overflow-y-auto">
                    <p>
                      <strong>1. 100% Organic & FSSAI Authenticity:</strong> Seller warrants that
                      all products listed on Bharat Organic comply with FSSAI & NPOP/PGS-India
                      standards and are free from synthetic adulteration.
                    </p>
                    <p>
                      <strong>2. Cold-Chain & 21-Minute SLA:</strong> Seller agrees to maintain
                      accurate live stock at designated pickup hubs for rapid dark-store dispatch.
                    </p>
                    <p>
                      <strong>3. Settlement & Commission:</strong> Payouts are settled via NEFT/IMPS
                      to the verified IFSC bank account after deducting an 8% platform fulfillment
                      fee.
                    </p>
                  </div>
                )}

                <label className="flex items-start gap-2.5 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={(e) => setAcceptedTerms(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-emerald-700"
                  />
                  <span className="text-xs font-bold text-slate-800">
                    I hereby accept the Bharat Organic Seller Agreement & certify that all KYC,
                    FSSAI, and Bank details submitted are true and authentic. *
                  </span>
                </label>
                {currentStepValidation.errors.acceptedTerms && (
                  <p className="text-xs font-bold text-red-600">
                    {currentStepValidation.errors.acceptedTerms}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* STEP 7: VERIFY & SUBMIT (Read-Only Summary of Steps 1-6 with Edit Links) */}
          {activeStep === 7 && (
            <div className="space-y-4">
              <p className="text-xs text-slate-600">
                Please verify your onboarding details below. Click <strong>Edit</strong> on any
                section to make changes before submitting for Admin review.
              </p>

              {[
                {
                  step: 1,
                  title: '1. Business Details',
                  summary: `Categories (${categoriesSold.length}): ${categoriesSold.join(', ')} · SPOC: ${spocName} (${spocDesignation})`,
                },
                {
                  step: 2,
                  title: '2. Brand Details',
                  summary: `Brand: ${brandName} · ${shortDescription}`,
                },
                {
                  step: 3,
                  title: '3. Seller & KYC Details',
                  summary: `${legalBusinessName} (${businessType}) · PAN: ${panNumber} · FSSAI: ${fssaiNumber} (Exp: ${fssaiExpiryDate}) · ${registeredDistrict}, ${registeredState} - ${registeredPincode}`,
                },
                {
                  step: 4,
                  title: '4. Bank Details',
                  summary: `Holder: ${accountHolderName} · A/C: ${
                    accountNumberMasked ||
                    (accountNumber ? `XXXX${accountNumber.slice(-4)}` : 'Not set')
                  } · IFSC: ${ifscCode} (${bankName}, ${branchName})`,
                },
                {
                  step: 5,
                  title: '5. Shipping / Pickup Locations',
                  summary: `${warehouses.length} Warehouse(s): ${warehouses
                    .map((w) => `${w.warehouseName} (${w.pincode})`)
                    .join('; ')}`,
                },
                {
                  step: 6,
                  title: '6. Digital Signature & Agreement',
                  summary: `Digital Signature Attached · Seller Agreement Accepted: ${
                    acceptedTerms ? 'Yes' : 'No'
                  }`,
                },
              ].map((sec) => (
                <div
                  key={sec.step}
                  className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-start justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-extrabold text-slate-900">{sec.title}</span>
                      {stepValidationMap[sec.step]?.valid ? (
                        <span className="text-[10px] font-extrabold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                          ✓ Complete
                        </span>
                      ) : (
                        <span className="text-[10px] font-extrabold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                          Incomplete
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600">{sec.summary}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveStep(sec.step)}
                    className="text-xs font-extrabold text-emerald-700 hover:underline shrink-0"
                  >
                    Edit
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sticky Bottom Bar with Save & Continue / Submit for Review */}
        <div className="sticky bottom-0 z-20 mt-6 bg-white/95 backdrop-blur-xs border border-slate-200/90 rounded-2xl p-4 shadow-lg flex items-center justify-between gap-4">
          <button
            type="button"
            disabled={activeStep === 1}
            onClick={() => setActiveStep((s) => Math.max(1, s - 1))}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-extrabold text-slate-700 disabled:opacity-40"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Previous Step</span>
          </button>

          {activeStep < 7 ? (
            <button
              type="button"
              disabled={!currentStepValidation.valid || savingStep}
              onClick={handleSaveAndContinue}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-300 disabled:text-slate-500 text-white text-xs font-extrabold shadow-sm transition-all"
            >
              <span>{savingStep ? 'Saving...' : 'Save & Continue'}</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              disabled={!stepValidationMap[7]?.valid || savingStep}
              onClick={handleSubmitApplication}
              className="inline-flex items-center gap-2 px-7 py-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-300 disabled:text-slate-500 text-white text-xs font-extrabold shadow-md transition-all"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{savingStep ? 'Submitting...' : 'Submit for Review'}</span>
            </button>
          )}
        </div>
      </main>

      {/* Edit Seller Email & Phone Modal */}
      {editingContacts && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Edit Seller Contact Info"
          className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="font-display text-lg font-extrabold text-slate-900">
              Update Verified Seller Contact Info
            </h3>
            {contactSaveMsg && (
              <p className="text-xs font-bold text-red-600">{contactSaveMsg}</p>
            )}
            <form onSubmit={handleSaveContacts} className="space-y-4">
              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1">
                  10-Digit Mobile Number
                </label>
                <input
                  type="tel"
                  maxLength={10}
                  value={editPhoneInput}
                  onChange={(e) => setEditPhoneInput(e.target.value.replace(/\D/g, ''))}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold"
                />
              </div>
              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1">
                  Business Email Address
                </label>
                <input
                  type="email"
                  value={editEmailInput}
                  onChange={(e) => setEditEmailInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingContacts(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-700 text-white text-xs font-extrabold"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
