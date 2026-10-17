'use client';

import { AffiliateShell } from '@/components/layout/affiliate-shell';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useT } from '@/hooks/use-t';
import { fetchAffiliateStatements } from '@/lib/affiliate-api';
import { formatCents } from '@/lib/money';
import type { AffiliateStatement } from '@/types/affiliate';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

export default function AffiliateStatementsPage() {
  const t = useT();
  const [rows, setRows] = useState<AffiliateStatement[] | null>(null);

  useEffect(() => {
    fetchAffiliateStatements()
      .then((r) => setRows(r.statements))
      .catch(() => setRows([]));
  }, []);

  return (
    <AffiliateShell>
      <Card>
        <CardHeader>
          <CardTitle>{t('label.statements')}</CardTitle>
        </CardHeader>
        <CardContent>
          {!rows ? (
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t('msg.no_results')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="py-2">{t('label.period')}</th>
                    <th className="py-2">{t('label.statements')}</th>
                    <th className="py-2">{t('label.earnings')}</th>
                    <th className="py-2">{t('label.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => (
                    <tr key={s.id} className="border-t border-border">
                      <td className="py-2.5">{s.periodStart} — {s.periodEnd}</td>
                      <td className="py-2.5">
                        <Link className="underline" href={`/affiliate/statements/${s.id}`}>
                          {s.statementNumber}
                        </Link>
                      </td>
                      <td className="py-2.5">{formatCents(s.totalCents, s.currency)}</td>
                      <td className="py-2.5">
                        <Badge variant={s.status === 'paid' ? 'success' : 'secondary'}>{s.status}</Badge>
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
