'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { PYTHON_API_URL } from '@/lib/api-url';
import { Loader2, CheckCircle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useT } from '@/hooks/use-t';

/**
 * Top-level success page redirected to by the Python backend after a
 * successful Stripe / PayPal payment.  Not under /[l1]/[l2] because
 * the Python backend uses a fixed URL: {host}/go-pro-success
 */
export default function GoProSuccessPage() {
  const { data: session, status } = useSession();
  const t = useT();

  const [checking, setChecking] = useState(true);
  const [isPro, setIsPro] = useState(false);

  useEffect(() => {
    if (status !== 'authenticated' || !session?.user?.id) {
      setChecking(false);
      return;
    }

    const userId = session.user.id!;
    let attempts = 0;
    const maxAttempts = 10;

    const check = async () => {
      try {
        const res = await fetch(`${PYTHON_API_URL}/user-subscription?user_id=${userId}`);
        if (res.ok) {
          const data = await res.json();
          if (data?.type && data.type !== 'free') {
            setIsPro(true);
            setChecking(false);
            return;
          }
        }
      } catch { /* retry */ }

      attempts++;
      if (attempts >= maxAttempts) {
        setChecking(false);
        return;
      }
      setTimeout(check, 2000);
    };

    check();
  }, [status, session]);

  if (status === 'loading' || checking) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{t('msg.verifying_pro_subscription')}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      {isPro ? (
        <>
          <CheckCircle className="mx-auto h-16 w-16 text-green-500" />
          <h1 className="mt-4 text-2xl font-bold">{t('msg.you_are_pro')}</h1>
          <p className="mt-2 text-muted-foreground">
            {t('msg.pro_subscription_active')}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link href="/language-select">
              <Button variant="outline">{t('action.view_profile')}</Button>
            </Link>
            <Link href="/language-select">
              <Button>
                {t('action.start_watching')} <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </>
      ) : session ? (
        <>
          <h1 className="text-2xl font-bold">{t('msg.payment_received')}</h1>
          <p className="mt-2 text-muted-foreground">
            {t('msg.payment_processing')}
          </p>
          <p className="mt-4 text-sm text-muted-foreground">
            {t('msg.contact_support_if_delayed')}
          </p>
          <div className="mt-8">
            <Link href="/language-select">
              <Button variant="outline">{t('action.continue')}</Button>
            </Link>
          </div>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-bold">Payment successful</h1>
          <p className="mt-2 text-muted-foreground">
            Please log in to verify your Pro status.
          </p>
          <div className="mt-8">
            <Link href="/login">
              <Button>{t('action.log_in')}</Button>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
