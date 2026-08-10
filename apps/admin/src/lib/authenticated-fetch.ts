import { getAuthTokens } from './auth-tokens';

type HeaderRecord = Record<string, string>;

function mergeHeaders(init: RequestInit | undefined, token: string | null): HeaderRecord {
  const base = (init?.headers as HeaderRecord | undefined) ?? {};
  return { ...base, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

/**
 * `fetch` wrapper for authenticated Flask admin calls. Attaches the current
 * Supabase access token and retries once after a refresh on 401.
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
