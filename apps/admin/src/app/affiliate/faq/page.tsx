'use client';

import { AffiliateShell } from '@/components/layout/affiliate-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useT } from '@/hooks/use-t';

const FAQ = [
  'How attribution works: last affiliate link wins, stored in a first-party cookie for 60 days on the same browser/device. Buyers who reject affiliate cookies are not attributed.',
  'Payouts are monthly with a one-month delay. March earnings are available in April and paid on the first business day of May, after the refund window.',
  'PayPal is the only payout method in v1. Add your PayPal email on the Payouts page.',
  'Commission is a percentage of the net product revenue after tax and after any coupon, for USD web purchases only.',
  'Refunds and chargebacks reverse the commission. If it was already paid, the reversal appears in your next statement.',
  'App Store, Google Play, and CNY checkouts are not commissionable in v1.',
  'Only the affiliate can see their own transactions. Buyer names, emails, and payment ids are never shown.',
];

export default function AffiliateFaqPage() {
  const t = useT();
  return (
    <AffiliateShell>
      <Card>
        <CardHeader>
          <CardTitle>{t('label.faq')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {FAQ.map((item) => (
            <p key={item} className="border-b border-border pb-3 last:border-0 last:pb-0">
              {item}
            </p>
          ))}
        </CardContent>
      </Card>
    </AffiliateShell>
  );
}
