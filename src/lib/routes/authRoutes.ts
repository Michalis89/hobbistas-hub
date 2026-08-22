const LOGIN_REQUIRED_PREFIXES = [
  '/profile',
  '/backlog',
  '/support',
  '/admin',
  '/diary',
  '/onboarding',
];
const DASHBOARD_PATH = '/dashboard';
const ONBOARDING_PATH = '/onboarding';
const HOME_PATHS = ['/home', '/pages/home'];
const AUTH_ROUTES = [
  '/auth/login',
  '/auth/register',
  '/auth/reset-password',
  '/auth/confirm-email',
];

const matchesRoute = (route: string, pathname: string) =>
  pathname === route || pathname.startsWith(`${route}/`);

export const isProtectedRoute = (pathname: string) =>
  LOGIN_REQUIRED_PREFIXES.some(route => matchesRoute(route, pathname)) ||
  pathname === DASHBOARD_PATH;

export const isAuthRoute = (pathname: string) =>
  AUTH_ROUTES.some(route => matchesRoute(route, pathname));

export const shouldRedirectToLogin = (pathname: string) =>
  isProtectedRoute(pathname) && !isAuthRoute(pathname);

/**
 * Canonical query key for "where to go after signing in".
 * The auth forms read this key; anything that builds a login URL must use it,
 * otherwise the return destination is silently dropped.
 */
export const LOGIN_REDIRECT_PARAM = 'redirect';

export const getLoginUrl = (redirectTo?: string) =>
  redirectTo
    ? `/auth/login?${LOGIN_REDIRECT_PARAM}=${encodeURIComponent(redirectTo)}`
    : '/auth/login';

export { LOGIN_REQUIRED_PREFIXES, DASHBOARD_PATH, ONBOARDING_PATH, HOME_PATHS, AUTH_ROUTES };
