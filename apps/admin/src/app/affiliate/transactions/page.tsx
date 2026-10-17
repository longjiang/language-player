'use client';

import { AffiliateShell } from '@/components/layout/affiliate-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useT } from '@/hooks/use-t';
import { fetchAffiliateTransactions } from '@/lib/affiliate-api';
import { formatCents } from '@/lib/money';
import type { AffiliateTransactionsPage } from '@/types/affiliate';
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

export default function AffiliateTransactionsPage() {
  const t = useT();
  const [data, setData] = useState<AffiliateTransactionsPage | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    fetchAffiliateTransactions({ limit: 25, offset, from: from || undefined, to: to || undefined })
      .then((r) => !cancelled && setData(r))
      .catch(() => !cancelled && setData({ transactions: [], total: 0, limit: 25, offset }));
    return () => {
      cancelled = true;
    };
  }, [offset, from, to]);

  return (
    <AffiliateShell>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle>{t('label.transactions')}</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setOffset(0); }} />
            <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setOffset(0); }} />
          </div>
        </CardHeader>
        <CardContent>
          {!data ? (
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
          ) : data.transactions.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t('msg.no_results')}</p>
          ) : (
            <>
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
                    {data.transactions.map((tx) => (
                      <tr key={tx.id} className="border-t border-border">
                        <td className="py-2">{tx.date?.slice(0, 10) ?? '—'}</td>
                        <td className="py-2">{tx.product}</td>
                        <td className="py-2">{formatCents(tx.saleCents, tx.currency)}</td>
                        <td className="py-2">{formatCents(tx.commissionCents, tx.currency)}</td>
                        <td className="py-2">{tx.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex justify-between">
                <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 25))}>
                  {t('action.previous')}
                </Button>
                <Button variant="outline" size="sm" disabled={offset + 25 >= data.total} onClick={() => setOffset(offset + 25)}>
                  {t('action.next')}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </AffiliateShell>
  );
}
