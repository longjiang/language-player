'use client';

import { Suspense, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useT } from '@/hooks/use-t';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { ACQUISITION_SOURCES } from '@langplayer/shared';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PYTHON_API_URL } from '@/lib/api-url';
import { logwarn } from '@/lib/logger';
import { getExploreUrl } from '@/lib/last-language-pair';

type Step = 'form' | 'verify' | 'complete';

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const verifyEmail = searchParams.get('verifyEmail') ?? '';
  const t = useT();
  const [step, setStep] = useState<Step>(verifyEmail ? 'verify' : 'form');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState(verifyEmail);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [acquisitionSource, setAcquisitionSource] = useState('');
  const [acquisitionDetails, setAcquisitionDetails] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const selectedSourceLabel = acquisitionSource
    ? ACQUISITION_SOURCES.find((o) => o.value === acquisitionSource)?.labelKey
    : undefined;

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');
    if (!acquisitionSource) {
      setError(t('msg.please_select_option'));
      return;
    }
    setLoading(true);

    try {
      const res = await fetch(`${PYTHON_API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          password,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        if (errData?.errors?.[0]?.message?.includes('unique')) {
          throw new Error(t('error.email_exists'));
        }
        throw new Error(t('error.create_account_failed'));
      }

      const data = await res.json().catch(() => null);
      const userId = data?.user?.id;
      if (userId) {
        try {
          await fetch(`${PYTHON_API_URL}/acquisition_survey`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              user_id: userId,
              acquisition_source: acquisitionSource,
              acquisition_details:
                acquisitionSource === 'other' ? acquisitionDetails.trim() : undefined,
            }),
          });
        } catch {
          logwarn('[LP Web] Failed to submit acquisition survey');
        }
      }

      const verifyRes = await fetch(`${PYTHON_API_URL}/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!verifyRes.ok) {
        logwarn('[LP Web] Verification email failed to send');
      }

      setStep('verify');
    } catch (err: any) {
      setError(err.message || t('error.something_went_wrong'));
    } finally {
      setLoading(false);
    }
  }

  async function handleResendCode() {
    setError('');
    setNotice('');
    setLoading(true);
    try {
      const res = await fetch(`${PYTHON_API_URL}/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.errors?.[0]?.message || t('error.something_went_wrong'));
      }
      setNotice(t('success.code_resent'));
    } catch (err: any) {
      setError(err.message || t('error.something_went_wrong'));
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');
    setLoading(true);

    try {
      const res = await fetch(`${PYTHON_API_URL}/auth/verify-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, token: code, type: 'email' }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.errors?.[0]?.message || t('error.invalid_verification_code'));
      }

      const data = await res.json().catch(() => null);
      let result: { ok?: boolean; error?: string; code?: string } | null = null;
      if (data?.token && data?.user) {
        result = await signIn('link-token', {
          ...(data.token ? { accessToken: data.token } : {}),
          ...(data.refreshToken ? { refreshToken: data.refreshToken } : {}),
          redirect: false,
        });
      } else if (password) {
        result = await signIn('credentials', {
          email,
          password,
          redirect: false,
        });
      } else {
        throw new Error(t('error.verification_failed'));
      }

      if (!result?.ok) {
        setStep('complete');
        setTimeout(() => router.push('/login'), 2000);
        return;
      }

      setStep('complete');
      router.push(verifyEmail ? getExploreUrl() : '/language-select');
      router.refresh();
    } catch (err: any) {
      setError(err.message || t('error.verification_failed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-lg">
        {step === 'form' && (
          <>
            <h1 className="text-2xl font-bold">{t('title.create_account')}</h1>
            <p className="mt-2 text-muted-foreground">{t('msg.start_learning')}</p>

            {error && (
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <form onSubmit={handleRegister} className="mt-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="firstName" className="block text-sm font-medium">{t('placeholder.first_name')}</label>
                  <input
                    id="firstName" type="text" value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm transition-colors placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="lastName" className="block text-sm font-medium">{t('placeholder.last_name')}</label>
                  <input
                    id="lastName" type="text" value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm transition-colors placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20"
                    required
                  />
                </div>
              </div>
              <div>
                <label htmlFor="email" className="block text-sm font-medium">{t('placeholder.email')}</label>
                <input
                  id="email" type="email" value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm transition-colors placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20"
                  placeholder={t('placeholder.email')} required autoComplete="email"
                />
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-medium">{t('placeholder.password')}</label>
                <input
                  id="password" type="password" value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm transition-colors placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20"
                  placeholder={t('placeholder.password_min')} minLength={8} required autoComplete="new-password"
                />
              </div>
              <div>
                <label htmlFor="acquisitionSource" className="block text-sm font-medium">{t('title.how_did_you_hear')}</label>
                <Select
                  value={acquisitionSource || undefined}
                  onValueChange={(value) => {
                    setAcquisitionSource(value);
                    setError('');
                  }}
                >
                  <SelectTrigger id="acquisitionSource" className="mt-1.5 w-full !h-[42px]">
                    <SelectValue placeholder={t('title.how_did_you_hear')}>
                      {selectedSourceLabel ? t(selectedSourceLabel) : undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>{t('title.how_did_you_hear')}</SelectLabel>
                      {ACQUISITION_SOURCES.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {t(opt.labelKey)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              {acquisitionSource === 'other' && (
                <div>
                  <label htmlFor="acquisitionDetails" className="block text-sm font-medium">{t('placeholder.please_specify')}</label>
                  <input
                    id="acquisitionDetails" type="text" value={acquisitionDetails}
                    onChange={(e) => {
                      setAcquisitionDetails(e.target.value);
                      setError('');
                    }}
                    className="mt-1.5 w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm transition-colors placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20"
                    placeholder={t('placeholder.please_specify')} required
                  />
                </div>
              )}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {loading ? t('msg.creating_account') : t('action.create_account')}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              {t('msg.already_have_account')}{' '}
              <Link href="/login" className="font-medium text-primary hover:underline">{t('action.log_in')}</Link>
            </p>
          </>
        )}

        {step === 'verify' && (
          <>
            <h1 className="text-2xl font-bold">{t('title.check_email')}</h1>
            <p className="mt-2 text-muted-foreground">
              {t('msg.verification_code_sent', { email })}
            </p>

            {notice && (
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-green-500/50 bg-green-500/10 p-3 text-sm text-green-600">
                <CheckCircle className="h-4 w-4 flex-shrink-0" />
                {notice}
              </div>
            )}

            {error && (
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <form onSubmit={handleVerify} className="mt-6 space-y-4">
              <div>
                <label htmlFor="code" className="block text-sm font-medium">{t('placeholder.verification_code')}</label>
                <input
                  id="code" type="text" inputMode="numeric" maxLength={8}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  className="mt-1.5 w-full rounded-lg border border-input bg-background px-4 py-2.5 text-center text-2xl tracking-[0.5em] transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20"
                  placeholder="00000000" required autoFocus
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading || code.length < 8}>
                {loading ? t('msg.verifying') : t('action.verify_email')}
              </Button>
            </form>

            <p className="mt-4 text-center text-sm text-muted-foreground">
              {t('msg.didnt_receive_code')}{' '}
              <button
                type="button"
                onClick={handleResendCode}
                disabled={loading}
                className="font-medium text-primary hover:underline"
              >
                {loading ? t('msg.verifying') : t('action.resend')}
              </button>
            </p>

            <Link href="/login" className="mt-6 block text-center text-sm font-medium text-primary hover:underline">
              {t('action.back_to_login')}
            </Link>
          </>
        )}

        {step === 'complete' && (
          <div className="text-center">
            <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
            <h1 className="mt-4 text-2xl font-bold">{t('title.all_set')}</h1>
            <p className="mt-2 text-muted-foreground">{t('msg.redirecting_to_language_selection')}</p>
          </div>
        )}
      </div>
    </main>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
      <RegisterForm />
    </Suspense>
  );
}
