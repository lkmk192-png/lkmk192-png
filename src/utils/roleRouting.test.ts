import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getRoleHomePath,
  resolveRouteGuardRedirect,
  validateSingleRolePerMobile,
  getLogoClickTarget,
} from './roleRouting.ts';

test('getRoleHomePath maps customer -> /, seller -> /seller/dashboard, admin -> /admin', () => {
  assert.equal(getRoleHomePath('customer'), '/');
  assert.equal(getRoleHomePath('seller'), '/seller/dashboard');
  assert.equal(getRoleHomePath('admin'), '/admin');
  assert.equal(getRoleHomePath(null), '/');
});

test('Test Case 1: Seller opening buyer routes (/, /cart, /checkout) redirects to /seller/dashboard', () => {
  for (const buyerPath of ['/', '/cart', '/checkout', '/orders']) {
    const res = resolveRouteGuardRedirect({
      pathname: buyerPath,
      role: 'seller',
    });
    assert.equal(res.allowed, false);
    assert.equal(res.redirectTo, '/seller/dashboard');
  }
});

test('Test Case 2: Customer opening /seller or /seller/* redirects to /', () => {
  for (const sellerPath of ['/seller', '/seller/dashboard', '/seller/products/new']) {
    const res = resolveRouteGuardRedirect({
      pathname: sellerPath,
      role: 'customer',
    });
    assert.equal(res.allowed, false);
    assert.equal(res.redirectTo, '/');
  }
});

test('Admin opening buyer or seller routes redirects to /admin', () => {
  for (const path of ['/', '/cart', '/seller', '/seller/dashboard']) {
    const res = resolveRouteGuardRedirect({
      pathname: path,
      role: 'admin',
    });
    assert.equal(res.allowed, false);
    assert.equal(res.redirectTo, '/admin');
  }
  const adminOk = resolveRouteGuardRedirect({
    pathname: '/admin',
    role: 'admin',
  });
  assert.equal(adminOk.allowed, true);
  assert.equal(adminOk.redirectTo, null);
});

test('Single role per mobile number prevents customer and seller sharing the same phone', () => {
  const sellerTryingCustomer = validateSingleRolePerMobile({
    phone: '9999900002',
    existingRole: 'seller',
    requestedRole: 'customer',
  });
  assert.equal(sellerTryingCustomer.valid, false);
  assert.match(sellerTryingCustomer.error || '', /Seller account/);

  const customerTryingSeller = validateSingleRolePerMobile({
    phone: '9876543210',
    existingRole: 'customer',
    requestedRole: 'seller',
  });
  assert.equal(customerTryingSeller.valid, false);
  assert.match(customerTryingSeller.error || '', /Customer account/);

  const matchingRole = validateSingleRolePerMobile({
    phone: '9999900002',
    existingRole: 'seller',
    requestedRole: 'seller',
  });
  assert.equal(matchingRole.valid, true);
});

test('Logo click routes customer -> /, seller -> /seller/dashboard, admin -> /admin', () => {
  assert.equal(getLogoClickTarget('customer'), '/');
  assert.equal(getLogoClickTarget('seller'), '/seller/dashboard');
  assert.equal(getLogoClickTarget('admin'), '/admin');
  assert.equal(getLogoClickTarget(null), '/');
});
