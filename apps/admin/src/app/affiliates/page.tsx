'use client';

import { AdminShell } from '@/components/layout/admin-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useT } from '@/hooks/use-t';
import {
  fetchAdminStatements,
  fetchAffiliates,
  generateAdminStatements,
  payAdminStatement,
} from '@/lib/affiliate-api';
import { formatCents } from '@/lib/money';
import { logerr } from '@/lib/logger';
import type { AffiliateList, AffiliateStatement } from '@/types/affiliate';
import { useEffect, useState } from 'react';
import { AlertCircle, Loader2, Search } from 'lucide-react';

export default function AffiliatesPage() {
  const t = useT();
  const [data, setData] = useState<AffiliateList | null>(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [statements, setStatements] = useState<AffiliateStatement[]>([]);
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [paying, setPaying] = useState<AffiliateStatement | null>(null);
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);

  function load() {
    fetchAffiliates({ q, limit: 100 })
      .then(setData)
      .catch((err) => {
        logerr('admin affiliates load failed', err); // non-info-level: failed request, stack trace needed
        setError(err instanceof Error ? err.message : t('error.general'));
      });
    fetchAdminStatements({})
      .then((r) => setStatements(r.statements))
      .catch(() => undefined);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function generate() {
    setBusy(true);
    setError('');
    try {
      await generateAdminStatements(period);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.general'));
    } finally {
      setBusy(false);
    }
  }

  async function pay() {
    if (!paying) return;
    setBusy(true);
    try {
      await payAdminStatement(paying.id, reference);
      setPaying(null);
      setReference('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.general'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t('label.affiliates')}</h1>
        <div className="flex gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('action.search')} />
          <Button variant="outline" onClick={load}>
            <Search className="h-4 w-4" />
            {t('action.search')}
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {data && (
        <div className="mb-5 grid gap-4 sm:grid-cols-3">
          {[
            [t('label.active'), data.summary.activeAffiliates],
            [t('label.sales'), formatCents(data.summary.totalSalesCents)],
            [t('label.earnings'), formatCents(data.summary.totalEarningsCents)],
          ].map(([label, value]) => (
            <Card key={label}>
              <CardContent className="pt-5">
                <p className="text-xs uppercase text-muted-foreground">{label}</p>
                <p className="mt-1 text-2xl font-semibold">{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Tabs defaultValue="affiliates">
        <TabsList>
          <TabsTrigger value="affiliates">{t('label.affiliates')}</TabsTrigger>
          <TabsTrigger value="statements">{t('label.statements')}</TabsTrigger>
        </TabsList>

        <TabsContent value="affiliates">
          <Card>
            <CardContent className="pt-5">
              {!data ? (
                <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
              ) : data.affiliates.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">{t('msg.no_affiliates')}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="py-2">Code</th>
                        <th className="py-2">{t('label.email')}</th>
                        <th className="py-2">{t('label.commission')}</th>
                        <th className="py-2">{t('label.sales')}</th>
                        <th className="py-2">{t('label.earnings')}</th>
                        <th className="py-2">{t('label.status')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.affiliates.map((a) => (
                        <tr key={a.id} className="border-t border-border">
                          <td className="py-2 font-mono">{a.code}</td>
                          <td className="py-2">{a.email}</td>
                          <td className="py-2">{a.commissionPercent}%</td>
                          <td className="py-2">{formatCents(a.metrics?.lifetimeSalesCents ?? 0)}</td>
                          <td className="py-2">{formatCents(a.metrics?.lifetimeEarningsCents ?? 0)}</td>
                          <td className="py-2">
                            <Badge variant={a.active ? 'success' : 'secondary'}>
                              {a.active ? t('label.active') : t('label.inactive')}
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
        </TabsContent>

        <TabsContent value="statements">
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle>{t('label.statements')}</CardTitle>
              <div className="flex gap-2">
                <Input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="YYYY-MM" />
                <Button onClick={generate} disabled={busy}>
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t('action.generate_statements')}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {statements.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">{t('msg.no_results')}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="py-2">{t('label.period')}</th>
                        <th className="py-2">Code</th>
                        <th className="py-2">{t('label.earnings')}</th>
                        <th className="py-2">{t('label.status')}</th>
                        <th className="py-2">{t('label.actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {statements.map((s) => (
                        <tr key={s.id} className="border-t border-border">
                          <td className="py-2">{s.periodStart} — {s.periodEnd}</td>
                          <td className="py-2 font-mono">{s.affiliateCode}</td>
                          <td className="py-2">{formatCents(s.totalCents, s.currency)}</td>
                          <td className="py-2">
                            <Badge variant={s.status === 'paid' ? 'success' : 'secondary'}>{s.status}</Badge>
                          </td>
                          <td className="py-2">
                            {s.status === 'pending' && (
                              <Button size="sm" variant="outline" onClick={() => setPaying(s)}>
                                {t('action.mark_paid')}
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!paying} onOpenChange={(open) => !open && setPaying(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('action.mark_paid')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {paying?.statementNumber} · {formatCents(paying?.totalCents ?? 0)}
          </p>
          <Input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="PayPal transaction id"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPaying(null)}>{t('action.cancel')}</Button>
            <Button onClick={pay} disabled={busy || !reference.trim()}>{t('action.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}
