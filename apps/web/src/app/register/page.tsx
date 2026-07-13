'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useT } from '@/hooks/use-t';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react';

const DIRECTUS_URL = process.env.NEXT_PUBLIC_DIRECTUS_URL ?? 'https://languageplayer.io';
const PYTHON_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:5001';

type Step = 'form' | 'verify' | 'complete';

export default function RegisterPage() {
  const router = useRouter();
  const t = useT();
  const [step, setStep] = useState<Step>('form');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${DIRECTUS_URL}/zerotohero/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          email,
          password,
          role: 2,
          status: 'draft',
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        if (errData?.error?.message?.includes('unique')) {
          throw new Error(t('error.email_exists'));
        }
        throw new Error(t('error.create_account_failed'));
      }

      const verifyRes = await fetch(`${PYTHON_URL}/verification_email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!verifyRes.ok) {
        console.warn('Verification email failed to send');
      }

      setStep('verify');
    } catch (err: any) {
      setError(err.message || t('error.something_went_wrong'));
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${PYTHON_URL}/verification_email/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });

      if (!res.ok) {
        throw new Error(t('error.invalid_verification_code'));
      }

      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.ok) {
        setStep('complete');
        router.push('/language-select');
        router.refresh();
      } else {
        setStep('complete');
        setTimeout(() => router.push('/login'), 2000);
      }
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
              {t('msg.verification_code_sent').replace('{email}', email)}
            </p>

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
                  id="code" type="text" inputMode="numeric" maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="mt-1.5 w-full rounded-lg border border-input bg-background px-4 py-2.5 text-center text-2xl tracking-[0.5em] transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20"
                  placeholder="000000" required autoFocus
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading || code.length < 6}>
                {loading ? t('msg.verifying') : t('action.verify_email')}
              </Button>
            </form>

            <p className="mt-4 text-center text-sm text-muted-foreground">
              {t('msg.didnt_receive_code')}{' '}
              <button
                type="button"
                onClick={() => handleRegister({ preventDefault: () => {} } as any)}
                className="font-medium text-primary hover:underline"
              >
                {t('action.resend')}
              </button>
            </p>
          </>
        )}

        {step === 'complete' && (
          <div className="text-center">
            <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
            <h1 className="mt-4 text-2xl font-bold">You&apos;re all set!</h1>
            <p className="mt-2 text-muted-foreground">Redirecting you to language selection...</p>
          </div>
        )}
      </div>
    </main>
  );
}
