/**
 * BFF (backend-for-frontend) rules. Pure functions so they are unit-testable.
 *
 * Why a BFF: browser JavaScript never holds tokens. Access/refresh tokens live
 * in httpOnly, SameSite=Strict cookies set by these route handlers, and the
 * handlers forward requests to the API with the Authorization header.
 */
export const ACCESS_COOKIE = 'voxeli_at';
export const REFRESH_COOKIE = 'voxeli_rt';

/** Only these API paths may be reached through the BFF. Everything else is 404. */
const ALLOWED: readonly { method: string; pattern: RegExp }[] = [
  { method: 'POST', pattern: /^v1\/auth\/(register|login|refresh|logout)$/ },
  { method: 'GET', pattern: /^v1\/auth\/me$/ },
  { method: 'POST', pattern: /^v1\/translate$/ },
  { method: 'GET', pattern: /^v1\/translations$/ },
  { method: 'PATCH', pattern: /^v1\/translations\/[0-9a-f-]{36}$/ },
  { method: 'DELETE', pattern: /^v1\/translations(\/[0-9a-f-]{36})?$/ },
  { method: 'POST', pattern: /^v1\/realtime\/sessions(\/[0-9a-f-]{36}\/metrics)?$/ },
  { method: 'GET', pattern: /^v1\/flags$/ },
];

export function isAllowed(method: string, path: string): boolean {
  return ALLOWED.some((r) => r.method === method.toUpperCase() && r.pattern.test(path));
}

export function isAuthPath(path: string): 'login' | 'register' | 'refresh' | 'logout' | null {
  const m = /^v1\/auth\/(register|login|refresh|logout)$/.exec(path);
  return (m?.[1] as 'login' | 'register' | 'refresh' | 'logout' | undefined) ?? null;
}

/**
 * CSRF: cookies are SameSite=Strict, and for state-changing requests we also
 * require the Origin (or Referer) header to match our own host.
 */
export function originAllowed(
  method: string,
  origin: string | null,
  referer: string | null,
  host: string | null,
): boolean {
  if (method === 'GET' || method === 'HEAD') return true;
  if (!host) return false;
  const source = origin ?? referer;
  if (!source) return false;
  try {
    return new URL(source).host === host;
  } catch {
    return false;
  }
}

export interface CookieSpec {
  name: string;
  value: string;
  maxAgeSeconds: number;
}

export function authCookiesFrom(
  tokens: {
    accessToken: string;
    accessTokenExpiresAt: string;
    refreshToken: string;
    refreshTokenExpiresAt: string;
  },
  now = Date.now(),
): CookieSpec[] {
  const secs = (iso: string) => Math.max(0, Math.floor((new Date(iso).getTime() - now) / 1000));
  return [
    {
      name: ACCESS_COOKIE,
      value: tokens.accessToken,
      maxAgeSeconds: secs(tokens.accessTokenExpiresAt),
    },
    {
      name: REFRESH_COOKIE,
      value: tokens.refreshToken,
      maxAgeSeconds: secs(tokens.refreshTokenExpiresAt),
    },
  ];
}
