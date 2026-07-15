'use client';

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useT } from '@/hooks/use-t';

/**
 * Top-level error page redirected to by the Python backend after a failed
 * Stripe / PayPal payment.  Not under /[l1]/[l2] because the Python backend
 * uses a fixed URL: {host}/go-pro-error
 */
export default function GoProErrorPage() {
  const t = useT();
  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <AlertTriangle className="mx-auto h-16 w-16 text-amber-500" />
      <h1 className="mt-4 text-2xl font-bold">{t('title.payment_issue')}</h1>
      <p className="mt-2 text-muted-foreground">
        {t('msg.payment_issue_desc')}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        {t('msg.try_again_or_contact')}
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Link href="/language-select">
          <Button variant="outline">{t('action.try_again')}</Button>
        </Link>
        <a href="mailto:jon.long@zerotohero.ca">
          <Button>
            {t('action.email_support')}
          </Button>
        </a>
      </div>
    </div>
  );
}
