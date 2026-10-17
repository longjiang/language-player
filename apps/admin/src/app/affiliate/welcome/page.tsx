'use client';

import { AffiliateShell } from '@/components/layout/affiliate-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useT } from '@/hooks/use-t';
import Link from 'next/link';

export default function AffiliateWelcomePage() {
  const t = useT();
  return (
    <AffiliateShell>
      <Card className="mx-auto max-w-2xl">
        <CardHeader>
          <CardTitle>{t('title.affiliate_program')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p>
            Share your link. When someone buys Pro within 60 days, you earn a
            commission on the sale.
          </p>
          <p className="text-muted-foreground">
            Last-touch attribution: the most recent affiliate link before the
            purchase gets the commission. The link is stored in a first-party
            cookie on the same browser/device; buyers who reject affiliate
            cookies are not attributed.
          </p>
          <p className="text-muted-foreground">
            Payouts are monthly by PayPal, one month after the sale month, after
            the refund window.
          </p>
          <Link
            href="/affiliate/payouts"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            {t('action.continue')}
          </Link>
        </CardContent>
      </Card>
    </AffiliateShell>
  );
}
