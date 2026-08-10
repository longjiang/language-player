'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useT } from '@/hooks/use-t';
import { removeSubscription } from '@/lib/admin-api';
import { formatDate } from '@/lib/format';
import { logerr } from '@/lib/logger';
import type { AdminSubscription } from '@/types/admin';
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { SubscriptionDialog } from './subscription-dialog';

function planLabel(t: ReturnType<typeof useT>, plan: string): string {
  switch (plan) {
    case 'monthly':
      return t('subscription.monthly');
    case 'annual':
      return t('subscription.annual');
    case 'lifetime':
      return t('subscription.lifetime');
    case 'trial':
      return t('label.trial');
    default:
      return plan;
  }
}

function statusVariant(status: string): 'success' | 'secondary' | 'destructive' | 'warning' {
  if (status === 'active') return 'success';
  if (status === 'cancelled') return 'warning';
  if (status === 'expired') return 'destructive';
  return 'secondary';
}

function statusLabel(t: ReturnType<typeof useT>, status: string): string {
  switch (status) {
    case 'active':
      return t('label.status_active');
    case 'cancelled':
      return t('label.status_cancelled');
    case 'expired':
      return t('label.status_expired');
    case 'draft':
      return t('label.status_draft');
    default:
      return status;
  }
}

interface SubscriptionManagerProps {
  userId: string;
  subscriptions: AdminSubscription[];
  onChanged: () => void;
}

export function SubscriptionManager({
  userId,
  subscriptions,
  onChanged,
}: SubscriptionManagerProps) {
  const t = useT();
  const [grantOpen, setGrantOpen] = useState(false);
  const [editing, setEditing] = useState<AdminSubscription | null>(null);
  const [removing, setRemoving] = useState<AdminSubscription | null>(null);
  const [removingBusy, setRemovingBusy] = useState(false);

  async function handleRemove() {
    if (!removing) return;
    setRemovingBusy(true);
    try {
      await removeSubscription(removing.id);
      toast.success(t('msg.subscription_removed'));
      setRemoving(null);
      onChanged();
    } catch (err) {
      logerr('subscription remove failed', err);
      toast.error(err instanceof Error ? err.message : t('error.general'));
    } finally {
      setRemovingBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{t('title.subscription')}</CardTitle>
        <Button size="sm" onClick={() => setGrantOpen(true)}>
          <Plus className="h-4 w-4" />
          {t('action.grant_subscription')}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {subscriptions.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('msg.no_subscriptions')}</p>
        )}
        {subscriptions.map((sub) => (
          <div
            key={sub.id}
            className="flex flex-col gap-3 rounded-lg border border-border p-4 sm:flex-row sm:items-start sm:justify-between"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{planLabel(t, sub.type)}</span>
                <Badge variant={statusVariant(sub.status)}>{statusLabel(t, sub.status)}</Badge>
                <span className="text-xs text-muted-foreground">#{sub.id}</span>
              </div>
              <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                <div className="flex gap-2">
                  <dt className="text-muted-foreground">{t('label.expires')}:</dt>
                  <dd>{formatDate(sub.expires_on)}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-muted-foreground">{t('label.payment_processor')}:</dt>
                  <dd>{sub.payment_processor ?? t('label.none')}</dd>
                </div>
                {sub.payment_id && (
                  <div className="flex gap-2">
                    <dt className="text-muted-foreground">{t('label.payment_id')}:</dt>
                    <dd className="break-all font-mono text-xs">{sub.payment_id}</dd>
                  </div>
                )}
                {sub.payment_customer_id && (
                  <div className="flex gap-2">
                    <dt className="text-muted-foreground">{t('label.customer_id')}:</dt>
                    <dd className="break-all font-mono text-xs">{sub.payment_customer_id}</dd>
                  </div>
                )}
                {sub.payment_email && (
                  <div className="flex gap-2">
                    <dt className="text-muted-foreground">{t('label.payment_email')}:</dt>
                    <dd className="break-all">{sub.payment_email}</dd>
                  </div>
                )}
                <div className="flex gap-2">
                  <dt className="text-muted-foreground">{t('label.created')}:</dt>
                  <dd>{formatDate(sub.created_on)}</dd>
                </div>
              </dl>
              {sub.notes && <p className="mt-2 text-sm text-muted-foreground">{sub.notes}</p>}
            </div>
            <div className="flex flex-shrink-0 gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(sub)}>
                <Pencil className="h-3.5 w-3.5" />
                {t('action.edit')}
              </Button>
              <Button variant="destructive" size="sm" onClick={() => setRemoving(sub)}>
                <Trash2 className="h-3.5 w-3.5" />
                {t('action.remove_subscription')}
              </Button>
            </div>
          </div>
        ))}
      </CardContent>

      <SubscriptionDialog
        mode="grant"
        userId={userId}
        open={grantOpen}
        onOpenChange={setGrantOpen}
        onSaved={onChanged}
      />
      <SubscriptionDialog
        mode="edit"
        userId={userId}
        subscription={editing ?? undefined}
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        onSaved={onChanged}
      />

      <Dialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('action.remove_subscription')}</DialogTitle>
            <DialogDescription>{t('msg.remove_subscription_confirm')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)}>
              {t('action.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleRemove} disabled={removingBusy}>
              {removingBusy && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('action.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
