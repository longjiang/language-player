'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { logwarn } from '@/lib/logger';

/**
 * Picks up Supabase redirect sessions that arrive as URL hash fragments.
 * The default `{{ .ConfirmationURL }}` email link verifies the token on
 * Supabase's side and then redirects to the site root with
 * `#access_token=...&refresh_token=...`. Exchange it through NextAuth and
 * route the user to the post-verification page.
 */
export default function SupabaseSessionHandler() {
  const router = useRouter();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    // /auth/confirm handles its own token_hash / hash-fragment logic.
    if (window.location.pathname.startsWith('/auth/confirm')) return;

    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const accessToken = hash.get('access_token');
    const refreshToken = hash.get('refresh_token');
    if (!accessToken && !refreshToken) return;

    const type = hash.get('type');

    // Drop the fragment so it doesn't linger or get re-processed.
    window.history.replaceState({}, '', window.location.pathname + window.location.search);

    // Password-recovery links (type=recovery) are handled by the password-reset
    // page: Flask /auth/password-reset consumes the recovery JWT directly, so we
    // do NOT log the user in through NextAuth here (that would create a normal
    // auth session instead of a password-change flow).
    if (type === 'recovery' && accessToken) {
      router.replace(`/password-reset?token=${encodeURIComponent(accessToken)}`);
      return;
    }

    (async () => {
      try {
        const credentials: Record<string, string> = {};
        if (accessToken) credentials.accessToken = accessToken;
        if (refreshToken) credentials.refreshToken = refreshToken;
        const result = await signIn('link-token', { ...credentials, redirect: false });
        if (result?.ok) {
          router.replace('/auth/verified');
          router.refresh();
        } else {
          logwarn(
            `[LP Web] Supabase session exchange failed: error=${result?.error ?? ''} code=${result?.code ?? ''}`
          );
          router.replace('/auth/confirm');
        }
      } catch {
        logwarn('[LP Web] Supabase session exchange error');
        router.replace('/auth/confirm');
      }
    })();
  }, [router]);

  return null;
}
