import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSavedWords } from '@/hooks/use-saved-words';
import { useProgress } from '@/hooks/use-progress';
import { useT } from '@/hooks/use-t';
import { PYTHON_API_URL } from '@/lib/api-url';
import { baseCode } from '@langplayer/utils';
import { SCALES, primaryScale, formatNumericLevel } from '@langplayer/shared';
import { ICON_MUTED, ICON_PRIMARY } from '@/lib/theme-colors';
import { User, Mail, Clock, BookOpen, Crown, Play, Star, ArrowRight, Check, ChevronDown } from 'lucide-react-native';

function youtubeThumb(id: string) { return `https://img.youtube.com/vi/${id}/mqdefault.jpg`; }
function formatDuration(d: number | undefined): string {
  if (!d) return '';
  const m = Math.floor(d / 60), s = Math.floor(d % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface WatchHistoryItem { id: number; title?: string; youtube_id: string; duration?: number; last_position?: number; }

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

/** Language level selector — picks from 1–7 scale with exam-specific labels. */
function LevelPicker({ l2Code, value, onChange, t }: {
  l2Code: string; value: number | undefined; onChange: (level: number) => void; t: (key: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const scaleId = primaryScale(l2Code);
  const scale = SCALES[scaleId];

  const options = useMemo(() => {
    const entries = Object.entries(scale.labels).map(([numStr, label]) => {
      const num = Number(numStr);
      return { value: num, label: `${scale.shortPrefix} ${label}` };
    });
    // Only show levels that have labels in this scale
    return entries.filter((o) => o.label.trim() !== scale.shortPrefix + ' ');
  }, [scale]);

  const selectedLabel = value ? options.find((o) => o.value === value)?.label : null;

  return (
    <View>
      <Pressable
        onPress={() => setOpen(!open)}
        className="flex-row items-center justify-between rounded-lg border border-border bg-card px-3 py-2.5"
      >
        <Text className={`text-sm ${selectedLabel ? 'text-foreground' : 'text-muted-foreground'}`}>
          {selectedLabel ?? t('msg.select_your_level')}
        </Text>
        <ChevronDown size={16} color={ICON_MUTED} />
      </Pressable>
      {open && (
        <View className="mt-1 rounded-lg border border-border bg-card overflow-hidden">
          {options.map((opt) => (
            <Pressable
              key={opt.value}
              onPress={() => { onChange(opt.value); setOpen(false); }}
              className={`px-3 py-2.5 border-b border-border ${value === opt.value ? 'bg-primary/10' : ''}`}
            >
              <Text className={`text-sm ${value === opt.value ? 'text-primary font-semibold' : 'text-foreground'}`}>
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const { l1Lang, l2Lang } = useLanguage();
  const { savedWords: allSaved } = useSavedWords();
  const { level: userLevel, setLevel } = useProgress(baseCode(l2Lang.code));
  const router = useRouter();
  const t = useT();

  const l2Code = baseCode(l2Lang.code);
  const savedWords = (allSaved[l2Lang.code] ?? []).slice(0, 5);

  const displayName = user?.firstName || user?.lastName
    ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()
    : t('label.unknown_user');

  // ── Watch history ──
  const [history, setHistory] = useState<WatchHistoryItem[]>([]);
  const [histLoading, setHistLoading] = useState(true);
  useEffect(() => {
    if (!user?.id) { setHistLoading(false); return; }
    fetch(`${PYTHON_API_URL}/user-watch-history`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: user.id, l2: l2Code }),
    })
      .then((r) => r.ok ? r.json() : [])
      .then((d: WatchHistoryItem[]) => {
        const seen = new Set<string>();
        setHistory((Array.isArray(d) ? d : []).filter((i) => seen.has(i.youtube_id) ? false : (seen.add(i.youtube_id), true)).slice(0, 5));
      })
      .catch(() => {}).finally(() => setHistLoading(false));
  }, [user?.id, l2Code]);

  // ── Subscription ──
  const [sub, setSub] = useState<SubscriptionInfo | null>(null);
  const [subLoading, setSubLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (!user?.id) { setSubLoading(false); return; }
    setSubLoading(true);
    fetch(`${PYTHON_API_URL}/user-subscription?user_id=${user.id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        setSub(data?.id ? data : null);
        setSubLoading(false);
      })
      .catch(() => setSubLoading(false));
  }, [user?.id]);

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

  // ── Render ──

  if (!user) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-6 py-6">
        <Text className="text-center text-sm text-muted-foreground">{t('label.guest')}</Text>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-background">
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
            <View className="gap-2 mb-4">
              {PLANS.map((plan) => (
                <View key={plan.planKey} className="flex-row items-center justify-between rounded-lg border border-border px-3 py-2.5">
                  <View>
                    <Text className="text-sm font-semibold text-foreground">{t(plan.nameKey)}</Text>
                    <Text className="text-xs text-muted-foreground">{plan.interval}</Text>
                  </View>
                  <Text className="text-lg font-bold text-foreground">{plan.price}</Text>
                </View>
              ))}
            </View>
            <Pressable
              onPress={() => router.push('/(tabs)/(me)/go-pro' as any)}
              className="flex-row items-center justify-center gap-1.5 rounded-lg bg-primary py-2.5"
            >
              <Text className="text-sm font-semibold text-primary-foreground">{t('action.upgrade_to_pro')}</Text>
              <ArrowRight size={14} color="#fff" />
            </Pressable>
            <Text className="mt-3 text-center text-xs text-muted-foreground">
              {t('msg.money_back_guarantee')}
            </Text>
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
                <Pressable
                  onPress={handleCancel}
                  disabled={cancelling}
                  className="rounded-lg border border-border px-3 py-2"
                >
                  <Text className="text-sm text-foreground">
                    {cancelling ? t('msg.cancelling') : t('action.cancel_auto_renewal')}
                  </Text>
                </Pressable>
              )}
              {!isLifetime && (
                <Pressable
                  onPress={() => router.push('/(tabs)/(me)/go-pro' as any)}
                  className="rounded-lg border border-border px-3 py-2"
                >
                  <Text className="text-sm text-foreground">{isExpired ? t('action.renew') : t('action.upgrade')}</Text>
                </Pressable>
              )}
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
                  <Pressable onPress={() => router.push('/(tabs)/(me)/go-pro' as any)} className="mt-2">
                    <Text className="text-sm font-medium text-primary">{t('action.upgrade_to_lifetime')}</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        )}
      </View>

      {/* ── Watch History ── */}
      <View className="mx-4 mb-6">
        <View className="flex-row items-center justify-between mb-3">
          <View className="flex-row items-center gap-2">
            <Clock size={18} color={ICON_PRIMARY} />
            <Text className="text-base font-semibold text-foreground">{t('title.watch_history')}</Text>
          </View>
          {history.length > 0 && (
            <Pressable onPress={() => router.push('/(tabs)/(media)/watch-history' as any)} className="flex-row items-center gap-1">
              <Text className="text-xs text-primary">{t('action.see_all')}</Text>
              <ArrowRight size={12} color={ICON_PRIMARY} />
            </Pressable>
          )}
        </View>
        {histLoading ? (
          <View className="items-center py-8">
            <ActivityIndicator size="small" color={ICON_MUTED} />
          </View>
        ) : history.length === 0 ? (
          <Text className="py-8 text-center text-sm text-muted-foreground">{t('msg.no_videos_watched')}</Text>
        ) : (
          history.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => router.push(`/(tabs)/(media)/watch/${item.youtube_id}` as any)}
              className="flex-row items-center gap-3 py-2 border-b border-border"
            >
              <Image source={{ uri: youtubeThumb(item.youtube_id) }} className="w-20 h-12 rounded-md bg-muted" />
              <View className="flex-1">
                <Text className="text-xs font-medium text-foreground" numberOfLines={2}>{item.title ?? t('label.untitled_video')}</Text>
                {item.duration ? <Text className="text-xs text-muted-foreground mt-0.5">{formatDuration(item.duration)}</Text> : null}
              </View>
              <Play size={14} color={ICON_MUTED} />
            </Pressable>
          ))
        )}
      </View>

      {/* ── Saved Words ── */}
      <View className="mx-4 mb-6">
        <View className="flex-row items-center justify-between mb-3">
          <View className="flex-row items-center gap-2">
            <BookOpen size={18} color={ICON_PRIMARY} />
            <Text className="text-base font-semibold text-foreground">{t('title.saved_words')}</Text>
          </View>
          {savedWords.length > 0 && (
            <Pressable onPress={() => router.push('/(tabs)/(vocab)/saved-words' as any)} className="flex-row items-center gap-1">
              <Text className="text-xs text-primary">{t('action.see_all')}</Text>
              <ArrowRight size={12} color={ICON_PRIMARY} />
            </Pressable>
          )}
        </View>
        {savedWords.length === 0 ? (
          <Text className="py-8 text-center text-sm text-muted-foreground">{t('msg.no_words_saved')}</Text>
        ) : (
          savedWords.map((w) => (
            <Pressable
              key={w.id}
              onPress={() => router.push(`/(tabs)/(vocab)/word/${(w.id).replace(/,/g, '~')}` as any)}
              className="flex-row items-center py-2.5 border-b border-border"
            >
              <View className="flex-1">
                <Text className="text-base font-semibold text-foreground">{(w as any).head || (w as any).forms?.[0] || w.id}</Text>
                {(w as any).context?.videoTitle ? (
                  <Text className="text-xs text-muted-foreground mt-0.5" numberOfLines={1}>📺 {(w as any).context.videoTitle}</Text>
                ) : null}
              </View>
            </Pressable>
          ))
        )}
      </View>

      {/* ── Logout ── */}
      <Pressable onPress={logout} className="mx-4 mb-8 py-3 items-center border-t border-border">
        <Text className="text-sm text-destructive">{t('action.logout')}</Text>
      </Pressable>
    </ScrollView>
  );
}
