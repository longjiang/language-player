'use client';

import { AffiliateShell } from '@/components/layout/affiliate-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useT } from '@/hooks/use-t';
import { fetchAffiliateMe, fetchAffiliateTransactions } from '@/lib/affiliate-api';
import { formatCents, formatPercentFromBps } from '@/lib/money';
import { logerr } from '@/lib/logger';
import type { AffiliateDashboard, AffiliateTransactionsPage } from '@/types/affiliate';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AlertCircle, ArrowRight, Check, Copy, Loader2, Wallet } from 'lucide-react';

export default function AffiliateDashboardPage() {
  const t = useT();
  const { status } = useSession();
  const [data, setData] = useState<AffiliateDashboard | null>(null);
  const [recent, setRecent] = useState<AffiliateTransactionsPage | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (status !== 'authenticated') return;
    let cancelled = false;
    Promise.all([
      fetchAffiliateMe(),
      fetchAffiliateTransactions({ limit: 5, offset: 0 }),
    ])
      .then(([me, tx]) => {
        if (cancelled) return;
        setData(me);
        setRecent(tx);
      })
      .catch((err) => {
        if (cancelled) return;
        logerr('affiliate dashboard load failed', err); // non-info-level: failed request, stack trace needed
        setError(err instanceof Error ? err.message : t('error.general'));
      });
    return () => {
      cancelled = true;
    };
  }, [status, t]);

  async function copyLink() {
    if (!data) return;
    await navigator.clipboard.writeText(data.primaryLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (status === 'loading' || (!data && !error)) {
    return (
      <AffiliateShell>
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AffiliateShell>
    );
  }

  if (error || !data) {
    return (
      <AffiliateShell>
        <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {error || t('error.general')}
        </div>
      </AffiliateShell>
    );
  }

  const metrics = data.metrics;

  return (
    <AffiliateShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('title.affiliate_program')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('label.commission')}: {formatPercentFromBps(data.commissionBps)} ·{' '}
            {data.linkAttributionDays} {t('label.days')}
          </p>
        </div>
        <Badge variant={data.active ? 'success' : 'secondary'}>
          {data.active ? t('label.active') : t('label.inactive')}
        </Badge>
      </div>

      {!data.paypalEmail && (
        <Card className="mb-5 border-primary/30 bg-primary/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="flex items-center gap-3">
              <Wallet className="h-5 w-5 text-primary" />
              <div>
                <p className="font-medium">{t('label.payouts')}</p>
                <p className="text-sm text-muted-foreground">
                  {t('msg.payout_setup_hint')}
                </p>
              </div>
            </div>
            <Link
              href="/affiliate/payouts"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {t('action.continue')}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          [t('label.sales'), formatCents(metrics.lifetimeSalesCents)],
          [t('label.earnings'), formatCents(metrics.lifetimeEarningsCents)],
          [t('label.pending'), formatCents(metrics.pendingEarningsCents)],
          [t('label.commission'), formatPercentFromBps(data.commissionBps)],
        ].map(([label, value]) => (
          <Card key={label}>
            <CardContent className="pt-5">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
              <p className="mt-1 text-2xl font-semibold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-5">
        <CardHeader>
          <CardTitle>{t('label.links')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground">{t('label.affiliate_code')}</p>
            <p className="mt-1 font-mono text-lg">{data.code}</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="min-w-0 flex-1 rounded-lg border border-border bg-muted/40 px-3 py-2 font-mono text-xs">
              <span className="break-all">{data.primaryLink}</span>
            </div>
            <Button variant="outline" onClick={copyLink}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? t('label.copied') : t('action.copy')}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t('msg.affiliate_link_hint')}</p>
        </CardContent>
      </Card>

      <Card className="mt-5">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t('label.transactions')}</CardTitle>
          <Link href="/affiliate/transactions" className="text-sm font-medium text-primary hover:underline">
            {t('action.view_all')}
          </Link>
        </CardHeader>
        <CardContent>
          {!recent || recent.transactions.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t('msg.no_results')}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="py-2">{t('label.date')}</th>
                    <th className="py-2">{t('label.product')}</th>
                    <th className="py-2">{t('label.sales')}</th>
                    <th className="py-2">{t('label.commission')}</th>
                    <th className="py-2">{t('label.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.transactions.map((tx) => (
                    <tr key={tx.id} className="border-t border-border">
                      <td className="py-2.5">{tx.date ? tx.date.slice(0, 10) : '—'}</td>
                      <td className="py-2.5">{tx.product}</td>
                      <td className="py-2.5">{formatCents(tx.saleCents, tx.currency)}</td>
                      <td className="py-2.5">{formatCents(tx.commissionCents, tx.currency)}</td>
                      <td className="py-2.5">
                        <Badge variant={tx.status === 'paid' ? 'success' : 'secondary'}>
                          {tx.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </AffiliateShell>
  );
}
