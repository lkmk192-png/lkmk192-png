import { validateIndianMobile } from './commerceRules.ts';

export const RESEND_OTP_COOLDOWN_SECONDS = 60;

/**
 * Normalizes a Supabase URL or 20-character project reference ID into a valid https://<ref>.supabase.co URL.
 */
export function normalizeSupabaseUrl(rawUrl: string | undefined | null): string {
  const trimmed = (rawUrl || '').trim().replace(/\/+$/, '');
  if (!trimmed || trimmed.includes('MY_SUPABASE')) {
    return '';
  }
  if (/^https?:\/\/.+\..+/i.test(trimmed)) {
    return trimmed;
  }
  if (/^[a-z0-9-]+\.supabase\.co$/i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  if (/^[a-z0-9]{12,32}$/i.test(trimmed)) {
    return `https://${trimmed}.supabase.co`;
  }
  return '';
}

/**
 * Cleans and validates an Indian mobile number and returns it in strict E.164 format: +91XXXXXXXXXX.
 * Throws a user-friendly error if the number is not a valid 10-digit Indian mobile number.
 */
export function formatE164IndianPhone(rawPhone: string): string {
  const digits = String(rawPhone || '').replace(/\D/g, '');
  const tenDigits =
    digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;

  if (!validateIndianMobile(tenDigits)) {
    throw new Error('Please enter a valid 10-digit Indian mobile number starting with 6–9.');
  }

  return `+91${tenDigits}`;
}

/**
 * Formats Supabase Auth errors into clear, human-readable messages for display on the login screen.
 */
export function formatSupabaseAuthError(error: unknown, fallback = 'Authentication failed. Please try again.'): string {
  if (!error) return fallback;

  const rawMessage =
    typeof error === 'string'
      ? error
      : error instanceof Error
      ? error.message
      : typeof (error as any)?.message === 'string'
      ? (error as any).message
      : fallback;

  const trimmed = rawMessage.trim();
  if (!trimmed) return fallback;

  if (/invalid login credentials|token has expired or is invalid/i.test(trimmed)) {
    return 'Invalid or expired OTP. Please check the 6-digit code and try again.';
  }
  if (/rate limit|too many requests|for security purposes/i.test(trimmed)) {
    return trimmed;
  }
  if (/phone provider|sms provider|twilio|messagebird|vonage|unconfigured/i.test(trimmed)) {
    return `SMS provider error: ${trimmed}`;
  }

  return trimmed;
}
