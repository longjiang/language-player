import { getAuthTokens } from './auth-tokens';

type HeaderRecord = Record<string, string>;

function mergeHeaders(init: RequestInit | undefined, token: string | null): HeaderRecord {
  const base = (init?.headers as HeaderRecord | undefined) ?? {};
  return { ...base, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

/**
 * `fetch` wrapper for authenticated Flask calls that bypass the shared
 * apiClient. Attaches the current access token from the session mirror and,
 * on a 401, triggers the same refresh path the axios interceptor uses and
 * retries once. Mirrors Classic's `$axios` refresh behavior.
 */
export async function authenticatedFetch(
  input: string,
  init?: RequestInit,
): Promise<Response> {
  const { accessToken, refreshAccessToken } = getAuthTokens();
  let res = await fetch(input, { ...init, headers: mergeHeaders(init, accessToken) });

  if (res.status === 401 && accessToken && refreshAccessToken) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      res = await fetch(input, { ...init, headers: mergeHeaders(init, newToken) });
    }
  }

  return res;
}
