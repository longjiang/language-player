'use client';

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
import {
  createAdminAffiliate,
  fetchAdminAffiliate,
  updateAdminAffiliate,
} from '@/lib/affiliate-api';
import { formatCents } from '@/lib/money';
import { logerr } from '@/lib/logger';
import type { AffiliateProfile } from '@/types/affiliate';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Loader2, UserPlus } from 'lucide-react';

export function AffiliateCard({ userId }: { userId: string }) {
  const t = useT();
  const [affiliate, setAffiliate] = useState<AffiliateProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [commission, setCommission] = useState('15');

  function load() {
    setLoading(true);
    fetchAdminAffiliate(userId)
      .then((r) => setAffiliate(r.affiliate))
      .catch((err) => {
        logerr('admin affiliate load failed', err); // non-info-level: failed request, stack trace needed
        setError(err instanceof Error ? err.message : t('error.general'));
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function saveAffiliate() {
    setSaving(true);
    setError('');
    try {
      const updated = affiliate
        ? await updateAdminAffiliate(userId, { commissionPercent: Number(commission) })
        : await createAdminAffiliate(userId, Number(commission));
      setAffiliate(updated);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.general'));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive() {
    if (!affiliate) return;
    setSaving(true);
    try {
      const updated = await updateAdminAffiliate(userId, { active: !affiliate.active });
      setAffiliate(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.general'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{t('label.affiliates')}</CardTitle>
        {affiliate && (
          <Badge variant={affiliate.active ? 'success' : 'secondary'}>
            {affiliate.active ? t('label.active') : t('label.inactive')}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : affiliate ? (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <span className="text-muted-foreground">{t('label.affiliate_code')}: </span>
                <span className="font-mono">{affiliate.code}</span>
              </div>
              <div>
                <span className="text-muted-foreground">{t('label.commission')}: </span>
                {affiliate.commissionPercent}%
              </div>
              <div>
                <span className="text-muted-foreground">{t('label.sales')}: </span>
                {formatCents(affiliate.metrics?.lifetimeSalesCents ?? 0)}
              </div>
              <div>
                <span className="text-muted-foreground">{t('label.earnings')}: </span>
                {formatCents(affiliate.metrics?.lifetimeEarningsCents ?? 0)}
              </div>
              <div>
                <span className="text-muted-foreground">{t('label.pending')}: </span>
                {formatCents(affiliate.metrics?.pendingEarningsCents ?? 0)}
              </div>
              <div>
                <span className="text-muted-foreground">{t('label.paypal_email')}: </span>
                {affiliate.paypalEmail || '—'}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => { setCommission(String(affiliate.commissionPercent)); setOpen(true); }}>
                {t('action.edit')}
              </Button>
              <Button size="sm" variant="ghost" onClick={toggleActive} disabled={saving}>
                {affiliate.active ? t('action.deactivate') : t('action.activate')}
              </Button>
              <Link
                href="/affiliates"
                className="inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium text-primary hover:bg-accent"
              >
                {t('label.statements')}
              </Link>
            </div>
          </>
        ) : (
          <>
            <p className="text-muted-foreground">{t('msg.no_affiliates')}</p>
            <Button size="sm" onClick={() => setOpen(true)}>
              <UserPlus className="h-4 w-4" />
              {t('action.make_affiliate')}
            </Button>
          </>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {affiliate ? t('label.commission') : t('action.make_affiliate')}
            </DialogTitle>
          </DialogHeader>
          <div>
            <label className="text-sm font-medium" htmlFor="commission">
              {t('label.commission')} (%)
            </label>
            <Input
              id="commission"
              type="number"
              min="0"
              max="100"
              step="0.01"
              className="mt-1.5"
              value={commission}
              onChange={(e) => setCommission(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t('action.cancel')}
            </Button>
            <Button onClick={saveAffiliate} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('action.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
