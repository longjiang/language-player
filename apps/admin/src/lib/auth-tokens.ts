/**
 * Client-side mirror of the current session tokens (same pattern as apps/web)
 * so raw `fetch` callsites always read the latest access token.
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
