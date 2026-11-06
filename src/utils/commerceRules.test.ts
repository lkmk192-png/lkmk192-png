import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateIndianMobile,
  calculateLocationServiceability,
  calculateBillSummary,
  resolveCartActionState,
  validateOrderStatusTransition,
} from './commerceRules.ts';

test('validateIndianMobile accepts valid 10-digit numbers starting 6-9 and rejects invalid ones', () => {
  assert.equal(validateIndianMobile('9876543210'), true);
  assert.equal(validateIndianMobile('6123456789'), true);
  assert.equal(validateIndianMobile('5123456789'), false);
  assert.equal(validateIndianMobile('987654321'), false);
  assert.equal(validateIndianMobile('98765432100'), false);
});

test('calculateLocationServiceability computes dynamic ETA and serviceability for Nirvana Country Gurugram', () => {
  const res = calculateLocationServiceability(28.414, 77.068, '122018');
  assert.equal(res.isServiceable, true);
  assert.equal(res.nearestHub, 'Gurugram Nirvana Sec-50 Hub');
  assert.ok(res.etaMinutes >= 11 && res.etaMinutes <= 25);
});

test('calculateLocationServiceability marks remote coordinates outside service area as unserviceable', () => {
  const res = calculateLocationServiceability(24.5854, 73.7125, '313001'); // Udaipur
  assert.equal(res.isServiceable, false);
});

test('calculateBillSummary computes MRP discount, free delivery over ₹199, coupon savings, and GST accurately', () => {
  const bill = calculateBillSummary(
    [
      { productId: 1, mrp: 650, price: 520, quantity: 1, stock: 20 },
      { productId: 2, mrp: 120, price: 95, quantity: 2, stock: 15 },
    ],
    {
      code: 'BHARAT100',
      discountType: 'flat',
      discountValue: 100,
      minOrderAmount: 499,
      maxDiscount: 100,
      isActive: true,
    },
    2.2
  );

  // MRP = 650 + 240 = 890; Price = 520 + 190 = 710; MRP discount = 180
  assert.equal(bill.itemCount, 3);
  assert.equal(bill.itemTotalMrp, 890);
  assert.equal(bill.itemTotalPrice, 710);
  assert.equal(bill.discountOnMrp, 180);
  assert.equal(bill.couponDiscount, 100);
  assert.equal(bill.deliveryFee, 0);
  assert.equal(bill.deliverySavings, 30);
  assert.equal(bill.handlingFee, 4);
  assert.equal(bill.handlingSavings, 11);
  assert.ok(bill.totalSavings > 300);
});

test('resolveCartActionState transitions between Login -> Add Address -> Proceed to Pay', () => {
  assert.deepEqual(resolveCartActionState(false, false, 450), {
    state: 'LOGIN_REQUIRED',
    label: 'Login to proceed',
  });
  assert.deepEqual(resolveCartActionState(true, false, 450), {
    state: 'ADDRESS_REQUIRED',
    label: 'Add Address to proceed',
  });
  assert.deepEqual(resolveCartActionState(true, true, 450), {
    state: 'READY_TO_PAY',
    label: 'Proceed to Pay ₹450',
  });
});

test('validateOrderStatusTransition enforces status machine and stock rules', () => {
  const confirmStep = validateOrderStatusTransition('placed', 'confirmed');
  assert.equal(confirmStep.allowed, true);
  assert.equal(confirmStep.stockAction, 'decrement');

  const cancelAfterConfirm = validateOrderStatusTransition('confirmed', 'cancelled');
  assert.equal(cancelAfterConfirm.allowed, true);
  assert.equal(cancelAfterConfirm.stockAction, 'restore');

  const cancelAfterPacked = validateOrderStatusTransition('packed', 'cancelled');
  assert.equal(cancelAfterPacked.allowed, false);
});
