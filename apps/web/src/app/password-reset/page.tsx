'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useT } from '@/hooks/use-t';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { PYTHON_API_URL } from '@/lib/api-url';
import { logwarn } from '@/lib/logger';

/**
 * Password-reset (recovery) landing page. Reached from a Supabase
 * type=recovery email link: the session handler routes here with the recovery
 * JWT in ?token=. The token is consumed (once) by POST /auth/password-reset to
 * set a new password.
 */
function PasswordResetForm() {
  const t = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const token = searchParams.get('token');
  const warned = useRef(false);

  useEffect(() => {
    if (!token && !warned.current) {
      warned.current = true;
      setError(t('error.invalid_verification_link'));
    }
  }, [token, t]);

  function validate(): string | undefined {
    if (password.length < 8) return t('placeholder.password_min');
    if (password !== confirmPassword) return t('error.passwords_do_not_match');
    return undefined;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${PYTHON_API_URL}/auth/password-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.errors?.[0]?.message || t('error.something_went_wrong'));
      }
      logwarn('[LP Web] Password reset succeeded');
      setSuccess(true);
    } catch (err: any) {
      logwarn(`[LP Web] Password reset failed: ${err?.message ?? ''}`);
      setError(err?.message || t('error.something_went_wrong'));
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-lg">
          <CheckCircle className="mx-auto h-12 w-12 text-success" />
          <h1 className="mt-4 text-2xl font-bold">{t('title.reset_password')}</h1>
          <p className="mt-2 text-muted-foreground">{t('msg.reset_password_success')}</p>
          <Link href="/login" className="mt-6 inline-block">
            <Button variant="outline">{t('action.back_to_login')}</Button>
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-lg">
        <h1 className="text-2xl font-bold">{t('title.reset_password')}</h1>
        <p className="mt-2 text-muted-foreground">{t('placeholder.password_min')}</p>

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {!token && !loading ? (
          <p className="mt-4 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {t('error.invalid_verification_link')}
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="password" className="block text-sm font-medium">
                {t('placeholder.password')}
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm transition-colors placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20"
                placeholder={t('placeholder.password_min')}
                required
                autoComplete="new-password"
              />
            </div>
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium">
                {t('placeholder.confirm_password')}
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm transition-colors placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20"
                placeholder={t('placeholder.password')}
                required
                autoComplete="new-password"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t('title.reset_password')
              )}
            </Button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-muted-foreground">
          <Link href="/login" className="font-medium text-primary hover:underline">
            {t('action.back_to_login')}
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function PasswordResetPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <PasswordResetForm />
    </Suspense>
  );
}
