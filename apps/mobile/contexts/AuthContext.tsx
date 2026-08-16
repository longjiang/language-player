import React, { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { createApiClient } from '@langplayer/api-client';
import { PYTHON_API_URL } from '@/lib/api-url';
import { isOfflineModeEnabled, setOfflineModeEnabled } from '@/lib/offline-mode';
import { bootLogger } from '@/lib/logger';

const { log } = bootLogger;

// ── API Client Singleton ────────────────────

let initialized = false;
let onTokenRefreshed: ((token: string) => void) | null = null;
let refreshPromise: Promise<string | null> | null = null;

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

async function doRefreshAccessToken(): Promise<string | null> {
  try {
    const refreshToken = await SecureStore.getItemAsync('authRefreshToken');
    if (!refreshToken) return null;
    const res = await fetch(`${PYTHON_API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.token) return null;
    await SecureStore.setItemAsync('authToken', data.token);
    if (data.refreshToken) {
      await SecureStore.setItemAsync('authRefreshToken', data.refreshToken);
    }
    // Keep useAuth().token consumers (raw fetches, gating) on the fresh token.
    onTokenRefreshed?.(data.token);
    return data.token;
  } catch {
    return null;
  }
}

/**
 * Single-flight refresh: concurrent callers (axios 401 interceptor,
 * authenticatedFetch, boot-time check) share one GoTrue refresh-token grant,
 * because Supabase refresh tokens rotate and a second concurrent grant with
 * the same token would 401.
 */
export function refreshAccessToken(): Promise<string | null> {
  refreshPromise ??= doRefreshAccessToken().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
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
          // of requests fires; a dead refresh token means a clean logout.
          const expiresAt = tokenExpiresAt(storedToken);
          if (expiresAt > 0 && expiresAt <= Date.now()) {
            if (isOfflineModeEnabled()) {
              // Offline Mode blocks the refresh request, so skip it and keep
              // the local session until the user goes back online.
              log('[Auth] boot — access token expired but Offline Mode is on; skipping refresh');
            } else {
              log('[Auth] boot — access token expired; refreshing');
              const newToken = await refreshAccessToken();
              if (!newToken) {
                await SecureStore.deleteItemAsync('authToken');
                await SecureStore.deleteItemAsync('authRefreshToken');
                await SecureStore.deleteItemAsync('userInfo');
                setToken(null);
                setUser(null);
                // No session → Offline Mode must not block auth screens.
                await setOfflineModeEnabled(false);
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
