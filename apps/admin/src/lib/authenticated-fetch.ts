import { getAuthTokens, waitForAuthToken } from './auth-tokens';

type HeaderRecord = Record<string, string>;

function mergeHeaders(init: RequestInit | undefined, token: string | null): HeaderRecord {
  const base = (init?.headers as HeaderRecord | undefined) ?? {};
  return { ...base, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

/**
 * `fetch` wrapper for authenticated Flask admin calls. Attaches the current
 * Supabase access token and retries once after a refresh on 401.
 *
 * On a hard page load the token mirror is empty until `useSession()` resolves.
 * Rather than letting a mount effect send an unauthenticated request (which
 * Flask answers with 401), wait for the mirror to publish the token — or to
 * report that the session is unauthenticated.
 */
export async function authenticatedFetch(
  input: string,
  init?: RequestInit,
): Promise<Response> {
  let { accessToken, refreshAccessToken } = getAuthTokens();
  if (!accessToken) {
    accessToken = await waitForAuthToken();
    refreshAccessToken = getAuthTokens().refreshAccessToken;
  }

  let res = await fetch(input, { ...init, headers: mergeHeaders(init, accessToken) });

  if (res.status === 401 && accessToken && refreshAccessToken) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      res = await fetch(input, { ...init, headers: mergeHeaders(init, newToken) });
    }
  }

  return res;
}
