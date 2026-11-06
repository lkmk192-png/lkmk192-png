import React, { useEffect } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import {
  AppRole,
  getRoleHomePath,
  resolveRouteGuardRedirect,
} from '../utils/roleRouting.ts';

interface ProtectedRouteProps {
  allowedRoles: AppRole[];
  pathname?: string;
  onRedirect?: (targetPath: string) => void;
  allowLoggedOut?: boolean;
  allowGuest?: boolean;
  allowSellerOnboardingAtRootSeller?: boolean;
  children: React.ReactNode;
}

/**
 * Route Guard Component:
 * Accepts `allowedRoles: ('customer' | 'seller' | 'admin')[]`.
 * If the user's role does not match `allowedRoles`, immediately redirects to their role's home:
 *   - customer -> '/'
 *   - seller   -> '/seller/dashboard'
 *   - admin    -> '/admin'
 * When redirecting, renders `null` so forbidden UI never mounts in the DOM.
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  allowedRoles,
  pathname,
  onRedirect,
  allowLoggedOut,
  allowGuest,
  allowSellerOnboardingAtRootSeller = true,
  children,
}) => {
  const { role } = useAuth();
  const currentPathname =
    pathname || (typeof window !== 'undefined' ? window.location.pathname : '/');
  const isGuestPermitted = Boolean(allowLoggedOut ?? allowGuest ?? false);

  const decision = resolveRouteGuardRedirect({
    pathname: currentPathname,
    role,
    allowedRoles,
    allowSellerOnboardingAtRootSeller,
  });

  const mustRedirectLoggedOut = !role && !isGuestPermitted && !decision.allowed;
  const mustRedirectWrongRole = Boolean(role && !decision.allowed);

  useEffect(() => {
    if ((mustRedirectWrongRole || mustRedirectLoggedOut) && decision.redirectTo) {
      if (typeof window !== 'undefined' && window.location.pathname !== decision.redirectTo) {
        window.history.replaceState({}, '', decision.redirectTo);
      }
      onRedirect?.(decision.redirectTo);
    } else if (!role && !isGuestPermitted && !decision.redirectTo) {
      if (typeof window !== 'undefined' && window.location.pathname !== '/') {
        window.history.replaceState({}, '', '/');
      }
      onRedirect?.('/');
    }
  }, [
    role,
    isGuestPermitted,
    mustRedirectWrongRole,
    mustRedirectLoggedOut,
    decision.redirectTo,
    onRedirect,
  ]);

  if (mustRedirectWrongRole || mustRedirectLoggedOut || (!role && !isGuestPermitted)) {
    return null;
  }

  // Extra safety check: if user is logged in and their role is not in allowedRoles, render null
  if (role && !allowedRoles.includes(role)) {
    return null;
  }

  return <>{children}</>;
};

export { getRoleHomePath };

