import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Modal, Linking, AppState, Alert } from 'react-native';
import { MenuView } from '@react-native-menu/menu';
import { Pressable } from '@/components/ui/pressable';
import { Button, buttonTextClass } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Toast from 'react-native-toast-message';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useProgress } from '@/hooks/use-progress';
import { useChannelPreferences } from '@/hooks/use-channel-preferences';
import { useT } from '@/hooks/use-t';
import { useResponsive } from '@/hooks/use-responsive';
import { PYTHON_API_URL } from '@/lib/api-url';
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import { baseCode } from '@langplayer/utils';
import { primaryScale, getLevelLabelWithFallback } from '@langplayer/shared';
import { ICON_MUTED, ICON_PRIMARY, ICON_DESTRUCTIVE, ICON_ON_PRIMARY, PLACEHOLDER_COLOR } from '@/lib/theme-colors';
import { User, Mail, Clock, BookOpen, Crown, Star, ArrowRight, Check, ChevronDown, Trash2, AlertTriangle, ListVideo, Heart, Bookmark, RotateCcw } from 'lucide-react-native';
import { PageContainer } from '@/components/layout/PageContainer';

interface SubscriptionInfo {
  id?: number;
  type?: string;
  expires_on?: string | null;
  payment_processor?: string;
  payment_customer_id?: string;
  status?: string;
}

const PLANS = [
  { nameKey: 'subscription.monthly_cap' as const, price: '$10', interval: '/mo', planKey: 'monthly' },
  { nameKey: 'subscription.annual_cap' as const, price: '$90', interval: '/yr', planKey: 'annual' },
  { nameKey: 'subscription.lifetime_cap' as const, price: '$169', interval: '', planKey: 'lifetime' },
];

/** Language level selector — shows all 7 levels (1–7).
 *  Falls back to CEFR labels when the language's primary exam scale does not
 *  cover a level (e.g. JLPT has no N1+ level → level 7 shows "CEFR C2"). */
function LevelPicker({ l2Code, value, onChange, t }: {
  l2Code: string; value: number | undefined; onChange: (level: number) => void; t: (key: string) => string;
}) {
  const scaleId = primaryScale(l2Code);

  const options = useMemo(() => {
    // Show all 7 levels, using CEFR fallback for levels missing from the primary scale
    const result = [];
    for (let num = 1; num <= 7; num++) {
      const { label, prefix } = getLevelLabelWithFallback(num, scaleId);
      result.push({ value: num, label: `${prefix} ${label}` });
    }
    return result;
  }, [scaleId]);

  const selectedLabel = value ? options.find((o) => o.value === value)?.label : null;

  // Native menu actions; `state: 'on'` shows a checkmark on the selected level.
  const actions = options.map((opt) => ({
    id: String(opt.value),
    title: opt.label,
    state: (value === opt.value ? 'on' : 'off') as 'on' | 'off',
  }));

  return (
    <MenuView
      onPressAction={({ nativeEvent }) => onChange(Number(nativeEvent.event))}
      actions={actions}
    >
      <Pressable className="flex-row items-center justify-between rounded-lg border border-border bg-card px-3 py-2.5">
        <Text className={`text-sm ${selectedLabel ? 'text-foreground' : 'text-muted-foreground'}`}>
          {selectedLabel ?? t('msg.select_your_level')}
        </Text>
        <ChevronDown size={16} color={ICON_MUTED} />
      </Pressable>
    </MenuView>
  );
}

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const { l2Lang } = useLanguage();
  const { level: userLevel, setLevel } = useProgress(baseCode(l2Lang.code));
  const { resetNotInterested } = useChannelPreferences();
  const router = useRouter();
  const t = useT();
  const { isSm } = useResponsive();

  const l2Code = baseCode(l2Lang.code);

  const displayName = user?.firstName || user?.lastName
    ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()
    : t('label.unknown_user');

  // ── Subscription ──
  const [sub, setSub] = useState<SubscriptionInfo | null>(null);
  const [subLoading, setSubLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  const fetchSub = useCallback(async () => {
    if (!user?.id) { setSubLoading(false); return; }
    setSubLoading(true);
    try {
      const res = await authenticatedFetch(`${PYTHON_API_URL}/user-subscription`);
      const data = res.ok ? await res.json() : null;
      setSub(data?.id ? data : null);
    } catch {
      setSub(null);
    } finally {
      setSubLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchSub();
  }, [fetchSub]);

  // Refetch when the app returns to the foreground so a website/admin
  // subscription change shows up without restarting the app.
  useEffect(() => {
    const s = AppState.addEventListener('change', (state) => {
      if (state === 'active') fetchSub();
    });
    return () => s.remove();
  }, [fetchSub]);

  const planType = sub?.type ?? 'free';
  const isFree = !sub || planType === 'free';
  const isLifetime = planType === 'lifetime';
  const expiresOn = sub?.expires_on ? new Date(sub.expires_on.replace(' ', 'T')) : null;
  const isExpired = expiresOn ? expiresOn < new Date() : false;
  const isActive = isLifetime || (expiresOn && !isExpired);
  const willAutoRenew = ['monthly', 'annual'].includes(planType) && !!sub?.payment_customer_id && isActive;
  const daysLeft = expiresOn && isActive
    ? Math.max(0, Math.ceil((expiresOn.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  const handleCancel = useCallback(async () => {
    if (!sub?.payment_customer_id) return;
    setCancelling(true);
    try {
      await fetch(`${PYTHON_API_URL}/cancel-subscription-at-end-of-period`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: sub.payment_customer_id }),
      });
      setSub((prev) => prev ? { ...prev, payment_customer_id: '' } : null);
    } catch {} finally {
      setCancelling(false);
    }
  }, [sub?.payment_customer_id]);

  // ── Delete account (mirrors apps/web profile) ──
  const hasRenewingSubscription = willAutoRenew;
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(false);

  const closeDeleteDialog = () => {
    setDeleteOpen(false);
    setDeleteConfirm('');
    setDeleteError(false);
  };

  const handleResetNotInterested = async () => {
    await resetNotInterested();
    Toast.show({ type: 'success', text1: t('msg.reset_not_interested_success') });
  };

  const confirmResetNotInterested = () => {
    Alert.alert(
      t('action.reset_not_interested'),
      t('msg.confirm_reset_not_interested'),
      [
        { text: t('action.cancel'), style: 'cancel' },
        {
          text: t('action.reset_not_interested'),
          style: 'destructive',
          onPress: () => void handleResetNotInterested(),
        },
      ],
    );
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirm !== 'DELETE' || deleting || hasRenewingSubscription) return;
    setDeleting(true);
    setDeleteError(false);
    try {
      const res = await authenticatedFetch(`${PYTHON_API_URL}/auth/delete-account`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error('delete account failed');
    } catch {
      setDeleteError(true);
      setDeleting(false);
      return;
    }
    // Clear locally cached saved words (same keys the web clears on delete)
    try {
      await SecureStore.deleteItemAsync('zthSavedWords');
      await SecureStore.deleteItemAsync('zthSavedWordsPendingOps');
    } catch { /* ignore */ }
    await logout();
    router.replace('/login');
  };

  // ── Render ──

  if (!user) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-6 py-6">
        <Text className="text-center text-sm text-muted-foreground">{t('label.guest_user')}</Text>
      </View>
    );
  }

  return (
    <PageContainer>
      <ScrollView className="flex-1">
      {/* ── Account header ── */}
      <View className="flex-row items-center gap-4 mx-4 mt-4 mb-8">
        <View className="w-14 h-14 rounded-full bg-primary/10 items-center justify-center">
          <User size={28} color={ICON_PRIMARY} />
        </View>
        <View className="flex-1">
          <Text className="text-xl font-bold text-foreground">{displayName}</Text>
          <View className="flex-row items-center gap-1 mt-0.5">
            <Mail size={14} color={ICON_MUTED} />
            <Text className="text-xs text-muted-foreground">{user.email}</Text>
          </View>
        </View>
      </View>

      {/* ── Language Level ── */}
      <View className="mx-4 mb-6">
        <View className="flex-row items-center gap-2 mb-3">
          <BookOpen size={18} color={ICON_PRIMARY} />
          <Text className="text-base font-semibold text-foreground">{t('title.settings')}</Text>
        </View>
        <View className="rounded-xl border border-border bg-card p-4">
          <Text className="text-sm text-muted-foreground mb-3">
            {t('msg.set_level_for_recommendations', { l2: l2Lang.name })}
          </Text>
          <LevelPicker l2Code={l2Code} value={userLevel} onChange={setLevel} t={t} />
        </View>
      </View>

      {/* ── Subscription ── */}
      <View className="mx-4 mb-6">
        <View className="flex-row items-center gap-2 mb-3">
          <Crown size={18} color="#f59e0b" />
          <Text className="text-base font-semibold text-foreground">{t('title.subscription')}</Text>
        </View>

        {subLoading ? (
          <View className="items-center py-8">
            <ActivityIndicator size="small" color={ICON_MUTED} />
          </View>
        ) : isFree ? (
          /* ── Free user — show upgrade options ── */
          <View className="rounded-xl border border-border bg-card p-4">
            <View className="mb-3 self-start rounded-full bg-muted px-3 py-1">
              <Text className="text-sm font-medium text-foreground">{t('label.free_account')}</Text>
            </View>
            <Text className="text-sm text-muted-foreground mb-4">{t('msg.upgrade_to_pro_banner')}</Text>
            <View className={`${isSm ? 'flex-row flex-wrap' : ''} gap-2 mb-4`}>
              {PLANS.map((plan) => (
                <View
                  key={plan.planKey}
                  style={isSm ? { width: '31%' } : undefined}
                  className="rounded-lg border border-border px-3 py-2.5"
                >
                  <View>
                    <Text className="text-sm font-semibold text-foreground">{t(plan.nameKey)}</Text>
                    <Text className="text-xs text-muted-foreground">{plan.interval}</Text>
                  </View>
                  <Text className="mt-1 text-lg font-bold text-foreground">{plan.price}</Text>
                </View>
              ))}
            </View>
            <Button
              onPress={() => router.push('/(tabs)/(me)/go-pro' as any)}
            >
              <Text className={buttonTextClass('default')}>{t('action.upgrade_to_pro')}</Text>
              <ArrowRight size={14} color="#fff" />
            </Button>
            <View className="mt-3 flex-row items-center justify-center gap-1 flex-wrap">
              <Text className="text-center text-xs text-muted-foreground">
                {t('msg.money_back_guarantee')}
              </Text>
              <Pressable onPress={() => Linking.openURL('mailto:jon.long@zerotohero.ca')}>
                <Text className="text-xs text-primary underline">{t('action.contact_us')}</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          /* ── Pro user — show subscription status ── */
          <View className="rounded-xl border border-border bg-card p-4">
            <View className="flex-row flex-wrap items-center gap-2 mb-2">
              <View className={`rounded-full px-3 py-1 ${
                isLifetime ? 'bg-amber-100 dark:bg-amber-900' :
                isActive ? 'bg-green-100 dark:bg-green-900' :
                'bg-red-100 dark:bg-red-900'
              }`}>
                <Text className={`text-sm font-medium ${
                  isLifetime ? 'text-amber-800 dark:text-amber-200' :
                  isActive ? 'text-green-800 dark:text-green-200' :
                  'text-red-800 dark:text-red-200'
                }`}>
                  {t(planType === 'monthly' ? 'subscription.monthly_cap' : planType === 'annual' ? 'subscription.annual_cap' : 'subscription.lifetime_cap')}
                  {isLifetime && ' 🎉'}
                  {isExpired && ` ${t('msg.expired_label')}`}
                </Text>
              </View>
              {willAutoRenew && (
                <View className="rounded-full bg-blue-100 dark:bg-blue-900 px-2 py-0.5">
                  <Text className="text-xs font-medium text-blue-700 dark:text-blue-300">{t('label.auto_renews')}</Text>
                </View>
              )}
            </View>

            {daysLeft !== null && isActive && !isLifetime && (
              <Text className="text-sm text-muted-foreground mb-3">
                {t('msg.days_remaining', { n: daysLeft })}
                {willAutoRenew ? ` — ${t('msg.will_auto_renew')}` : ` — ${t('msg.expires_on', { date: expiresOn!.toLocaleDateString() })}`}
              </Text>
            )}
            {isExpired && (
              <Text className="text-sm text-red-600 dark:text-red-400 mb-3">{t('msg.subscription_expired')}</Text>
            )}
            {isLifetime && (
              <Text className="text-sm text-muted-foreground mb-3">{t('msg.lifetime_access')}</Text>
            )}
            {sub?.payment_processor && (
              <Text className="text-xs text-muted-foreground mb-3">
                {t('msg.paid_via', { processor: sub.payment_processor === 'app-store' ? 'App Store' : sub.payment_processor === 'stripe' ? 'Stripe' : sub.payment_processor === 'paypal' ? 'PayPal' : t('payment.other') })}
              </Text>
            )}

            <View className="flex-row gap-2">
              {willAutoRenew && (
                <Button
                  onPress={handleCancel}
                  disabled={cancelling}
                  variant="outline"
                  size="sm"
                >
                  <Text className={buttonTextClass('outline')}>
                    {cancelling ? t('msg.cancelling') : t('action.cancel_auto_renewal')}
                  </Text>
                </Button>
              )}
              <Button
                onPress={() => router.push('/(tabs)/(me)/go-pro' as any)}
                variant="outline"
                size="sm"
              >
                <Text className={buttonTextClass('outline')}>
                  {isExpired ? t('action.renew') : t('action.view_plans')}
                </Text>
              </Button>
            </View>

            {/* Lifetime upsell */}
            {!isLifetime && (
              <View className="mt-4 border-t border-border pt-4">
                <Text className="text-sm font-medium text-foreground mb-2">{t('msg.want_lifetime_access')}</Text>
                <View className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 p-3">
                  <View className="flex-row items-center gap-2">
                    <Star size={18} color="#f59e0b" />
                    <View>
                      <Text className="text-sm font-semibold text-foreground">{t('subscription.lifetime_cap')}</Text>
                      <Text className="text-xs text-muted-foreground">{t('msg.pay_once_forever')}</Text>
                    </View>
                  </View>
                  <Button onPress={() => router.push('/(tabs)/(me)/go-pro' as any)} variant="link" className="mt-2">
                    <Text className={buttonTextClass('link')}>{t('action.upgrade_to_lifetime')}</Text>
                  </Button>
                </View>
              </View>
            )}
          </View>
        )}
      </View>

      {/* ── My Activity ── */}
      <View className="mx-4 mb-6">
        <View className="flex-row items-center gap-2 mb-3">
          <Clock size={18} color={ICON_PRIMARY} />
          <Text className="text-base font-semibold text-foreground">{t('title.my_activity')}</Text>
        </View>
        <View className="rounded-xl border border-border bg-card p-2">
          <Pressable
            onPress={() => router.push('/(tabs)/(media)/watch-history' as any)}
            className="flex-row items-center gap-3 rounded-lg px-3 py-2.5 active:bg-muted"
          >
            <Clock size={16} color={ICON_MUTED} />
            <Text className="text-sm text-foreground">{t('title.watch_history')}</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/(tabs)/(me)/playlists' as any)}
            className="flex-row items-center gap-3 rounded-lg px-3 py-2.5 active:bg-muted"
          >
            <ListVideo size={16} color={ICON_MUTED} />
            <Text className="text-sm text-foreground">{t('title.playlists')}</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/(tabs)/(me)/liked-videos' as any)}
            className="flex-row items-center gap-3 rounded-lg px-3 py-2.5 active:bg-muted"
          >
            <Heart size={16} color={ICON_MUTED} />
            <Text className="text-sm text-foreground">{t('title.liked_videos')}</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/(tabs)/(vocab)/saved-words' as any)}
            className="flex-row items-center gap-3 rounded-lg px-3 py-2.5 active:bg-muted"
          >
            <Bookmark size={16} color={ICON_MUTED} />
            <Text className="text-sm text-foreground">{t('title.saved_words')}</Text>
          </Pressable>
          <Pressable
            onPress={confirmResetNotInterested}
            className="flex-row items-center gap-3 rounded-lg px-3 py-2.5 active:bg-muted"
          >
            <RotateCcw size={16} color={ICON_MUTED} />
            <Text className="text-sm text-foreground">{t('action.reset_not_interested')}</Text>
          </Pressable>
        </View>
      </View>

      {/* ── Delete Account ── */}
      <View className="mx-4 mb-6 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
        <View className="flex-row items-center gap-2">
          <Trash2 size={18} color={ICON_DESTRUCTIVE} />
          <Text className="text-base font-semibold text-destructive">{t('title.delete_account')}</Text>
        </View>
        <Text className="mt-2 text-sm text-muted-foreground">
          {t('msg.delete_account_permanent_warning')}
        </Text>
        {subLoading ? (
          <View className="mt-3 flex-row items-center gap-2">
            <ActivityIndicator size="small" color={ICON_MUTED} />
            <Text className="text-sm text-muted-foreground">{t('msg.loading')}</Text>
          </View>
        ) : hasRenewingSubscription ? (
          <Text className="mt-3 text-sm font-medium text-destructive">
            {t('msg.delete_account_cancel_subscription_first')}
          </Text>
        ) : (
          <Button
            onPress={() => setDeleteOpen(true)}
            variant="destructive"
            className="mt-4"
          >
            <Trash2 size={16} color={ICON_ON_PRIMARY} />
            <Text className={buttonTextClass('destructive')}>
              {t('action.delete_account_permanently')}
            </Text>
          </Button>
        )}
      </View>

      {/* ── Logout ── */}
      <Pressable onPress={logout} className="mx-4 mb-8 py-3 items-center border-t border-border">
        <Text className="text-sm text-destructive">{t('action.logout')}</Text>
      </Pressable>
      </ScrollView>

      {/* ── Delete Account confirm dialog ── */}
      <Modal
        visible={deleteOpen}
        transparent
        animationType="fade"
        onRequestClose={closeDeleteDialog}
      >
        <View className="flex-1 items-center justify-center bg-black/50 px-6">
          <View className="w-full max-w-sm rounded-2xl border border-destructive/40 bg-card p-5">
            <View className="flex-row items-center gap-2">
              <AlertTriangle size={18} color={ICON_DESTRUCTIVE} />
              <Text className="text-lg font-bold text-destructive">{t('title.delete_account')}</Text>
            </View>
            <Text className="mt-2 text-sm text-muted-foreground">
              {t('msg.delete_account_permanent_warning')}
            </Text>
            <View className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
              <Text className="text-sm text-destructive">{t('msg.delete_account_irreversible')}</Text>
            </View>
            <Text className="mt-3 text-sm font-medium text-foreground">{t('msg.delete_account_type_to_confirm')}</Text>
            <Input
              value={deleteConfirm}
              onChangeText={(text) => {
                setDeleteConfirm(text);
                setDeleteError(false);
              }}
              placeholder="DELETE"
              placeholderTextColor={PLACEHOLDER_COLOR}
              autoCapitalize="characters"
              autoCorrect={false}
              className="mt-1.5"
            />
            {deleteError && (
              <Text className="mt-2 text-sm text-destructive">{t('msg.delete_account_error')}</Text>
            )}
            <View className="mt-4 flex-col gap-2">
              <Button
                onPress={closeDeleteDialog}
                variant="outline"
                className="w-full"
              >
                <Text className={buttonTextClass('outline')}>{t('action.cancel')}</Text>
              </Button>
              <Button
                onPress={handleDeleteAccount}
                disabled={deleteConfirm !== 'DELETE' || deleting}
                variant="destructive"
                className="w-full"
              >
                {deleting ? (
                  <ActivityIndicator size="small" color={ICON_ON_PRIMARY} />
                ) : (
                  <Trash2 size={14} color={ICON_ON_PRIMARY} />
                )}
                <Text className={buttonTextClass('destructive')}>
                  {t('action.delete_account_permanently')}
                </Text>
              </Button>
            </View>
          </View>
        </View>
      </Modal>
    </PageContainer>
  );
}
