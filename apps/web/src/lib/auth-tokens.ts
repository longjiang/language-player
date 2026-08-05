/**
 * Client-side mirror of the current session tokens.
 *
 * ApiClientProvider keeps this in sync whenever the NextAuth session changes
 * and after a successful token refresh, so raw `fetch` callsites (subscription
 * status, watch-history recorder, channel preferences) always read the latest
 * access token instead of a token captured in local state at mount time.
 */
let accessToken: string | null = null;
let refreshAccessToken: (() => Promise<string | null>) | null = null;

export function setAuthTokens(
  access: string | null,
  refreshAccess: (() => Promise<string | null>) | null,
): void {
  accessToken = access;
  refreshAccessToken = refreshAccess;
}

export function getAuthTokens(): {
  accessToken: string | null;
  refreshAccessToken: (() => Promise<string | null>) | null;
} {
  return { accessToken, refreshAccessToken };
}
