'use client';

import { AffiliateShell } from '@/components/layout/affiliate-shell';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useT } from '@/hooks/use-t';
import { fetchAffiliateStatement } from '@/lib/affiliate-api';
import { formatCents } from '@/lib/money';
import type { AffiliateStatementDetail } from '@/types/affiliate';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

export default function AffiliateStatementDetailPage() {
  const t = useT();
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<AffiliateStatementDetail | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchAffiliateStatement(Number(params.id))
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : t('error.general')));
  }, [params.id, t]);

  return (
    <AffiliateShell>
      <Card>
        <CardHeader>
          <CardTitle>{t('label.statements')}</CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : !data ? (
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
                <span className="font-mono">{data.statementNumber}</span>
                <Badge variant={data.status === 'paid' ? 'success' : 'secondary'}>{data.status}</Badge>
                <span className="text-muted-foreground">
                  {data.periodStart} — {data.periodEnd}
                </span>
                <span className="ml-auto font-semibold">
                  {formatCents(data.totalCents, data.currency)}
                </span>
              </div>
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
                    {data.items.map((item) => (
                      <tr key={item.id} className="border-t border-border">
                        <td className="py-2">{item.date?.slice(0, 10) ?? '—'}</td>
                        <td className="py-2">{item.product}</td>
                        <td className="py-2">{formatCents(item.saleCents, data.currency)}</td>
                        <td className="py-2">{formatCents(item.commissionCents, data.currency)}</td>
                        <td className="py-2">{item.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </AffiliateShell>
  );
}
