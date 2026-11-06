import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RESEND_OTP_COOLDOWN_SECONDS,
  normalizeSupabaseUrl,
  formatE164IndianPhone,
  formatSupabaseAuthError,
} from './phoneAuth.ts';

test('normalizeSupabaseUrl handles full URLs and project ref IDs', () => {
  assert.equal(
    normalizeSupabaseUrl('https://grdafwhwpkpfexample.supabase.co/'),
    'https://grdafwhwpkpfexample.supabase.co'
  );
  assert.equal(
    normalizeSupabaseUrl('grdafwhwpkpfexample.supabase.co'),
    'https://grdafwhwpkpfexample.supabase.co'
  );
  assert.equal(
    normalizeSupabaseUrl('grdafwhwpkpf12345678'),
    'https://grdafwhwpkpf12345678.supabase.co'
  );
  assert.equal(normalizeSupabaseUrl(''), '');
  assert.equal(normalizeSupabaseUrl('MY_SUPABASE_URL'), '');
});

test('formatE164IndianPhone always prefixes valid 10-digit numbers with +91', () => {
  assert.equal(formatE164IndianPhone('9876543210'), '+919876543210');
  assert.equal(formatE164IndianPhone('+91 98765 43210'), '+919876543210');
  assert.equal(formatE164IndianPhone('919876543210'), '+919876543210');

  assert.throws(
    () => formatE164IndianPhone('12345'),
    /valid 10-digit Indian mobile number/i
  );
  assert.throws(
    () => formatE164IndianPhone('5876543210'),
    /valid 10-digit Indian mobile number/i
  );
});

test('RESEND_OTP_COOLDOWN_SECONDS is 60 seconds', () => {
  assert.equal(RESEND_OTP_COOLDOWN_SECONDS, 60);
});

test('formatSupabaseAuthError produces clean error messages', () => {
  assert.equal(
    formatSupabaseAuthError(new Error('Token has expired or is invalid')),
    'Invalid or expired OTP. Please check the 6-digit code and try again.'
  );
  assert.equal(
    formatSupabaseAuthError(new Error('Phone auth rate limit exceeded')),
    'Phone auth rate limit exceeded'
  );
});

import { isTransientDbError, withDbRetry } from '../db/index.ts';

test('isTransientDbError detects nested DrizzleQueryError with Connection terminated cause', () => {
  const rootCause = new Error('Connection terminated unexpectedly');
  const timeoutCause = new Error('Connection terminated due to connection timeout', {
    cause: rootCause,
  });
  const drizzleErr = new Error(
    'Failed query: select "id", "slug" from "categories" order by "categories"."display_order" asc',
    { cause: timeoutCause }
  );

  assert.equal(isTransientDbError(drizzleErr), true);
  assert.equal(isTransientDbError(new Error('Syntax error at or near SELECT')), false);
});

test('withDbRetry retries when DrizzleQueryError has nested transient connection cause', async () => {
  let attempts = 0;
  const result = await withDbRetry(async () => {
    attempts++;
    if (attempts === 1) {
      throw new Error('Failed query: select * from categories', {
        cause: new Error('Connection terminated due to connection timeout'),
      });
    }
    return 'recovered';
  }, 2);

  assert.equal(result, 'recovered');
  assert.equal(attempts, 2);
});
