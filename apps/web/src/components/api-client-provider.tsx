'use client';

import { useRef, useMemo, useCallback, useEffect } from 'react';
import { createApiClient } from '@langplayer/api-client';
import { useSession, signOut } from 'next-auth/react';
import { PYTHON_API_URL } from '@/lib/api-url';
import { log, logwarn, logerr } from '@/lib/logger';
import { setAuthTokens } from '@/lib/auth-tokens';
import { clearUserData } from '@/lib/user-data-wipe';

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
  const { data: session, status, update } = useSession();
  const sessionRef = useRef(session);
  sessionRef.current = session; // always current
  // `update` is recreated whenever the session changes in next-auth v5 beta,
  // so route through a ref to keep the stable refresh callback current.
  const updateRef = useRef(update);
  updateRef.current = update;
  const refreshInFlight = useRef<Promise<string | null> | null>(null);
  // Only log a session-state change once per distinct state (status + user id
  // + token presence), so a state that stays broken doesn't spam the console.
  const lastSessionStateRef = useRef<string | null>(null);
  // Set when the session was authenticated but had no tokens; the 10s grace
  // period lets a session refetch land before we treat it as dead (the
  // saved-words hydration retry race — SPEC-062 / d923c49f).
  const tokenlessGraceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      if (!user) {
        logwarn('[API] refresh skipped — no session user', {
          hasSession: Boolean(sessionRef.current),
          userId: null,
        });
        return null;
      }
      if (!refreshToken) {
        logwarn('[API] refresh skipped — session has no refresh token', {
          hasAccessToken: Boolean(user?.accessToken),
          hasRefreshToken: false,
          userId: user?.id ?? null,
          userKeys: Object.keys(user ?? {}),
        });
        return null;
      }

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
          clearUserData();
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
  const sessionStateSig = `${status}:${sessionUser?.id ?? 'anon'}:${Boolean(sessionUser?.accessToken)}:${Boolean(sessionUser?.refreshToken)}`;
  if (lastSessionStateRef.current !== sessionStateSig) {
    lastSessionStateRef.current = sessionStateSig;
    const state = {
      status,
      hasAccessToken: Boolean(sessionUser?.accessToken),
      hasRefreshToken: Boolean(sessionUser?.refreshToken),
      userId: sessionUser?.id ?? null,
      userKeys: Object.keys(sessionUser ?? {}),
    };
    if (status === 'authenticated' && !sessionUser?.accessToken && !sessionUser?.refreshToken) {
      logwarn('[API] authenticated session without tokens', state);
    } else {
      log('[API] session state', state);
    }
  }
  setAuthTokens(
    (sessionUser?.accessToken as string | undefined) ?? null,
    refreshAccessToken,
  );

  // A JWT issued before the Supabase token claims were persisted (fe07cf02)
  // authenticates the user id but carries no access/refresh token: every
  // authenticated API call 401s with "Missing or invalid Authorization
  // header" and the refresh path can never recover. Sign out once after a
  // grace period so the app doesn't retry forever; the next login mints a
  // fresh JWT with the token claims.
  useEffect(() => {
    if (status !== 'authenticated') return;
    const user = (sessionRef.current?.user as any) ?? null;
    if (!user) return;
    if (user?.accessToken || user?.refreshToken) return;
    if (tokenlessGraceTimer.current) return;
    logwarn('[API] authenticated session without tokens — scheduling sign-out', {
      status,
      userId: user?.id ?? null,
      userKeys: Object.keys(user ?? {}),
    });
    tokenlessGraceTimer.current = setTimeout(() => {
      tokenlessGraceTimer.current = null;
      const current = (sessionRef.current?.user as any) ?? null;
      if (current?.accessToken || current?.refreshToken) {
        log('[API] tokenless session recovered before sign-out', {
          userId: current?.id ?? null,
        });
        return;
      }
      logwarn('[API] signing out — authenticated session still has no tokens', {
        userId: current?.id ?? null,
      });
      clearUserData();
      signOut({ redirect: false }).catch(() => {});
    }, 10_000);
    return () => {
      if (tokenlessGraceTimer.current) {
        clearTimeout(tokenlessGraceTimer.current);
        tokenlessGraceTimer.current = null;
      }
    };
  }, [status, sessionStateSig]);

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
