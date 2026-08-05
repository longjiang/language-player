import React, { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { createApiClient } from '@langplayer/api-client';
import { PYTHON_API_URL } from '@/lib/api-url';

// ── API Client Singleton ────────────────────

let initialized = false;

async function refreshAccessToken(): Promise<string | null> {
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
    return data.token;
  } catch {
    return null;
  }
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
        }
      } catch { /* ignore */ }
      setLoading(false);
    })();
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
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, applySession, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
