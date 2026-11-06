import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validatePan,
  validateGstin,
  validateIfsc,
  validatePincode,
  validateMobile,
  validateFssai,
  maskAccountNumber,
  lookupIfscLocally,
  validateSellerWizardStep,
} from './sellerValidation.ts';
import type { SellerWizardState } from './sellerValidation.ts';

test('validatePan accepts valid AAAAA9999A format and rejects invalid formats', () => {
  assert.equal(validatePan('ABCDE1234F'), true);
  assert.equal(validatePan('abcde1234f'), true);
  assert.equal(validatePan('ABCD12345F'), false);
  assert.equal(validatePan('12345ABCDE'), false);
});

test('validateGstin validates 15-character GSTIN and supports below-threshold exemption', () => {
  assert.equal(validateGstin('06ABCDE1234F1Z5', false), true);
  assert.equal(validateGstin('INVALIDGSTIN', false), false);
  assert.equal(validateGstin('', true), true);
  assert.equal(validateGstin('', false), false);
});

test('validateIfsc and lookupIfscLocally validate AAAA0XXXXXX and resolve bank details', () => {
  assert.equal(validateIfsc('HDFC0001234'), true);
  assert.equal(validateIfsc('SBIN0005678'), true);
  assert.equal(validateIfsc('HDFC1001234'), false);
  const info = lookupIfscLocally('HDFC0001234');
  assert.ok(info);
  assert.equal(info.bank, 'HDFC Bank Ltd.');
});

test('validatePincode, validateMobile, and validateFssai enforce Indian KYC rules', () => {
  assert.equal(validatePincode('122018'), true);
  assert.equal(validatePincode('022018'), false);
  assert.equal(validateMobile('9876543210'), true);
  assert.equal(validateMobile('5876543210'), false);
  assert.equal(validateFssai('10823005001234'), true);
  assert.equal(validateFssai('12345'), false);
});

test('maskAccountNumber masks all but the final 4 digits as XXXX1234', () => {
  assert.equal(maskAccountNumber('5010023498761234'), 'XXXX1234');
  assert.equal(maskAccountNumber('987654321'), 'XXXX4321');
});

test('validateSellerWizardStep enforces required fields across Steps 1 to 6', () => {
  const baseState: SellerWizardState = {
    userUid: 'seller_test_1',
    phone: '9876543210',
    email: 'founder@vedicfarms.in',
    phoneVerified: true,
    emailVerified: true,
    currentStep: 1,
    categoriesSold: ['Organic Rice', 'Honey'],
    retailChannels: [],
    socialChannels: [],
    spocName: 'Arjun Singh',
    spocDesignation: 'Founder / Owner',
    brandName: 'Vedic Harvest',
    brandLogoUrl: 'data:image/png;base64,iVBOR',
    shortDescription: '100% certified organic Himalayan produce',
    brandStory: 'We partner with 450+ organic smallholders across Uttarakhand.',
    brandPhotos: ['data:image/png;base64,iVBOR'],
    websiteUrl: 'https://vedicharvest.in',
    businessType: 'FPO',
    legalBusinessName: 'Vedic Harvest Farmer Producer Co. Ltd.',
    panNumber: 'ABCDE1234F',
    gstinNumber: '05ABCDE1234F1Z5',
    gstBelowThreshold: false,
    fssaiNumber: '10823005001234',
    fssaiExpiryDate: '2028-12-31',
    fssaiCertificateUrl: 'data:image/png;base64,iVBOR',
    registeredState: 'Uttarakhand',
    registeredDistrict: 'Dehradun',
    registeredPincode: '248001',
    accountHolderName: 'Vedic Harvest FPO',
    accountNumber: '5010023498761234',
    confirmAccountNumber: '5010023498761234',
    accountNumberMasked: '',
    ifscCode: 'HDFC0001234',
    bankName: 'HDFC Bank Ltd.',
    branchName: 'Dehradun Branch',
    cancelledChequeUrl: 'data:image/png;base64,iVBOR',
    warehouses: [
      {
        warehouseName: 'Dehradun Hub',
        pickupAddress: 'Plot 14, Rajpur Organic Industrial Park, Dehradun',
        pincode: '248001',
        contactPerson: 'Arjun Singh',
        contactPhone: '9876543210',
        pickupTimeSlots: ['Morning (07:00 AM – 11:00 AM)'],
        isPrimary: true,
      },
    ],
    signatureDataUrl: 'data:image/png;base64,iVBOR',
    acceptedTerms: true,
    applicationStatus: 'draft',
    reviewNote: '',
  };

  for (let step = 1; step <= 6; step++) {
    const res = validateSellerWizardStep(step, baseState);
    assert.equal(res.valid, true, `Step ${step} should be valid`);
  }

  const invalidStep4 = validateSellerWizardStep(4, {
    ...baseState,
    confirmAccountNumber: '5010023498769999',
  });
  assert.equal(invalidStep4.valid, false);
  assert.ok(invalidStep4.errors.confirmAccountNumber);
});
