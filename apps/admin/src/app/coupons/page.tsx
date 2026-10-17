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
import { useT } from '@/hooks/use-t';
import { createCoupon, fetchCoupons, updateCoupon } from '@/lib/affiliate-api';
import { formatCents } from '@/lib/money';
import { logerr } from '@/lib/logger';
import type { Coupon, CouponList } from '@/types/affiliate';
import { useEffect, useState } from 'react';
import { AlertCircle, Loader2, Plus } from 'lucide-react';

function status(c: Coupon): string {
  if (!c.active) return 'archived';
  if (new Date(c.expiresAt) <= new Date()) return 'expired';
  if (c.remaining <= 0) return 'exhausted';
  return 'active';
}

export default function CouponsPage() {
  const t = useT();
  const [data, setData] = useState<CouponList | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    code: '',
    internalName: '',
    discountType: 'percent',
    value: '20',
    maxRedemptions: '100',
    expiresAt: '',
  });

  function load() {
    fetchCoupons({ limit: 100 })
      .then(setData)
      .catch((err) => {
        logerr('admin coupons load failed', err); // non-info-level: failed request, stack trace needed
        setError(err instanceof Error ? err.message : t('error.general'));
      });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function create() {
    setBusy(true);
    setError('');
    try {
      await createCoupon({
        code: form.code.trim(),
        internalName: form.internalName.trim(),
        discountType: form.discountType as 'percent' | 'amount',
        percentOff: form.discountType === 'percent' ? Number(form.value) : undefined,
        amountOffCents: form.discountType === 'amount' ? Math.round(Number(form.value) * 100) : undefined,
        maxRedemptions: Number(form.maxRedemptions),
        expiresAt: new Date(form.expiresAt).toISOString(),
      });
      setOpen(false);
      setForm({ code: '', internalName: '', discountType: 'percent', value: '20', maxRedemptions: '100', expiresAt: '' });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.general'));
    } finally {
      setBusy(false);
    }
  }

  async function archive(c: Coupon) {
    try {
      await updateCoupon(c.id, { active: !c.active });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.general'));
    }
  }

  return (
    <AdminShell>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t('label.coupons')}</h1>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" />
          {t('action.create_coupon')}
        </Button>
      </div>
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle>{t('label.coupons')}</CardTitle>
        </CardHeader>
        <CardContent>
          {!data ? (
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
          ) : data.coupons.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t('msg.no_coupons')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-2">Code</th>
                    <th className="py-2">{t('label.discount')}</th>
                    <th className="py-2">{t('label.uses')}</th>
                    <th className="py-2">{t('label.expires')}</th>
                    <th className="py-2">{t('label.status')}</th>
                    <th className="py-2">{t('label.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.coupons.map((c) => {
                    const st = status(c);
                    return (
                      <tr key={c.id} className="border-t border-border">
                        <td className="py-2">
                          <span className="font-mono">{c.code}</span>
                          <span className="block text-xs text-muted-foreground">{c.internalName}</span>
                        </td>
                        <td className="py-2">
                          {c.discountType === 'percent'
                            ? `${c.percentOff}%`
                            : formatCents(c.amountOffCents, c.currency)}
                        </td>
                        <td className="py-2">{c.used} / {c.maxRedemptions}</td>
                        <td className="py-2">{c.expiresAt?.slice(0, 10)}</td>
                        <td className="py-2">
                          <Badge variant={st === 'active' ? 'success' : 'secondary'}>{st}</Badge>
                        </td>
                        <td className="py-2">
                          <Button size="sm" variant="ghost" onClick={() => archive(c)}>
                            {c.active ? t('action.archive') : t('action.activate')}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('action.create_coupon')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Code</label>
              <Input className="mt-1" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="SUMMER20" />
            </div>
            <div>
              <label className="text-sm font-medium">{t('label.name')}</label>
              <Input className="mt-1" value={form.internalName} onChange={(e) => setForm({ ...form, internalName: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">{t('label.discount')}</label>
                <select
                  value={form.discountType}
                  onChange={(e) => setForm({ ...form, discountType: e.target.value })}
                  className="mt-1 flex h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="percent">%</option>
                  <option value="amount">USD</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">
                  {form.discountType === 'percent' ? '%' : 'USD'}
                </label>
                <Input className="mt-1" type="number" min="0" step="0.01" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">{t('label.uses')}</label>
                <Input className="mt-1" type="number" min="1" max="10000" value={form.maxRedemptions} onChange={(e) => setForm({ ...form, maxRedemptions: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">{t('label.expires')}</label>
                <Input className="mt-1" type="datetime-local" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Lifetime Pro, USD only. Codes and discounts cannot be changed after creation; archive and create a new one.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>{t('action.cancel')}</Button>
            <Button onClick={create} disabled={busy || !form.code || !form.internalName || !form.expiresAt}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('action.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}
