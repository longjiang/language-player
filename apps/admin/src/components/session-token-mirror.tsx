'use client';

import { useCallback, useRef } from 'react';
import { signOut, useSession } from 'next-auth/react';
import { PYTHON_API_URL } from '@/lib/api-url';
import { setAuthTokens } from '@/lib/auth-tokens';

/** Decode the JWT `exp` claim client-side (mirrors auth.ts's server helper). */
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
 * Keeps the module-level token mirror (`lib/auth-tokens.ts`) in sync with the
 * NextAuth session so `authenticatedFetch` attaches the Supabase access token
 * to every Flask admin call. This mirrors the web app's ApiClientProvider
 * token handling (single-flight refresh, NextAuth `update()` persistence).
 *
 * The mirror is populated during render — not in an effect — so child
 * components that fire authenticated requests on the session-loading render
 * already read the current token.
 */
export function SessionTokenMirror() {
  const { data: session, update } = useSession();
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const updateRef = useRef(update);
  updateRef.current = update;
  const refreshInFlight = useRef<Promise<string | null> | null>(null);

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
          // Refresh token is dead — clean-logout instead of looping 401/400.
          signOut({ redirect: false }).catch(() => {});
          return null;
        }
        if (!res.ok) return null;

        const data = await res.json();
        const newToken = data?.token as string | undefined;
        if (!newToken) return null;
        const newRefreshToken = (data?.refreshToken as string | undefined) ?? refreshToken;

        // Mirror the fresh pair immediately so in-flight callsites use it
        // before the NextAuth session refetch lands.
        if (sessionRef.current?.user) {
          (sessionRef.current as any).user = {
            ...(sessionRef.current.user as any),
            accessToken: newToken,
            refreshToken: newRefreshToken,
          };
        }
        setAuthTokens(newToken, refreshAccessToken);

        // Persist the rotated pair into the NextAuth JWT.
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

  const sessionUser = (session?.user as any) ?? null;
  setAuthTokens(
    (sessionUser?.accessToken as string | undefined) ?? null,
    refreshAccessToken,
  );

  return null;
}
