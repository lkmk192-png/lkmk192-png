export type SellerApplicationStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'rejected';

export interface RetailChannelItem {
  channel: string;
  monthlySales: string;
  referenceLink: string;
}

export interface SocialChannelItem {
  platform: string;
  followers: string;
  link: string;
}

export interface PickupWarehouseItem {
  id?: number;
  warehouseName: string;
  pickupAddress: string;
  pincode: string;
  contactPerson: string;
  contactPhone: string;
  pickupTimeSlots: string[];
  isPrimary: boolean;
}

export interface SellerWizardState {
  userUid: string;
  phone: string;
  email: string;
  phoneVerified: boolean;
  emailVerified: boolean;
  currentStep: number; // 1..7
  // Step 1: Business details
  categoriesSold: string[];
  retailChannels: RetailChannelItem[];
  socialChannels: SocialChannelItem[];
  spocName: string;
  spocDesignation: string;
  // Step 2: Brand details
  brandName: string;
  brandLogoUrl: string;
  shortDescription: string;
  brandStory: string;
  brandPhotos: string[];
  websiteUrl: string;
  // Step 3: Seller details
  businessType: string;
  legalBusinessName: string;
  panNumber: string;
  gstinNumber: string;
  gstBelowThreshold: boolean;
  fssaiNumber: string;
  fssaiExpiryDate: string;
  fssaiCertificateUrl: string;
  registeredState: string;
  registeredDistrict: string;
  registeredPincode: string;
  // Step 4: Bank details
  accountHolderName: string;
  accountNumber: string;
  confirmAccountNumber: string;
  accountNumberMasked: string;
  ifscCode: string;
  bankName: string;
  branchName: string;
  cancelledChequeUrl: string;
  // Step 5: Shipping/pickup locations
  warehouses: PickupWarehouseItem[];
  // Step 6: Digital signature
  signatureDataUrl: string;
  acceptedTerms: boolean;
  // Application status
  applicationStatus: SellerApplicationStatus;
  reviewNote: string;
}

export const SELLER_ALLOWED_CATEGORIES = [
  'Organic Rice',
  'Millets',
  'Pulses & Dal',
  'Spices',
  'Honey',
  'Jaggery',
  'Cold-Pressed Oils',
  'Dry Fruits',
  'Tea & Coffee',
  'Fresh Produce',
  'Natural Products',
  'Farm Products',
] as const;

export const SELLER_BUSINESS_TYPES = [
  'Individual',
  'Proprietorship',
  'Partnership',
  'Pvt Ltd',
  'FPO',
  'Farmer group',
] as const;

export const SPOC_DESIGNATIONS = [
  'Founder / Owner',
  'Managing Director / Partner',
  'FPO President / Secretary',
  'Operations & Supply Head',
  'Key Account Manager',
] as const;

export const PICKUP_TIME_SLOTS = [
  'Morning (07:00 AM – 11:00 AM)',
  'Midday (11:00 AM – 03:00 PM)',
  'Evening (03:00 PM – 07:00 PM)',
] as const;

export const SELLER_CATEGORIES_LIST = SELLER_ALLOWED_CATEGORIES;
export const BUSINESS_TYPES_LIST = SELLER_BUSINESS_TYPES;
export const SPOC_DESIGNATIONS_LIST = SPOC_DESIGNATIONS;
export const PICKUP_TIME_SLOTS_LIST = PICKUP_TIME_SLOTS;

export const INDIAN_STATES_LIST = [
  'Haryana',
  'Delhi NCR',
  'Uttar Pradesh',
  'Himachal Pradesh',
  'Uttarakhand',
  'Punjab',
  'Rajasthan',
  'Madhya Pradesh',
  'Maharashtra',
  'Karnataka',
  'Gujarat',
  'Tamil Nadu',
  'Kerala',
  'Assam',
] as const;

/**
 * PAN Validation: 5 uppercase letters + 4 digits + 1 uppercase letter (AAAAA9999A)
 */
export function validatePan(pan: string): boolean {
  const clean = (pan || '').trim().toUpperCase();
  return /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(clean);
}

/**
 * GSTIN Validation: 15 characters (e.g., 06AABCU9603R1ZM)
 */
export function validateGstin(gstin: string, isBelowThreshold = false): boolean {
  const clean = (gstin || '').trim().toUpperCase();
  if (isBelowThreshold && clean.length === 0) return true;
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(clean);
}

/**
 * IFSC Validation: 4 uppercase letters + '0' + 6 alphanumeric characters (AAAA0XXXXXX)
 */
export function validateIfsc(ifsc: string): boolean {
  const clean = (ifsc || '').trim().toUpperCase();
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(clean);
}

/**
 * Indian Pincode Validation: 6 digits starting 1-9
 */
export function validatePincode(pincode: string): boolean {
  const clean = (pincode || '').trim();
  return /^[1-9][0-9]{5}$/.test(clean);
}

/**
 * Indian Mobile Validation: 10 digits starting 6-9
 */
export function validateMobile(phone: string): boolean {
  const clean = (phone || '').replace(/\D/g, '');
  return /^[6-9][0-9]{9}$/.test(clean);
}

/**
 * Email Validation
 */
export function validateEmail(email: string): boolean {
  const clean = (email || '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean);
}

/**
 * FSSAI License Validation: 14 digits
 */
export function validateFssai(fssai: string): boolean {
  const clean = (fssai || '').replace(/\D/g, '');
  return /^[0-9]{14}$/.test(clean);
}

/**
 * Mask bank account number so only last 4 digits are visible: XXXX1234
 */
export function maskAccountNumber(accountNumber: string): string {
  const clean = (accountNumber || '').replace(/\s+/g, '');
  if (clean.length < 4) return 'XXXX0000';
  const last4 = clean.slice(-4);
  return `XXXX${last4}`;
}

/**
 * Deterministic Indian IFSC Bank & Branch lookup fallback when offline or testing
 */
export function lookupIfscLocally(ifsc: string): {
  bank: string;
  branch: string;
} | null {
  const clean = (ifsc || '').trim().toUpperCase();
  if (!validateIfsc(clean)) return null;
  const prefix = clean.slice(0, 4);
  const branchCode = clean.slice(5);
  const bankDirectory: Record<string, string> = {
    HDFC: 'HDFC Bank Ltd.',
    ICIC: 'ICICI Bank Ltd.',
    SBIN: 'State Bank of India',
    UTIB: 'Axis Bank Ltd.',
    KKBK: 'Kotak Mahindra Bank',
    PUNB: 'Punjab National Bank',
    BARB: 'Bank of Baroda',
    CNRB: 'Canara Bank',
    IDFB: 'IDFC FIRST Bank',
    YESB: 'Yes Bank Ltd.',
  };
  const bank = bankDirectory[prefix] || `${prefix} Scheduled Commercial Bank`;
  return {
    bank,
    branch: `Corporate Organic Hub Branch (${branchCode})`,
  };
}

/**
 * Validate a specific onboarding wizard step (1..6) and return field-level errors
 */
export function validateSellerWizardStep(
  step: number,
  state: Partial<SellerWizardState>
): { valid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  if (step === 1) {
    if (
      !Array.isArray(state.categoriesSold) ||
      state.categoriesSold.length === 0
    ) {
      errors.categoriesSold = 'Select at least 1 category (up to 10).';
    } else if (state.categoriesSold.length > 10) {
      errors.categoriesSold = 'You can select up to 10 categories maximum.';
    }
    if (!state.spocName || state.spocName.trim().length < 2) {
      errors.spocName = 'Contact person (SPOC) full name is required.';
    }
    if (!state.spocDesignation || !state.spocDesignation.trim()) {
      errors.spocDesignation = 'Please select a designation.';
    }
  } else if (step === 2) {
    if (!state.brandName || state.brandName.trim().length < 2) {
      errors.brandName = 'Brand name is required.';
    }
    if (!state.brandLogoUrl || !state.brandLogoUrl.trim()) {
      errors.brandLogoUrl = 'Please upload your brand logo.';
    }
    if (!state.shortDescription || state.shortDescription.trim().length < 10) {
      errors.shortDescription =
        'Short description must be at least 10 characters.';
    }
    if (!state.brandStory || state.brandStory.trim().length < 20) {
      errors.brandStory = 'Brand story must be at least 20 characters.';
    }
    if (Array.isArray(state.brandPhotos) && state.brandPhotos.length === 0) {
      errors.brandPhotos = 'Upload at least 1 sample product photo (up to 5).';
    } else if (Array.isArray(state.brandPhotos) && state.brandPhotos.length > 5) {
      errors.brandPhotos = 'Maximum 5 product photos allowed.';
    }
  } else if (step === 3) {
    if (!state.businessType) {
      errors.businessType = 'Select a business type.';
    }
    if (!state.legalBusinessName || state.legalBusinessName.trim().length < 3) {
      errors.legalBusinessName = 'Legal business name is required.';
    }
    if (!validatePan(state.panNumber || '')) {
      errors.panNumber = 'Enter a valid 10-character PAN (e.g. ABCDE1234F).';
    }
    if (!validateGstin(state.gstinNumber || '', state.gstBelowThreshold)) {
      errors.gstinNumber =
        'Enter a valid 15-character GSTIN (e.g. 06ABCDE1234F1Z5) or mark GST Exempt.';
    }
    if (!validateFssai(state.fssaiNumber || '')) {
      errors.fssaiNumber = 'Enter a valid 14-digit FSSAI license number.';
    }
    if (!state.fssaiExpiryDate) {
      errors.fssaiExpiryDate = 'FSSAI license expiry date is required.';
    }
    if (!state.fssaiCertificateUrl) {
      errors.fssaiCertificateUrl = 'Upload your FSSAI certificate.';
    }
    if (!state.registeredState || !state.registeredState.trim()) {
      errors.registeredState = 'State is required.';
    }
    if (!state.registeredDistrict || !state.registeredDistrict.trim()) {
      errors.registeredDistrict = 'District is required.';
    }
    if (!validatePincode(state.registeredPincode || '')) {
      errors.registeredPincode = 'Enter a valid 6-digit pincode.';
    }
  } else if (step === 4) {
    if (!state.accountHolderName || state.accountHolderName.trim().length < 3) {
      errors.accountHolderName = 'Account holder name is required.';
    }
    const hasExistingMasked =
      Boolean(state.accountNumberMasked) && !state.accountNumber;
    if (!hasExistingMasked) {
      const cleanAcc = (state.accountNumber || '').replace(/\D/g, '');
      if (cleanAcc.length < 9 || cleanAcc.length > 18) {
        errors.accountNumber = 'Enter a valid bank account number (9–18 digits).';
      }
      if (state.accountNumber !== state.confirmAccountNumber) {
        errors.confirmAccountNumber =
          'Confirm account number does not match.';
      }
    }
    if (!validateIfsc(state.ifscCode || '')) {
      errors.ifscCode = 'Enter a valid 11-character IFSC (e.g. HDFC0001234).';
    }
    if (!state.cancelledChequeUrl) {
      errors.cancelledChequeUrl = 'Please upload a cancelled cheque or bank proof.';
    }
  } else if (step === 5) {
    if (!Array.isArray(state.warehouses) || state.warehouses.length === 0) {
      errors.warehouses = 'Add at least 1 pickup warehouse location.';
    } else {
      state.warehouses.forEach((w, idx) => {
        if (!w.pickupAddress || w.pickupAddress.trim().length < 5) {
          errors[`warehouse_${idx}_address`] = 'Pickup address is required.';
        }
        if (!validatePincode(w.pincode)) {
          errors[`warehouse_${idx}_pincode`] = 'Enter a valid 6-digit pincode.';
        }
        if (!w.contactPerson || w.contactPerson.trim().length < 2) {
          errors[`warehouse_${idx}_contact`] = 'Contact person is required.';
        }
        if (!validateMobile(w.contactPhone)) {
          errors[`warehouse_${idx}_phone`] =
            'Enter a valid 10-digit mobile number.';
        }
        if (!Array.isArray(w.pickupTimeSlots) || w.pickupTimeSlots.length === 0) {
          errors[`warehouse_${idx}_slots`] =
            'Select at least 1 pickup time slot.';
        }
      });
    }
  } else if (step === 6) {
    if (!state.signatureDataUrl || !state.signatureDataUrl.trim()) {
      errors.signatureDataUrl =
        'Please draw your digital signature or upload a signature image.';
    }
    if (!state.acceptedTerms) {
      errors.acceptedTerms =
        'You must accept the Bharat Organic Seller Agreement to proceed.';
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}
