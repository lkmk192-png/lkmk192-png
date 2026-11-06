import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { UserProfile } from '../types/commerce.ts';
import { AppRole, getRoleHomePath } from '../utils/roleRouting.ts';
import { fetchRoleFromProfilesTable, syncProfileToSupabaseTable } from '../lib/supabase.ts';

const AUTH_STORAGE_KEY = 'bharat_organic_auth_session_v1';
const SELLER_STORAGE_KEY = 'bharat_organic_seller_session_v1';

interface StoredAuthSession {
  user: UserProfile;
  token: string;
}

interface AuthContextValue {
  user: UserProfile | null;
  role: AppRole | null;
  authToken: string;
  loading: boolean;
  login: (user: UserProfile, token: string) => Promise<AppRole>;
  logout: () => void;
  refreshRoleFromProfiles: () => Promise<AppRole | null>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function readInitialAuthSession(): StoredAuthSession | null {
  try {
    // 1. Check main auth session key
    const rawAuth = localStorage.getItem(AUTH_STORAGE_KEY);
    if (rawAuth) {
      const parsed = JSON.parse(rawAuth);
      if (parsed?.user?.uid && parsed?.token) {
        return parsed;
      }
    }
    // 2. Check seller session key if present
    const rawSeller = localStorage.getItem(SELLER_STORAGE_KEY);
    if (rawSeller) {
      const parsedSeller = JSON.parse(rawSeller);
      if (parsedSeller?.uid && parsedSeller?.token) {
        return {
          token: parsedSeller.token,
          user: {
            id: 0,
            uid: parsedSeller.uid,
            email: parsedSeller.email || `${parsedSeller.phone}@bharatorganic.in`,
            phone: parsedSeller.phone || '',
            fullName: parsedSeller.fullName || 'Organic Seller Partner',
            role: 'seller',
          },
        };
      }
    }
  } catch {
    // Ignore malformed storage
  }
  return null;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const initial = readInitialAuthSession();
  const [user, setUser] = useState<UserProfile | null>(initial?.user || null);
  const [authToken, setAuthToken] = useState<string>(initial?.token || '');
  const [loading, setLoading] = useState<boolean>(false);

  const role: AppRole | null = (user?.role as AppRole) || null;

  const persistSession = useCallback((nextUser: UserProfile | null, nextToken: string) => {
    try {
      if (!nextUser || !nextToken) {
        localStorage.removeItem(AUTH_STORAGE_KEY);
        localStorage.removeItem(SELLER_STORAGE_KEY);
        return;
      }
      localStorage.setItem(
        AUTH_STORAGE_KEY,
        JSON.stringify({ user: nextUser, token: nextToken })
      );
      if (nextUser.role === 'seller') {
        localStorage.setItem(
          SELLER_STORAGE_KEY,
          JSON.stringify({
            token: nextToken,
            uid: nextUser.uid,
            phone: nextUser.phone || '',
            email: nextUser.email || '',
            fullName: nextUser.fullName,
            role: 'seller',
          })
        );
      } else {
        // One account = one role: remove seller session if customer/admin logs in
        localStorage.removeItem(SELLER_STORAGE_KEY);
      }
    } catch {
      // Ignore storage write errors
    }
  }, []);

  const refreshRoleFromProfiles = useCallback(async (): Promise<AppRole | null> => {
    if (!user?.uid) return null;
    const fetchedRole = await fetchRoleFromProfilesTable(user.uid, authToken);
    if (fetchedRole && fetchedRole !== user.role) {
      const updatedUser: UserProfile = { ...user, role: fetchedRole };
      setUser(updatedUser);
      persistSession(updatedUser, authToken);
      return fetchedRole;
    }
    return (fetchedRole || user.role) as AppRole;
  }, [user, authToken, persistSession]);

  useEffect(() => {
    if (user?.uid && authToken) {
      refreshRoleFromProfiles();
    }
  }, [user?.uid, authToken, refreshRoleFromProfiles]);

  // Listen to storage events across tabs or SellerPortalApp updates
  useEffect(() => {
    const onStorageSync = () => {
      const synced = readInitialAuthSession();
      if (!synced) {
        setUser(null);
        setAuthToken('');
      } else if (
        synced.user.uid !== user?.uid ||
        synced.user.role !== user?.role ||
        synced.token !== authToken
      ) {
        setUser(synced.user);
        setAuthToken(synced.token);
      }
    };
    window.addEventListener('storage', onStorageSync);
    window.addEventListener('bharat-auth-changed', onStorageSync);
    return () => {
      window.removeEventListener('storage', onStorageSync);
      window.removeEventListener('bharat-auth-changed', onStorageSync);
    };
  }, [user?.uid, user?.role, authToken]);

  const login = useCallback(
    async (loggedInUser: UserProfile, token: string): Promise<AppRole> => {
      setLoading(true);
      try {
        await syncProfileToSupabaseTable({
          id: loggedInUser.uid,
          phone: loggedInUser.phone || undefined,
          email: loggedInUser.email,
          full_name: loggedInUser.fullName,
          role: loggedInUser.role,
        });
        const verifiedRole =
          (await fetchRoleFromProfilesTable(loggedInUser.uid, token)) || loggedInUser.role;
        const finalUser: UserProfile = {
          ...loggedInUser,
          role: verifiedRole,
        };
        setUser(finalUser);
        setAuthToken(token);
        persistSession(finalUser, token);
        window.dispatchEvent(new Event('bharat-auth-changed'));
        return verifiedRole;
      } finally {
        setLoading(false);
      }
    },
    [persistSession]
  );

  const logout = useCallback(() => {
    setUser(null);
    setAuthToken('');
    persistSession(null, '');
    window.dispatchEvent(new Event('bharat-auth-changed'));
  }, [persistSession]);

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        authToken,
        loading,
        login,
        logout,
        refreshRoleFromProfiles,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}

export { getRoleHomePath };
