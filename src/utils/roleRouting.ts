export type AppRole = 'customer' | 'seller' | 'admin';

/**
 * Returns the canonical home path for a given role.
 * - customer -> '/'
 * - seller -> '/seller/dashboard'
 * - admin -> '/admin'
 */
export function getRoleHomePath(role: AppRole | null | undefined): string {
  if (role === 'seller') return '/seller/dashboard';
  if (role === 'admin') return '/admin';
  return '/';
}

/**
 * Classifies any pathname into its target portal zone:
 * - 'seller_auth': '/seller'
 * - 'seller_protected': '/seller/dashboard', '/seller/products/new', '/seller/*'
 * - 'admin': '/admin', '/admin/*'
 * - 'buyer_protected': '/cart', '/checkout', '/orders'
 * - 'buyer_public': '/', '/category/*', '/search', etc.
 */
export function classifyPathname(pathname: string): {
  zone: 'seller_auth' | 'seller_protected' | 'admin' | 'buyer_protected' | 'buyer_public';
  allowedRoles: AppRole[];
} {
  const clean = (pathname || '/').trim().toLowerCase().replace(/\/+$/, '') || '/';

  if (clean === '/seller') {
    return { zone: 'seller_auth', allowedRoles: ['seller'] };
  }
  if (clean.startsWith('/seller/')) {
    return { zone: 'seller_protected', allowedRoles: ['seller'] };
  }
  if (clean === '/admin' || clean.startsWith('/admin/')) {
    return { zone: 'admin', allowedRoles: ['admin'] };
  }
  if (clean === '/cart' || clean === '/checkout' || clean === '/orders') {
    return { zone: 'buyer_protected', allowedRoles: ['customer'] };
  }
  return { zone: 'buyer_public', allowedRoles: ['customer'] };
}

/**
 * Resolves whether the current user (or logged-out visitor) is allowed on `pathname`,
 * or if they must be redirected to their role's home path.
 */
export function resolveRouteGuardRedirect(params: {
  pathname: string;
  role: AppRole | null;
  allowedRoles?: AppRole[];
  allowSellerOnboardingAtRootSeller?: boolean;
}): {
  allowed: boolean;
  redirectTo: string | null;
  reason?: string;
} {
  const { pathname, role, allowedRoles, allowSellerOnboardingAtRootSeller } = params;
  const classified = classifyPathname(pathname);
  const effectiveAllowedRoles = allowedRoles || classified.allowedRoles;

  // 1. Logged-in user: strict role separation
  if (role) {
    // Special case: Seller on '/seller' -> redirect to '/seller/dashboard' unless explicitly editing onboarding
    if (role === 'seller' && classified.zone === 'seller_auth' && !allowSellerOnboardingAtRootSeller) {
      return {
        allowed: false,
        redirectTo: '/seller/dashboard',
        reason: 'Logged-in seller is directed straight to /seller/dashboard',
      };
    }

    if (!effectiveAllowedRoles.includes(role)) {
      return {
        allowed: false,
        redirectTo: getRoleHomePath(role),
        reason: `Role '${role}' is not permitted on ${pathname}`,
      };
    }

    return { allowed: true, redirectTo: null };
  }

  // 2. Logged-out visitor (role === null)
  // Logged-out users can visit '/' (landing page + login), '/seller' (seller signup/login), or '/admin' (admin login),
  // but cannot access protected sub-routes like '/seller/dashboard', '/seller/products/new', '/cart', '/checkout', '/orders'.
  if (classified.zone === 'seller_protected') {
    return {
      allowed: false,
      redirectTo: '/seller',
      reason: 'Logged-out user must sign in at /seller first',
    };
  }

  if (classified.zone === 'buyer_protected') {
    return {
      allowed: false,
      redirectTo: '/',
      reason: 'Logged-out user must sign in on landing page before viewing cart/checkout/orders',
    };
  }

  return { allowed: true, redirectTo: null };
}

/**
 * Validates that a single mobile number is bound to only one role ('customer' | 'seller' | 'admin').
 * A customer mobile number cannot be used for seller signup/login, and a seller mobile number
 * cannot be used for customer signup/login.
 */
export function validateSingleRolePerMobile(params: {
  phone: string;
  existingRole: AppRole | null | undefined;
  requestedRole: AppRole;
}): { valid: boolean; error?: string } {
  const { phone, existingRole, requestedRole } = params;
  if (!existingRole) {
    return { valid: true };
  }
  if (existingRole !== requestedRole) {
    if (existingRole === 'seller' && requestedRole === 'customer') {
      return {
        valid: false,
        error: `Mobile number +91 ${phone} is registered as a Seller account. One mobile number can hold only one role.`,
      };
    }
    if (existingRole === 'customer' && requestedRole === 'seller') {
      return {
        valid: false,
        error: `Mobile number +91 ${phone} is already registered as a Customer account. One mobile number cannot be both Customer and Seller. Please use a separate mobile number for Seller signup.`,
      };
    }
    return {
      valid: false,
      error: `Mobile number +91 ${phone} is already registered with role '${existingRole}'. One account can have only one role.`,
    };
  }
  return { valid: true };
}

/**
 * Returns the logo click destination based on the active user's role.
 */
export function getLogoClickTarget(role: AppRole | null | undefined): string {
  return getRoleHomePath(role);
}
