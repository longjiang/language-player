import React, { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { createApiClient } from '@langplayer/api-client';
import { PYTHON_API_URL } from '@/lib/api-url';
import { isOfflineModeEnabled, setOfflineModeEnabled } from '@/lib/offline-mode';
import { getConnectivity } from '@/lib/connectivity';
// The app-wide logger, not `bootLogger`: the boot domain is off by default
// (`defaultOff('boot')` in lib/logger.ts), and these are exactly the lines that
// diagnose "the app logged me out while I was offline" from a device console.
import { log } from '@/lib/logger';

// ── API Client Singleton ────────────────────

let initialized = false;
let onTokenRefreshed: ((token: string) => void) | null = null;

/**
 * Why a refresh ended the way it did.
 *
 * The distinction matters at boot: a refresh that *failed* must not be read as
 * "this session is over". Only `rejected` means the server decided the stored
 * refresh token is no longer valid; `unreachable` means we could not ask
 * (offline, DNS, a 5xx, a truncated response) and the session has to survive —
 * otherwise starting the app offline logs the learner out, and they cannot log
 * back in while still offline (SPEC-053).
 */
type RefreshOutcome =
  | { status: 'refreshed'; token: string }
  | { status: 'rejected' }
  | { status: 'unreachable' };

let refreshPromise: Promise<RefreshOutcome> | null = null;

/** Decode the JWT `exp` claim (ms) for boot-time staleness checks. */
function tokenExpiresAt(token: string): number {
  try {
    const payload = token.split('.')[1]!;
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    const decoded = JSON.parse(atob(padded.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof decoded.exp === 'number' ? decoded.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

async function doRefreshAccessToken(): Promise<RefreshOutcome> {
  try {
    const refreshToken = await SecureStore.getItemAsync('authRefreshToken');
    if (!refreshToken) {
      // Nothing to refresh with: there is no session to preserve.
      log('[Auth] refresh — no stored refresh token; the session cannot be resumed');
      return { status: 'rejected' };
    }
    const res = await fetch(`${PYTHON_API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) {
      // 4xx is the server's verdict on this refresh token. Anything else (5xx,
      // a proxy error page) says nothing about the token, so it must not be
      // allowed to end the session.
      if (res.status >= 400 && res.status < 500) {
        log(`[Auth] refresh — server rejected the refresh token (${res.status}); the session is over`);
        return { status: 'rejected' };
      }
      log(`[Auth] refresh — inconclusive server response (${res.status}); keeping the session`);
      return { status: 'unreachable' };
    }
    const data = await res.json();
    if (!data?.token) {
      log('[Auth] refresh — 200 without a token in the body; keeping the session');
      return { status: 'unreachable' };
    }
    await SecureStore.setItemAsync('authToken', data.token);
    if (data.refreshToken) {
      await SecureStore.setItemAsync('authRefreshToken', data.refreshToken);
    }
    // Keep useAuth().token consumers (raw fetches, gating) on the fresh token.
    onTokenRefreshed?.(data.token);
    return { status: 'refreshed', token: data.token };
  } catch (e) {
    // The overwhelmingly common cause is "there is no network" — the one case
    // where wiping the session is the worst possible answer.
    log('[Auth] refresh — request failed (offline?):', (e as Error)?.message ?? e);
    return { status: 'unreachable' };
  }
}

/**
 * Single-flight refresh: concurrent callers (axios 401 interceptor,
 * authenticatedFetch, boot-time check) share one GoTrue refresh-token grant,
 * because Supabase refresh tokens rotate and a second concurrent grant with
 * the same token would 401.
 */
function refreshAccessTokenOutcome(): Promise<RefreshOutcome> {
  refreshPromise ??= doRefreshAccessToken().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

export async function refreshAccessToken(): Promise<string | null> {
  const outcome = await refreshAccessTokenOutcome();
  return outcome.status === 'refreshed' ? outcome.token : null;
}

export function initApiClient() {
  if (initialized) return;
  initialized = true;

  createApiClient({
    baseURL: PYTHON_API_URL,
    getAccessToken: () => SecureStore.getItemAsync('authToken'),
    refreshAccessToken,
  });
}

// ── Auth Context ────────────────────────────

interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
}

interface AuthContextValue {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, firstName?: string, lastName?: string) => Promise<User>;
  applySession: (token: string, refreshToken: string | null, user: User) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}

// ── Flask Auth Helpers ──────────────────────

async function flaskAuthLogin(email: string, password: string): Promise<{ token: string; refreshToken: string | null; user: User }> {
  const res = await fetch(`${PYTHON_API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const message = err?.errors?.[0]?.message || '';
    const error = new Error(message) as Error & { code?: string };
    error.code = err?.errors?.[0]?.code;
    throw error;
  }
  const json = await res.json();
  return {
    token: json.token,
    refreshToken: json.refreshToken ?? null,
    user: json.user,
  };
}

async function flaskAuthRegister(email: string, password: string, firstName?: string, lastName?: string): Promise<User> {
  const res = await fetch(`${PYTHON_API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, firstName, lastName }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.errors?.[0]?.message || '');
  }
  const json = await res.json();
  return json.user;
}

// ── Provider ────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const bootFinishedRef = useRef(false);

  // API client must be initialized synchronously — useEffect runs after
  // the first render, but child components (like WatchScreen) may call
  // apiClient.get() during their first render. initApiClient() is
  // idempotent (module-level `initialized` flag).
  initApiClient();

  // Restore session on mount
  useEffect(() => {
    (async () => {
      try {
        const storedToken = await SecureStore.getItemAsync('authToken');
        const storedUser = await SecureStore.getItemAsync('userInfo');
        if (storedToken && storedUser) {
          setToken(storedToken);
          setUser(JSON.parse(storedUser));
          // Boot-time staleness check (mirrors Classic's auth-guard.js): if the
          // stored access token already expired, refresh before the first batch
          // of requests fires. Only a refresh the SERVER rejects ends the
          // session — an unreachable server (offline start) keeps it, so the
          // learner is not logged out for being offline (SPEC-053).
          const expiresAt = tokenExpiresAt(storedToken);
          if (expiresAt > 0 && expiresAt <= Date.now()) {
            if (isOfflineModeEnabled() || getConnectivity() === 'offline') {
              // Offline Mode blocks the request, and an auto-detected offline
              // start has no request to make, so skip the refresh and keep the
              // local session until the user goes back online. The next API call
              // after that is what triggers the normal refresh path.
              log('[Auth] boot — access token expired and we are offline; keeping the stored session and deferring the refresh', {
                offlineMode: isOfflineModeEnabled(),
                connectivity: getConnectivity(),
              });
            } else {
              log('[Auth] boot — access token expired; refreshing');
              const outcome = await refreshAccessTokenOutcome();
              if (outcome.status === 'refreshed') {
                log('[Auth] boot — access token refreshed');
              } else if (outcome.status === 'rejected') {
                log('[Auth] boot — refresh token rejected; clearing the stored session');
                await SecureStore.deleteItemAsync('authToken');
                await SecureStore.deleteItemAsync('authRefreshToken');
                await SecureStore.deleteItemAsync('userInfo');
                setToken(null);
                setUser(null);
                // No session → Offline Mode must not block auth screens.
                await setOfflineModeEnabled(false);
              } else {
                log('[Auth] boot — could not reach the server to refresh; keeping the stored session');
              }
            }
          } else {
            log('[Auth] boot — stored access token is still valid; no refresh needed');
          }
        } else {
          log('[Auth] boot — no stored session');
          // Offline Mode is only allowed while a session exists.
          await setOfflineModeEnabled(false);
        }
      } catch { /* ignore */ }
      setLoading(false);
      bootFinishedRef.current = true;
    })();
  }, []);

  // Invariant: Offline Mode can only be ON while a token is present. If the
  // session is ever cleared outside logout (expiry, API failure, manual
  // reset), force the gate off so login/register/forgot-password work.
  useEffect(() => {
    if (!bootFinishedRef.current) return;
    if (!token) {
      void setOfflineModeEnabled(false).catch(() => {});
    }
  }, [token]);

  // Keep the context token in sync whenever the apiClient refreshes it.
  useEffect(() => {
    onTokenRefreshed = (newToken) => setToken(newToken);
    return () => { onTokenRefreshed = null; };
  }, []);

  const applySession = useCallback(async (token: string, refreshToken: string | null, user: User) => {
    await SecureStore.setItemAsync('authToken', token);
    if (refreshToken) await SecureStore.setItemAsync('authRefreshToken', refreshToken);
    await SecureStore.setItemAsync('userInfo', JSON.stringify(user));
    setToken(token);
    setUser(user);
    initApiClient();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { token, refreshToken, user } = await flaskAuthLogin(email, password);
    await applySession(token, refreshToken, user);
  }, [applySession]);

  const register = useCallback(async (email: string, password: string, firstName?: string, lastName?: string) => {
    // GoTrue requires email confirmation before login (mailer_autoconfirm=false).
    // The caller routes the user to the verification screen.
    return await flaskAuthRegister(email, password, firstName, lastName);
  }, []);

  const logout = useCallback(async () => {
    await SecureStore.deleteItemAsync('authToken');
    await SecureStore.deleteItemAsync('authRefreshToken');
    await SecureStore.deleteItemAsync('userInfo');
    setToken(null);
    setUser(null);
    // Remove the previous user's local data (notes, saved words, progress,
    // SRS, settings, recents, sync db). Offline dictionaries/tokenizers and
    // the device-local Offline Mode toggle stay.
    // Dynamic import avoids a module cycle (sync-engine → authenticated-fetch
    // → AuthContext).
    const { wipeUserData } = await import('@/lib/user-data-wipe');
    await wipeUserData().catch((e) => {
      log('[Auth] logout wipe failed:', (e as Error)?.message ?? e);
    });
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, applySession, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
