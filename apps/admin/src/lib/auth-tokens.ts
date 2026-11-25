/**
 * Client-side mirror of the current session tokens (same pattern as apps/web)
 * so raw `fetch` callsites always read the latest access token.
 *
 * `waitForAuthToken()` covers the hard-load race: the first render happens
 * before `useSession()` resolves, so a page effect that fires an admin request
 * on mount would otherwise send no `Authorization` header and get a 401. The
 * mirror sets the token (or null once the session is known to be
 * unauthenticated) and releases every waiter.
 */
let accessToken: string | null = null;
let refreshAccessToken: (() => Promise<string | null>) | null = null;
/** True once the mirror has published a state for the resolved session — a
 *  null token then means "signed out", not "still loading". */
let sessionKnown = false;
let waiters: Array<(token: string | null) => void> = [];

export function setAuthTokens(
  access: string | null,
  refreshAccess: (() => Promise<string | null>) | null,
): void {
  accessToken = access;
  refreshAccessToken = refreshAccess;
  sessionKnown = true;
  const pending = waiters;
  waiters = [];
  for (const resolve of pending) resolve(access);
}

export function getAuthTokens(): {
  accessToken: string | null;
  refreshAccessToken: (() => Promise<string | null>) | null;
} {
  return { accessToken, refreshAccessToken };
}

/**
 * Resolve with the access token as soon as the session mirror has one, or with
 * null once the session is known to be unauthenticated.
 *
 * The timeout is a safety net (the mirror always signals after loading); it
 * resolves with whatever is current rather than hanging a request forever.
 */
export function waitForAuthToken(timeoutMs = 8000): Promise<string | null> {
  if (accessToken) return Promise.resolve(accessToken);
  // The session is already resolved and there is no token: signed out.
  if (sessionKnown) return Promise.resolve(null);

  return new Promise((resolve) => {
    const onToken = (token: string | null) => {
      clearTimeout(timer);
      resolve(token);
    };
    const timer = setTimeout(() => {
      waiters = waiters.filter((waiter) => waiter !== onToken);
      resolve(accessToken);
    }, timeoutMs);
    waiters.push(onToken);
  });
}
