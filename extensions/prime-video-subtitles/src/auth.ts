/**
 * Authentication helper for the Prime Video Subtitle extension.
 *
 * Authenticates against the Directus headless CMS and stores the token
 * in chrome.storage.local. The Python API then uses this token to
 * authorize /user-data and /user-data/sync requests.
 */

const DIRECTUS_URL = 'https://directusvps.zerotohero.ca/zerotohero';
const STORAGE_KEY = 'lpv_auth';

export interface AuthState {
  token: string;
  email: string;
  userId: string;
  expires: number; // unix ms
}

/** Login with Directus credentials. Returns the auth state on success. */
export async function login(email: string, password: string): Promise<AuthState> {
  const res = await fetch(`${DIRECTUS_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.errors?.[0]?.message || `Login failed (${res.status})`);
  }

  const data = await res.json();
  const token = data.data?.access_token;
  if (!token) throw new Error('No access token in response');

  // Decode JWT to get user ID and expiry
  const payload = JSON.parse(atob(token.split('.')[1]));
  const userId = String(payload.id);
  const expires = (payload.exp || 0) * 1000;

  const authState: AuthState = { token, email, userId, expires };
  await chrome.storage.local.set({ [STORAGE_KEY]: authState });
  return authState;
}

/** Retrieve stored auth state. Returns null if not logged in or expired. */
export async function getAuthState(): Promise<AuthState | null> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const auth: AuthState | undefined = stored[STORAGE_KEY];
  if (!auth) return null;

  // Check expiry (with 5-minute buffer)
  if (auth.expires && auth.expires < Date.now() + 5 * 60 * 1000) {
    await logout();
    return null;
  }

  return auth;
}

/** Clear stored auth state. */
export async function logout(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEY);
}
