import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  normalizeSupabaseUrl,
  formatE164IndianPhone,
  formatSupabaseAuthError,
} from '../utils/phoneAuth.ts';

const supabaseUrl = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL);
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

function initSupabaseClient(): SupabaseClient | null {
  if (
    !supabaseUrl ||
    !supabaseAnonKey ||
    supabaseAnonKey.includes('MY_SUPABASE')
  ) {
    return null;
  }
  try {
    return createClient(supabaseUrl, supabaseAnonKey);
  } catch {
    return null;
  }
}

export const supabase: SupabaseClient | null = initSupabaseClient();

export function isSupabaseConfigured(): boolean {
  return Boolean(supabase && supabaseUrl && supabaseAnonKey);
}

async function withTimeout<T>(promise: PromiseLike<T>, timeoutMs = 10000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Supabase request timed out. Please check your connection and try again.')),
      timeoutMs
    );
    Promise.resolve(promise)
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

export async function signInWithPhoneOtp(phoneInput: string) {
  const fullPhone = formatE164IndianPhone(phoneInput);
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Please ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are connected.'
    );
  }

  const { error } = await withTimeout(
    supabase.auth.signInWithOtp({
      phone: fullPhone,
    })
  );

  if (error) {
    throw new Error(formatSupabaseAuthError(error, 'Failed to send OTP via Supabase.'));
  }

  return { ok: true, provider: 'supabase' as const, phone: fullPhone };
}

export async function verifyPhoneOtp(
  phoneInput: string,
  token6Digits: string,
  role?: 'customer' | 'seller' | 'admin'
) {
  const fullPhone = formatE164IndianPhone(phoneInput);
  const cleanToken = String(token6Digits || '').trim();

  if (!/^\d{6}$/.test(cleanToken)) {
    throw new Error('Please enter a valid 6-digit OTP.');
  }

  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Please ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are connected.'
    );
  }

  const { data, error } = await withTimeout(
    supabase.auth.verifyOtp({
      phone: fullPhone,
      token: cleanToken,
      type: 'sms',
    })
  );

  if (error) {
    throw new Error(formatSupabaseAuthError(error, 'Invalid or expired OTP.'));
  }

  const tenDigitPhone = fullPhone.replace(/^\+91/, '');

  // Sync verified Supabase session with application backend & profiles table
  const syncRes = await fetch('/api/auth/otp/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phone: tenDigitPhone,
      token: cleanToken,
      role,
      supabaseUid: data?.user?.id,
    }),
  });
  const syncData = await syncRes.json();
  if (!syncRes.ok) {
    throw new Error(syncData.error || 'Could not sync verified phone profile.');
  }

  const finalUser = syncData.user || {
    id: 0,
    uid: data?.user?.id || `phone_${tenDigitPhone}`,
    email: data?.user?.email || `${tenDigitPhone}@bharatorganic.in`,
    phone: tenDigitPhone,
    fullName: `Organic Member (${tenDigitPhone.slice(-4)})`,
    role: role || 'customer',
  };

  await syncProfileToSupabaseTable({
    id: finalUser.uid,
    phone: finalUser.phone || tenDigitPhone,
    email: finalUser.email || `${tenDigitPhone}@bharatorganic.in`,
    full_name: finalUser.fullName || 'Bharat Organic Member',
    role: finalUser.role || 'customer',
  });

  return {
    ...syncData,
    user: finalUser,
    token: syncData.token || data?.session?.access_token || `bharat_otp_${tenDigitPhone}_${finalUser.role}`,
    supabaseSession: data?.session || null,
  };
}

/**
 * Syncs a user profile row into the Supabase "profiles" table with role ('customer' | 'seller' | 'admin').
 */
export async function syncProfileToSupabaseTable(profile: {
  id: string;
  phone?: string;
  email?: string;
  full_name?: string;
  role: 'customer' | 'seller' | 'admin';
}): Promise<void> {
  if (!supabase) return;
  try {
    await withTimeout(
      supabase.from('profiles').upsert(
        {
          id: profile.id,
          phone: profile.phone || null,
          full_name: profile.full_name || 'Bharat Organic Member',
          role: profile.role,
        },
        { onConflict: 'id' }
      ),
      2500
    );
  } catch {
    // Non-blocking sync when external Supabase instance is offline
  }
}

/**
 * Fetches the user's role ('customer' | 'seller' | 'admin') from the Supabase "profiles" table,
 * falling back to /api/auth/profile (PostgreSQL "profiles" table).
 */
export async function fetchRoleFromProfilesTable(
  userId: string,
  authToken?: string
): Promise<'customer' | 'seller' | 'admin' | null> {
  if (supabase && userId) {
    try {
      const { data, error } = await withTimeout(
        supabase.from('profiles').select('role').eq('id', userId).maybeSingle(),
        2500
      );
      if (!error && data?.role && ['customer', 'seller', 'admin'].includes(data.role)) {
        return data.role as 'customer' | 'seller' | 'admin';
      }
    } catch {
      // Fallback to backend PostgreSQL profiles table below
    }
  }

  if (authToken) {
    try {
      const res = await fetch('/api/auth/profile', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        const role = data.profile?.role || data.user?.role;
        if (role && ['customer', 'seller', 'admin'].includes(role)) {
          return role as 'customer' | 'seller' | 'admin';
        }
      }
    } catch {
      // Ignore network error
    }
  }

  return null;
}

/**
 * Syncs the submitted seller onboarding record to the Supabase "sellers" table
 * (user_id, business, brand, kyc, bank, pickup, status = "pending") if Supabase is configured.
 * Bounded by a strict timeout so "Submitting..." never hangs.
 */
export async function syncSellerToSupabaseTable(payload: {
  user_id: string;
  business: Record<string, any>;
  brand: Record<string, any>;
  kyc: Record<string, any>;
  bank: Record<string, any>;
  pickup: Record<string, any>[];
  status?: 'pending' | 'approved' | 'rejected';
}): Promise<void> {
  if (!supabase) return;
  try {
    await withTimeout(
      supabase.from('sellers').upsert(
        {
          user_id: payload.user_id,
          business: payload.business,
          brand: payload.brand,
          kyc: payload.kyc,
          bank: payload.bank,
          pickup: payload.pickup,
          status: payload.status || 'pending',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      ),
      3000
    );
  } catch {
    // Non-blocking sync when external Supabase project is not reachable
  }
}

/**
 * Syncs a newly created seller product into the Supabase "products" table
 * with seller_uid (seller_id) and status = "pending_approval".
 */
export async function syncProductToSupabaseTable(productRow: Record<string, any>): Promise<void> {
  if (!supabase) return;
  try {
    await withTimeout(
      supabase.from('products').insert({
        slug: productRow.slug,
        name: productRow.name,
        brand: productRow.brand,
        seller_uid: productRow.sellerUid,
        seller_category: productRow.sellerCategory,
        description: productRow.description,
        mrp: productRow.mrp,
        price: productRow.price,
        unit: productRow.unit,
        unit_label: productRow.unitLabel,
        stock: productRow.stock,
        image_url: productRow.imageUrl,
        gallery_urls: productRow.galleryUrls,
        certificate_url: productRow.certificateUrl || '',
        status: productRow.status || 'pending_approval',
      }),
      3000
    );
  } catch {
    // Non-blocking sync
  }
}
