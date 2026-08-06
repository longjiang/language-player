'use client';

import { useRef, useMemo, useCallback } from 'react';
import { createApiClient } from '@langplayer/api-client';
import { useSession, signOut } from 'next-auth/react';
import { PYTHON_API_URL } from '@/lib/api-url';
import { logerr } from '@/lib/logger';
import { setAuthTokens } from '@/lib/auth-tokens';

/** Decode the JWT `exp` claim client-side (mirrors auth.ts's server-side helper). */
function tokenExpiry(token: string): number {
  try {
    const payload = token.split('.')[1]!;
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    const decoded = JSON.parse(atob(padded.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof decoded.exp === 'number' ? decoded.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

/**
 * Initializes the shared API client synchronously before any child component
 * mounts, avoiding the race condition where useSavedWords tries apiClient.get()
 * before the client exists.
 *
 * getAccessToken reads the latest session from a ref so we don't need to
 * re-create the client on every auth change.
 */
export function ApiClientProvider({ children }: { children: React.ReactNode }) {
  const { data: session, update } = useSession();
  const sessionRef = useRef(session);
  sessionRef.current = session; // always current
  // `update` is recreated whenever the session changes in next-auth v5 beta,
  // so route through a ref to keep the stable refresh callback current.
  const updateRef = useRef(update);
  updateRef.current = update;
  const refreshInFlight = useRef<Promise<string | null> | null>(null);

  /**
   * Single-flight refresh: concurrent callers (axios 401 interceptor and
   * authenticatedFetch) share one GoTrue refresh-token grant, because Supabase
   * refresh tokens rotate and a second concurrent grant with the same token
   * would 401.
   */
  const refreshAccessToken = useCallback((): Promise<string | null> => {
    refreshInFlight.current ??= (async (): Promise<string | null> => {
      const user = (sessionRef.current?.user as any) ?? null;
      const refreshToken = user?.refreshToken as string | undefined;
      if (!refreshToken) return null;

      try {
        const res = await fetch(`${PYTHON_API_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        if (res.status === 401 || res.status === 400) {
          // Refresh token is dead — GoTrue answers a rejected/rotated refresh
          // token with 400 invalid_grant (not 401), so treat both as a dead
          // session and clean-logout. Otherwise the app loops 401/400 forever.
          signOut({ redirect: false }).catch(() => {});
          return null;
        }
        if (!res.ok) return null;

        const data = await res.json();
        const newToken = data?.token as string | undefined;
        if (!newToken) return null;
        const newRefreshToken = (data?.refreshToken as string | undefined) ?? refreshToken;

        // Mirror the fresh pair immediately so getAccessToken and the raw
        // authenticatedFetch callsites use it before the session refetch lands.
        if (sessionRef.current?.user) {
          (sessionRef.current as any).user = {
            ...(sessionRef.current.user as any),
            accessToken: newToken,
            refreshToken: newRefreshToken,
          };
        }
        setAuthTokens(newToken, refreshAccessToken);

        // Persist the fresh pair into the NextAuth JWT (jwt callback handles
        // trigger === 'update') and wake useSession consumers (subscription,
        // profile, etc.) so they refetch with the new token.
        updateRef.current({
          accessToken: newToken,
          refreshToken: newRefreshToken,
          tokenExpiresAt: tokenExpiry(newToken),
        }).catch(() => {});
        return newToken;
      } catch {
        return null;
      }
    })().finally(() => {
      refreshInFlight.current = null;
    });
    return refreshInFlight.current;
  }, []);

  // Keep the module-level token mirror in sync with the session and register
  // the refresh function so raw fetches can trigger the same refresh path.
  //
  // This MUST run during render, not in a useEffect: React flushes child
  // effects before parent effects, so SubscriptionProvider (a child) fires its
  // authenticatedFetch('/user-subscription') on the session-loading render
  // BEFORE a parent useEffect here could populate the mirror — the request
  // then goes out with no Authorization header, Flask 401s with "Missing or
  // invalid Authorization header", and the child's effect never re-runs (its
  // [userId, token] deps don't change). Populating during render (parent body
  // runs before children) guarantees every child that effects on this commit
  // reads the current token.
  const sessionUser = (session?.user as any) ?? null;
  setAuthTokens(
    (sessionUser?.accessToken as string | undefined) ?? null,
    refreshAccessToken,
  );

  // Initialize synchronously (not in useEffect) — runs before child effects
  useMemo(() => {
    createApiClient({
      baseURL: PYTHON_API_URL,
      timeout: 15000,
      getAccessToken() {
        const token = (sessionRef.current?.user as any)?.accessToken as string | undefined;
        return Promise.resolve(token ?? null);
      },
      refreshAccessToken,
      onError(error) {
        logerr('[API]', error.code, error.message);
      },
    });
  }, [refreshAccessToken]); // effectively once; callback is stable

  return <>{children}</>;
}
