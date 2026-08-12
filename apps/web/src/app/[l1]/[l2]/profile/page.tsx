'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { clearUserData } from '@/lib/user-data-wipe';
import { useRouter } from 'next/navigation';
import { useAuth } from '@langplayer/api-client';
import { useLanguage } from '@/providers/language-provider';
import { useProgress } from '@/hooks/use-progress';
import { useChannelPreferences } from '@/hooks/use-channel-preferences';
import { useT } from '@/hooks/use-t';
import { LanguageLevelSelect } from '@/components/language-level-select';
import { baseCode, languageName } from '@/lib/language-data';
import { PYTHON_API_URL } from '@/lib/api-url';
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  User,
  Mail,
  BookOpen,
  Loader2,
  ArrowRight,
  Crown,
  Check,
  Star,
  AlertTriangle,
  Trash2,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SubscriptionInfo {
  id?: number;
  type?: string;
  expires_on?: string | null;
  payment_processor?: string;
  payment_customer_id?: string;
  status?: string;
}

const PLANS = [
  {
    nameKey: 'plan.monthly',
    price: '$10',
    intervalKey: 'interval.monthly',
    descKey: 'plan.monthly_desc',
    benefitKeys: ['plan.full_transcripts', 'plan.unlimited_examples', 'plan.all_pro_features'],
  },
  {
    nameKey: 'plan.annual',
    price: '$90',
    intervalKey: 'interval.annual',
    descKey: 'plan.annual_desc',
    benefitKeys: ['plan.full_transcripts', 'plan.unlimited_examples', 'plan.all_pro_features', 'title.best_value'],
  },
  {
    nameKey: 'plan.lifetime',
    price: '$169',
    intervalKey: null,
    descKey: 'plan.lifetime_desc',
    benefitKeys: ['plan.full_transcripts', 'plan.unlimited_examples', 'plan.all_pro_features', 'msg.pay_once_forever'],
  },
];

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { l1, l2 } = useLanguage();
  const { level: userLevel, setLevel } = useProgress(baseCode(l2.code));
  const { deleteAccount } = useAuth();
  const { notInterested, resetNotInterested } = useChannelPreferences();
  const t = useT();

  // Redirect unauthenticated users
  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  const userId = session?.user?.id;
  const token = (session?.user as any)?.accessToken as string | undefined;
  const userEmail = session?.user?.email;
  const userName = session?.user?.name;

  // ── Subscription ──
  const [sub, setSub] = useState<SubscriptionInfo | null>(null);
  const [subLoading, setSubLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(false);

  useEffect(() => {
    if (!userId) { setSubLoading(false); return; }
    let cancelled = false;
    setSubLoading(true);
    authenticatedFetch(`${PYTHON_API_URL}/user-subscription`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        setSub(data?.id ? data : null);
        setSubLoading(false);
      })
      .catch(() => { if (!cancelled) setSubLoading(false); });
    return () => { cancelled = true; };
  }, [userId, token]);

  const planType = sub?.type ?? 'free';
  const isFree = !sub || planType === 'free';
  const isLifetime = planType === 'lifetime';
  const expiresOn = sub?.expires_on ? new Date(sub.expires_on.replace(' ', 'T')) : null;
  const isExpired = expiresOn ? expiresOn < new Date() : false;
  const isActive = isLifetime || (expiresOn && !isExpired);
  const willAutoRenew = ['monthly', 'annual'].includes(planType) && !!sub?.payment_customer_id && isActive;
  const hasRenewingSubscription = willAutoRenew;
  const daysLeft = expiresOn && isActive
    ? Math.max(0, Math.ceil((expiresOn.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  const handleCancel = async () => {
    if (!sub?.payment_customer_id) return;
    setCancelling(true);
    try {
      await fetch(`${PYTHON_API_URL}/cancel-subscription-at-end-of-period`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: sub.payment_customer_id }),
      });
      // Optimistically update
      setSub((prev) => prev ? { ...prev, payment_customer_id: '' } : null);
    } catch {} finally {
      setCancelling(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirm !== 'DELETE' || deleting || hasRenewingSubscription) return;
    setDeleting(true);
    setDeleteError(false);
    try {
      await deleteAccount();
    } catch {
      setDeleteError(true);
      setDeleting(false);
      return;
    }
    clearUserData();
    await signOut({ callbackUrl: '/' });
  };

  const closeDeleteDialog = () => {
    setDeleteOpen(false);
    setDeleteConfirm('');
    setDeleteError(false);
  };

  // ── Render ──
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* Account */}
      <section className="mb-10">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <User className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{userName ?? t('label.unknown_user')}</h1>
            <p className="flex items-center gap-1 text-sm text-muted-foreground">
              <Mail className="h-3.5 w-3.5" />
              {userEmail}
            </p>
            <Link
              href={`/docs/privacy-policy?l1=${encodeURIComponent(l1.code)}`}
              className="mt-2 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              {t('title.privacy_policy')}
            </Link>
          </div>
        </div>
      </section>

      {/* Language Level */}
      <section className="mb-10">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <BookOpen className="h-5 w-5" />
          {t('title.settings')}
        </h2>

        <div className="rounded-xl border border-border bg-card p-6">
          <p className="mb-3 text-sm text-muted-foreground">
            {t('msg.set_level_for_recommendations', { l2: languageName(l2.code, l1.code) })}
          </p>
          <div className="max-w-xs">
            <LanguageLevelSelect
              l2Code={baseCode(l2.code)}
              value={userLevel}
              onChange={setLevel}
            />
          </div>
          <button
            type="button"
            disabled={!userId || notInterested.length === 0}
            onClick={() => void resetNotInterested()}
            className="mt-4 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            {t('action.reset_not_interested')}
          </button>
        </div>
      </section>

      {/* Subscription */}
      <section className="mb-10">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <Crown className="h-5 w-5 text-amber-500" />
          {t('title.subscription')}
        </h2>
        {subLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : isFree ? (
          /* Free user — show upgrade options */
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="mb-4 flex items-center gap-2">
              <span className="rounded-full bg-muted px-3 py-1 text-sm font-medium">{t('label.free_account')}</span>
            </div>
            <p className="mb-4 text-sm text-muted-foreground">
              {t('msg.upgrade_to_pro_banner')}
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              {PLANS.map((plan) => (
                <div key={plan.nameKey} className="rounded-lg border border-border p-4 text-center">
                  <p className="text-lg font-bold">{t(plan.nameKey)}</p>
                  <p className="mt-1 text-2xl font-bold">
                    {plan.price}
                    {plan.intervalKey && <span className="text-sm font-normal text-muted-foreground">{t(plan.intervalKey)}</span>}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{t(plan.descKey)}</p>
                  <ul className="mt-3 space-y-1 text-left text-xs text-muted-foreground">
                    {plan.benefitKeys.map((key) => (
                      <li key={key} className="flex items-center gap-1"><Check className="h-3 w-3 text-green-500" /> {t(key)}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="mt-4 text-center">
              <Link href={`/${l1.code}/${l2.code}/go-pro`} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                {t('action.upgrade_to_pro')} <ArrowRight className="h-3 w-3" />
              </Link>
              <p className="mt-2 text-xs text-muted-foreground">
                {t('msg.money_back_guarantee')} <a href="mailto:jon.long@zerotohero.ca" className="underline">{t('action.contact_us')}</a>
              </p>
            </div>
          </div>
        ) : (
          /* Pro user — show subscription status */
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-3 py-1 text-sm font-medium ${
                    isLifetime ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200' :
                    isActive ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                    'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                  }`}>
                    {planType === 'monthly' ? t('subscription.monthly_cap') : planType === 'annual' ? t('subscription.annual_cap') : t('subscription.lifetime_cap')}
                    {isLifetime && ' 🎉'}
                    {isExpired && ` ${t('msg.expired_label')}`}
                  </span>
                  {willAutoRenew && (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                      {t('label.auto_renews')}
                    </span>
                  )}
                </div>
                {daysLeft !== null && isActive && !isLifetime && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {t('msg.days_remaining', { n: daysLeft })}
                    {willAutoRenew ? ` — ${t('msg.will_auto_renew')}` : ` — ${t('msg.expires_on', { date: expiresOn!.toLocaleDateString() })}`}
                  </p>
                )}
                {isExpired && (
                  <p className="mt-2 text-sm text-red-600 dark:text-red-400">{t('msg.subscription_expired')}</p>
                )}
                {isLifetime && (
                  <p className="mt-2 text-sm text-muted-foreground">{t('msg.lifetime_access')}</p>
                )}
                {sub?.payment_processor && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('msg.paid_via', { processor: sub.payment_processor === 'app-store' ? t('payment.apple_app_store') : sub.payment_processor === 'stripe' ? t('payment.stripe') : sub.payment_processor === 'paypal' ? t('payment.paypal') : t('payment.other') })}
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                {willAutoRenew && (
                  <Button variant="outline" size="sm" onClick={handleCancel} disabled={cancelling}>
                    {cancelling ? t('msg.cancelling') : t('action.cancel_auto_renewal')}
                  </Button>
                )}
                {!isLifetime && (
                  <Link href={`/${l1.code}/${l2.code}/go-pro`}>
                    <Button variant="outline" size="sm">{isExpired ? t('action.renew') : t('action.upgrade')}</Button>
                  </Link>
                )}
              </div>
            </div>

            {!isLifetime && (
              <div className="mt-6 border-t border-border pt-4">
                <p className="mb-3 text-sm font-medium">{t('msg.want_lifetime_access')}</p>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
                  <div className="flex items-center gap-2">
                    <Star className="h-5 w-5 text-amber-500" />
                    <div>
                      <p className="font-semibold">{t('label.lifetime_one_time')}</p>
                      <p className="text-sm text-muted-foreground">{t('msg.pay_once_forever')}</p>
                    </div>
                  </div>
                  <a href="https://languageplayer.io/go-pro" target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-sm font-medium text-primary hover:underline">
                    {t('action.upgrade_to_lifetime')} <ArrowRight className="inline h-3 w-3" />
                  </a>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Delete Account */}
      <section className="rounded-xl border border-destructive/40 bg-destructive/5 p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-destructive">
          <Trash2 className="h-5 w-5" />
          {t('title.delete_account')}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {t('msg.delete_account_permanent_warning')}
        </p>
        {subLoading ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('msg.loading')}
          </p>
        ) : hasRenewingSubscription ? (
          <p className="mt-3 text-sm font-medium text-destructive">
            {t('msg.delete_account_cancel_subscription_first')}
          </p>
        ) : (
          <Button
            variant="destructive"
            className="mt-4"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="h-4 w-4" />
            {t('action.delete_account_permanently')}
          </Button>
        )}
      </section>

      <Dialog open={deleteOpen} onOpenChange={(open) => { if (!open) closeDeleteDialog(); }}>
        <DialogContent className="border-destructive/40 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              {t('title.delete_account')}
            </DialogTitle>
            <DialogDescription>
              {t('msg.delete_account_permanent_warning')}
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {t('msg.delete_account_irreversible')}
          </div>

          <label className="space-y-1.5">
            <span className="text-sm font-medium">{t('msg.delete_account_type_to_confirm')}</span>
            <input
              type="text"
              value={deleteConfirm}
              onChange={(e) => {
                setDeleteConfirm(e.target.value);
                setDeleteError(false);
              }}
              placeholder="DELETE"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:ring-2 focus:ring-ring"
              autoFocus
            />
          </label>

          {deleteError && (
            <p className="text-sm text-destructive">{t('msg.delete_account_error')}</p>
          )}

          <DialogFooter showCloseButton>
            <Button
              variant="destructive"
              onClick={handleDeleteAccount}
              disabled={deleteConfirm !== 'DELETE' || deleting}
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              {t('action.delete_account_permanently')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
