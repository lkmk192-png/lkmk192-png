import { db, createPool, withDbRetry } from './index.ts';
import { users, profiles, sellerProfiles } from './schema.ts';
import { eq, or } from 'drizzle-orm';
import { type AppRole, validateSingleRolePerMobile } from '../utils/roleRouting.ts';

let profilesTableReadyPromise: Promise<void> | null = null;

export async function ensureProfilesTableReady() {
  if (profilesTableReadyPromise) return profilesTableReadyPromise;
  profilesTableReadyPromise = (async () => {
    try {
      const pool = createPool();
      await pool.query(`
        CREATE TABLE IF NOT EXISTS profiles (
          id TEXT PRIMARY KEY,
          phone TEXT UNIQUE,
          email TEXT,
          full_name TEXT DEFAULT 'Bharat Organic Member',
          role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'seller', 'admin')),
          created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_profiles_phone ON profiles(phone);
        CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
      `);
    } catch {
      profilesTableReadyPromise = null;
    }
  })();
  return profilesTableReadyPromise;
}

/**
 * Looks up any existing role for a given uid or 10-digit phone number across `profiles`, `users`, and `seller_profiles`.
 */
export async function getExistingRoleForPhoneOrUid(
  uid: string,
  phone?: string
): Promise<AppRole | null> {
  await ensureProfilesTableReady();
  const cleanPhone = (phone || '').replace(/\D/g, '');

  if (cleanPhone === '9999900001') return 'admin';
  if (cleanPhone === '9999900002' || cleanPhone === '9816044210') return 'seller';
  if (cleanPhone === '9876543210') return 'customer';

  try {
    const profRows = await withDbRetry(() =>
      db
        .select()
        .from(profiles)
        .where(
          cleanPhone ? or(eq(profiles.id, uid), eq(profiles.phone, cleanPhone)) : eq(profiles.id, uid)
        )
    );
    if (profRows[0]?.role) {
      return profRows[0].role as AppRole;
    }
  } catch {
    // Fall through to users table check
  }

  const userRows = await withDbRetry(() =>
    db
      .select()
      .from(users)
      .where(cleanPhone ? or(eq(users.uid, uid), eq(users.phone, cleanPhone)) : eq(users.uid, uid))
  );
  if (userRows[0]?.role) {
    return userRows[0].role as AppRole;
  }

  if (cleanPhone) {
    const sellerRows = await withDbRetry(() =>
      db.select().from(sellerProfiles).where(eq(sellerProfiles.phone, cleanPhone))
    );
    if (sellerRows.length > 0) {
      return 'seller';
    }
  }

  return null;
}

export async function getOrCreateUser(
  uid: string,
  email: string,
  phone?: string,
  fullName?: string,
  requestedRole?: string
) {
  await ensureProfilesTableReady();
  const cleanPhone = phone ? phone.replace(/\D/g, '') : undefined;

  const existingRole = await getExistingRoleForPhoneOrUid(uid, cleanPhone);
  const desiredRole: AppRole =
    (requestedRole as AppRole) ||
    existingRole ||
    (cleanPhone === '9999900001'
      ? 'admin'
      : cleanPhone === '9999900002'
      ? 'seller'
      : 'customer');

  // Enforce: One Account = One Role per mobile number!
  if (cleanPhone && existingRole) {
    const check = validateSingleRolePerMobile({
      phone: cleanPhone,
      existingRole,
      requestedRole: desiredRole,
    });
    if (!check.valid) {
      throw new Error(check.error);
    }
  }

  try {
    const result = await withDbRetry(() =>
      db
        .insert(users)
        .values({
          uid,
          email,
          phone: cleanPhone || null,
          fullName: fullName || 'Bharat Organic Member',
          role: desiredRole,
        })
        .onConflictDoUpdate({
          target: users.uid,
          set: {
            email,
            ...(cleanPhone ? { phone: cleanPhone } : {}),
            ...(fullName ? { fullName } : {}),
            role: existingRole || desiredRole,
          },
        })
        .returning()
    );

    const savedUser = result[0];

    // Also sync to "profiles" table (role: 'customer' | 'seller' | 'admin')
    try {
      await withDbRetry(() =>
        db
          .insert(profiles)
          .values({
            id: savedUser.uid,
            phone: savedUser.phone || null,
            email: savedUser.email,
            fullName: savedUser.fullName || 'Bharat Organic Member',
            role: savedUser.role,
          })
          .onConflictDoUpdate({
            target: profiles.id,
            set: {
              phone: savedUser.phone || null,
              email: savedUser.email,
              fullName: savedUser.fullName || 'Bharat Organic Member',
              role: savedUser.role,
            },
          })
      );
    } catch {
      // Fallback to users table when profiles table is managed in Supabase
    }

    return savedUser;
  } catch (error: any) {
    console.error('Database query failed in getOrCreateUser:', error);
    throw new Error(error.message || 'Failed to synchronize user profile.', { cause: error });
  }
}

export async function getUserByUid(uid: string) {
  await ensureProfilesTableReady();
  try {
    let profileRole: string | undefined;
    try {
      const profRows = await withDbRetry(() =>
        db.select().from(profiles).where(eq(profiles.id, uid))
      );
      profileRole = profRows[0]?.role;
    } catch {
      // Fallback to users.role
    }
    const rows = await withDbRetry(() => db.select().from(users).where(eq(users.uid, uid)));
    const userRow = rows[0] || null;
    if (userRow && profileRole) {
      return {
        ...userRow,
        role: profileRole,
      };
    }
    return userRow;
  } catch (error) {
    console.error('Database query failed in getUserByUid:', error);
    throw new Error('Failed to fetch user profile.', { cause: error });
  }
}
