import * as SecureStore from 'expo-secure-store';
import { refreshAccessToken } from '@/contexts/AuthContext';

type HeaderRecord = Record<string, string>;

function mergeHeaders(init: RequestInit | undefined, token: string | null): HeaderRecord {
  const base = (init?.headers as HeaderRecord | undefined) ?? {};
  return { ...base, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

/**
 * `fetch` wrapper for authenticated Flask calls that bypass the shared
 * apiClient. Reads the access token fresh from SecureStore each time, and on
 * a 401 triggers the same refresh path the axios interceptor uses, then
 * retries once. Mirrors Classic's `$axios` refresh behavior.
 */
export async function authenticatedFetch(
  input: string,
  init?: RequestInit,
): Promise<Response> {
  const token = await SecureStore.getItemAsync('authToken');
  let res = await fetch(input, { ...init, headers: mergeHeaders(init, token) });

  if (res.status === 401 && token) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      res = await fetch(input, { ...init, headers: mergeHeaders(init, newToken) });
    }
  }

  return res;
}
