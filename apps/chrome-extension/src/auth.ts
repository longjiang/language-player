/**
 * Authentication helper for the Language Player extension.
 *
 * Authenticates through the Flask API, which proxies Supabase Auth (GoTrue)
 * per ADR-0023 / SPEC-039. Access tokens are Supabase JWTs; refresh tokens
 * are rotated through POST /auth/refresh. The auth state is stored in
 * chrome.storage.local and used as the Bearer token for every authenticated
 * Flask call (saved words, subscription, etc.).
 */

const API_BASE = 'https://pythonvps.zerotohero.ca';
const STORAGE_KEY = 'lpv_auth';

export interface AuthState {
  token: string;
  /** GoTrue refresh token — used to mint a new access token on expiry. */
  refreshToken?: string;
  email: string;
  userId: string;
  expires: number; // unix ms
}

interface LoginResponse {
  token?: string;
  refreshToken?: string | null;
  user?: {
    id?: string | number;
    email?: string;
  };
}

/** Decode a JWT payload (safe: no signature verification needed client-side). */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function toAuthState(
  data: LoginResponse,
  emailFallback: string,
  previous?: AuthState,
): AuthState {
  const token = data.token || '';
  if (!token) throw new Error('No token in response');
  const payload = decodeJwtPayload(token) || {};
  const user = data.user || {};
  return {
    token,
    refreshToken: data.refreshToken || previous?.refreshToken,
    email: user.email || previous?.email || emailFallback,
    userId: String(user.id ?? payload.sub ?? previous?.userId ?? ''),
    expires: (typeof payload.exp === 'number' ? payload.exp : 0) * 1000,
  };
}

async function errorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    if (body && typeof body === 'object') {
      const data = body as { errors?: Array<{ message?: string }>; message?: string };
      return data.errors?.[0]?.message || data.message || fallback;
    }
  } catch {
    // ignore parse errors
  }
  return fallback;
}

async function storeAuth(auth: AuthState): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: auth });
}

/** Login through Flask → Supabase Auth (GoTrue). Returns the auth state. */
export async function login(email: string, password: string): Promise<AuthState> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    throw new Error(await errorMessage(res, `Login failed (${res.status})`));
  }

  const data = (await res.json()) as LoginResponse;
  const authState = toAuthState(data, email);
  await storeAuth(authState);
  return authState;
}

/** Refresh the access token via Flask → GoTrue, rotating the refresh token. */
export async function refreshAuth(auth: AuthState): Promise<AuthState> {
  if (!auth.refreshToken) throw new Error('No refresh token');
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: auth.refreshToken }),
  });
  if (!res.ok) {
    throw new Error(await errorMessage(res, `Refresh failed (${res.status})`));
  }
  const data = (await res.json()) as LoginResponse;
  const next = toAuthState(data, auth.email, auth);
  await storeAuth(next);
  return next;
}

/** Retrieve stored auth state, refreshing transparently when nearly expired. */
export async function getAuthState(): Promise<AuthState | null> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const auth: AuthState | undefined = stored[STORAGE_KEY];
  if (!auth) return null;

  // Check expiry (with 5-minute buffer)
  if (auth.expires && auth.expires < Date.now() + 5 * 60 * 1000) {
    try {
      return await refreshAuth(auth);
    } catch {
      await logout();
      return null;
    }
  }

  return auth;
}

/** Fetch with the stored Supabase JWT, refreshing once on 401. Returns null
 *  when the user is not authenticated (or refresh failed). */
export async function authorizedFetch(
  url: string,
  init: RequestInit = {},
): Promise<Response | null> {
  let auth = await getAuthState();
  if (!auth) return null;

  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${auth.token}`);
  let res = await fetch(url, { ...init, headers });

  if (res.status === 401 && auth.refreshToken) {
    try {
      auth = await refreshAuth(auth);
      headers.set('Authorization', `Bearer ${auth.token}`);
      res = await fetch(url, { ...init, headers });
    } catch {
      await logout();
      return null;
    }
  }

  return res;
}

/** Clear stored auth state (best-effort server-side logout first). */
export async function logout(): Promise<void> {
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const auth: AuthState | undefined = stored[STORAGE_KEY];
    if (auth?.token || auth?.refreshToken) {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth.token}`,
        },
        body: JSON.stringify({ refreshToken: auth.refreshToken }),
      }).catch(() => {});
    }
  } catch {
    // Logout is best-effort; local state is cleared regardless.
  }
  await chrome.storage.local.remove(STORAGE_KEY);
}
