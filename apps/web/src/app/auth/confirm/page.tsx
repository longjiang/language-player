'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { useT } from '@/hooks/use-t';
import { buttonVariants } from '@/components/ui/button';
import { AlertCircle, Loader2 } from 'lucide-react';

export default function ConfirmEmailPage() {
  const router = useRouter();
  const t = useT();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const queryToken = query.get('token') ?? '';
    const hashToken = hash.get('token') ?? '';
    const token = queryToken || hashToken || undefined;
    const tokenHash = query.get('token_hash') ?? hash.get('token_hash') ?? undefined;
    const email = query.get('email') ?? hash.get('email');
    // Supabase sometimes puts the verification JWT in ?token=. Treat a JWT
    // as an access token so we can exchange it for a full session.
    const looksLikeJwt = (value: string) => value.split('.').length === 3;
    const jwtFromToken = looksLikeJwt(queryToken) ? queryToken : looksLikeJwt(hashToken) ? hashToken : undefined;
    const accessToken = hash.get('access_token') ?? query.get('access_token') ?? jwtFromToken;
    const refreshToken = hash.get('refresh_token') ?? query.get('refresh_token');

    if (!tokenHash && !accessToken && !refreshToken) {
      setBusy(false);
      setError(t('error.invalid_verification_link'));
      return;
    }

    (async () => {
      try {
        const result = await signIn('link-token', {
          tokenHash,
          token,
          email: email ?? undefined,
          accessToken: accessToken ?? undefined,
          refreshToken: refreshToken ?? undefined,
          redirect: false,
        });

        if (result?.error) {
          setError(t('error.invalid_verification_link'));
        } else if (result?.ok) {
          window.history.replaceState({}, '', '/auth/confirm');
          router.replace('/language-select');
          router.refresh();
          return;
        } else {
          setError(t('error.invalid_verification_link'));
        }
      } catch {
        setError(t('error.something_went_wrong'));
      }
      setBusy(false);
    })();
  }, [router, t]);

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-lg">
        {busy && !error ? (
          <>
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />
            <h1 className="mt-4 text-2xl font-bold">{t('action.verify_email')}</h1>
            <p className="mt-2 text-muted-foreground">{t('msg.verifying')}</p>
          </>
        ) : (
          <>
            <AlertCircle className="mx-auto h-10 w-10 text-destructive" />
            <h1 className="mt-4 text-2xl font-bold">{t('error.invalid_verification_link')}</h1>
            <p className="mt-2 text-muted-foreground">{error}</p>
            <Link href="/login" className={buttonVariants({ className: 'mt-6' })}>
              {t('action.back_to_login')}
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
