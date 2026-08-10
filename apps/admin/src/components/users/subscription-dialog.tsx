'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useT } from '@/hooks/use-t';
import { changeSubscription, grantSubscription } from '@/lib/admin-api';
import { logerr } from '@/lib/logger';
import type { AdminSubscription, SubscriptionInput } from '@/types/admin';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

const PLAN_TYPES = ['monthly', 'annual', 'lifetime', 'trial'] as const;
const STATUSES = ['active', 'cancelled', 'expired', 'draft'] as const;
const PROCESSORS = ['stripe', 'paypal', 'app-store', 'other'] as const;

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

interface SubscriptionDialogProps {
  mode: 'grant' | 'edit';
  userId: string;
  subscription?: AdminSubscription;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (subscription: AdminSubscription) => void;
}

export function SubscriptionDialog({
  mode,
  userId,
  subscription,
  open,
  onOpenChange,
  onSaved,
}: SubscriptionDialogProps) {
  const t = useT();
  const [type, setType] = useState('monthly');
  const [status, setStatus] = useState('active');
  const [processor, setProcessor] = useState('');
  const [paymentId, setPaymentId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [paymentEmail, setPaymentEmail] = useState('');
  const [expiresDate, setExpiresDate] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const initialExpiresDate = subscription?.expires_on?.slice(0, 10) ?? '';

  useEffect(() => {
    if (!open) return;
    setType(subscription?.type ?? 'monthly');
    setStatus(subscription?.status ?? 'active');
    setProcessor(subscription?.payment_processor ?? '');
    setPaymentId(subscription?.payment_id ?? '');
    setCustomerId(subscription?.payment_customer_id ?? '');
    setPaymentEmail(subscription?.payment_email ?? '');
    setExpiresDate(initialExpiresDate);
    setNotes(subscription?.notes ?? '');
  }, [open, subscription, initialExpiresDate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: SubscriptionInput = {
        type,
        status,
        payment_processor: processor || undefined,
        payment_id: paymentId || undefined,
        payment_customer_id: customerId || undefined,
        payment_email: paymentEmail || undefined,
        notes: notes || undefined,
      };

      if (mode === 'grant') {
        if (expiresDate) payload.expires_on = `${expiresDate}T00:00:00Z`;
        const created = await grantSubscription(userId, payload);
        toast.success(t('msg.subscription_granted'));
        onSaved(created);
      } else if (subscription) {
        const dateChanged = expiresDate !== initialExpiresDate;
        const typeChanged = type !== subscription.type;
        if (dateChanged) {
          payload.expires_on = expiresDate ? `${expiresDate}T00:00:00Z` : null;
        } else if (!typeChanged) {
          delete payload.expires_on;
        }
        const updated = await changeSubscription(subscription.id, payload);
        toast.success(t('msg.subscription_updated'));
        onSaved(updated);
      }
      onOpenChange(false);
    } catch (err) {
      logerr('subscription save failed', err);
      toast.error(err instanceof Error ? err.message : t('error.general'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === 'grant' ? t('action.grant_subscription') : t('title.edit_subscription')}
          </DialogTitle>
          <DialogDescription>
            {mode === 'grant' ? t('msg.grant_subscription_hint') : t('msg.edit_subscription_hint')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium">{t('label.plan')}</label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLAN_TYPES.map((plan) => (
                    <SelectItem key={plan} value={plan}>
                      {planLabel(t, plan)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium">{t('label.status')}</label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {statusLabel(t, s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium">{t('label.payment_processor')}</label>
            <Select
              value={processor || 'none'}
              onValueChange={(value) => setProcessor(value === 'none' ? '' : value)}
            >
              <SelectTrigger className="mt-1.5">
                <SelectValue placeholder={t('label.none')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('label.none')}</SelectItem>
                {PROCESSORS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="payment-id" className="block text-sm font-medium">
                {t('label.payment_id')}
              </label>
              <Input
                id="payment-id"
                value={paymentId}
                onChange={(e) => setPaymentId(e.target.value)}
                className="mt-1.5"
                placeholder="pay_… / sub_…"
              />
            </div>
            <div>
              <label htmlFor="customer-id" className="block text-sm font-medium">
                {t('label.customer_id')}
              </label>
              <Input
                id="customer-id"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="mt-1.5"
                placeholder="cus_…"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="payment-email" className="block text-sm font-medium">
                {t('label.payment_email')}
              </label>
              <Input
                id="payment-email"
                type="email"
                value={paymentEmail}
                onChange={(e) => setPaymentEmail(e.target.value)}
                className="mt-1.5"
              />
            </div>
            <div>
              <label htmlFor="expires" className="block text-sm font-medium">
                {t('label.expires')}
              </label>
              <Input
                id="expires"
                type="date"
                value={expiresDate}
                onChange={(e) => setExpiresDate(e.target.value)}
                className="mt-1.5"
              />
              {mode === 'grant' && (
                <p className="mt-1 text-xs text-muted-foreground">{t('msg.expiry_auto_hint')}</p>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="notes" className="block text-sm font-medium">
              {t('label.notes')}
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('action.cancel')}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? t('msg.loading') : t('action.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
