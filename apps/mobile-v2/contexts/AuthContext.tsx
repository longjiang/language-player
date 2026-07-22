import React, { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { createApiClient } from '@langplayer/api-client';
import { PYTHON_API_URL, DIRECTUS_URL } from '@/lib/api-url';

// ── API Client Singleton ────────────────────

let initialized = false;

export function initApiClient() {
  if (initialized) return;
  initialized = true;

  createApiClient({
    baseURL: PYTHON_API_URL,
    getAccessToken: () => SecureStore.getItemAsync('authToken'),
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
  register: (email: string, password: string, firstName?: string, lastName?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}

// ── Directus Auth Helpers ───────────────────

async function directusAuth(email: string, password: string): Promise<{ token: string; user: User }> {
  const res = await fetch(`${DIRECTUS_URL}/auth/authenticate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.errors?.[0]?.message || 'auth.error.login');
  }
  const { data } = await res.json();
  return {
    token: data.token,
    user: { id: data.user.id, email: data.user.email, firstName: data.user.first_name, lastName: data.user.last_name },
  };
}

async function directusRegister(email: string, password: string, firstName?: string, lastName?: string): Promise<User> {
  const res = await fetch(`${DIRECTUS_URL}/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, first_name: firstName, last_name: lastName, role: '2', status: 'active' }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.errors?.[0]?.message || 'auth.error.register');
  }
  const { data } = await res.json();
  return { id: data.id, email: data.email, firstName: data.first_name, lastName: data.last_name };
}

// ── Provider ────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore session on mount
  useEffect(() => {
    (async () => {
      try {
        const storedToken = await SecureStore.getItemAsync('authToken');
        const storedUser = await SecureStore.getItemAsync('userInfo');
        if (storedToken && storedUser) {
          setToken(storedToken);
          setUser(JSON.parse(storedUser));
          // Initialize API client with restored token
          initApiClient();
        }
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { token, user } = await directusAuth(email, password);
    await SecureStore.setItemAsync('authToken', token);
    await SecureStore.setItemAsync('userInfo', JSON.stringify(user));
    setToken(token);
    setUser(user);
    initApiClient();
  }, []);

  const register = useCallback(async (email: string, password: string, firstName?: string, lastName?: string) => {
    const user = await directusRegister(email, password, firstName, lastName);
    // After registration, log in to get token
    const auth = await directusAuth(email, password);
    await SecureStore.setItemAsync('authToken', auth.token);
    await SecureStore.setItemAsync('userInfo', JSON.stringify(user));
    setToken(auth.token);
    setUser(user);
    initApiClient();
  }, []);

  const logout = useCallback(async () => {
    await SecureStore.deleteItemAsync('authToken');
    await SecureStore.deleteItemAsync('userInfo');
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
