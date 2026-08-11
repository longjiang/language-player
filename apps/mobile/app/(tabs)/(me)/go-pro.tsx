import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Linking, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useT } from '@/hooks/use-t';
import { localizedError } from '@/lib/errors';
import { useResponsive } from '@/hooks/use-responsive';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { PYTHON_API_URL } from '@/lib/api-url';
import { IAP_AVAILABLE, initiatePurchase, finishPurchaseTransaction, restorePurchases, connectIap, setPurchaseHandler } from '@/lib/iap';
import { isSaleActive, getSaleDiscount, findUsdPrice, CONTENT_L2_COUNT } from '@langplayer/shared';
import type { StripePrice } from '@langplayer/shared';
import { Crown, Check, ArrowRight, AlertCircle, Apple, RefreshCw } from 'lucide-react-native';
import { ICON_MUTED, ICON_PRIMARY, ICON_WARNING, ICON_ON_PRIMARY } from '@/lib/theme-colors';
import { PageContainer } from '@/components/layout/PageContainer';
import { log, logwarn } from '@/lib/logger';

// ── Plan Definitions ──

interface PlanCard {
  nameKey: 'subscription.monthly_cap' | 'subscription.annual_cap' | 'subscription.lifetime_cap';
  defaultPrice: string;
  intervalKey: 'interval.monthly' | 'interval.annual' | 'interval.one_time';
  planKey: string;
  benefits: string[];
}

const PLANS: PlanCard[] = [
  {
    nameKey: 'subscription.monthly_cap',
    defaultPrice: '$10',
    intervalKey: 'interval.monthly',
    planKey: 'monthly',
    benefits: ['pro.feature_transcripts', 'pro.feature_examples', 'pro.feature_saved_words'],
  },
  {
    nameKey: 'subscription.annual_cap',
    defaultPrice: '$90',
    intervalKey: 'interval.annual',
    planKey: 'annual',
    benefits: ['pro.feature_transcripts', 'pro.feature_examples', 'pro.feature_saved_words', 'pro.feature_srs'],
  },
  {
    nameKey: 'subscription.lifetime_cap',
    defaultPrice: '$169',
    intervalKey: 'interval.one_time',
    planKey: 'lifetime',
    benefits: ['pro.feature_transcripts', 'pro.feature_examples', 'pro.feature_saved_words', 'pro.feature_srs', 'pro.feature_ai'],
  },
];

const FEATURE_KEYS = [
  'pro.feature_transcripts',
  'pro.feature_examples',
  'pro.feature_saved_words',
  'pro.feature_srs',
  'pro.feature_ai',
];

/** StoreKit replays the same purchase event multiple times (esp. during
 *  restore), and the listener can fire more than once before the transaction
 *  is finished. Track transaction ids that we've already surfaced so we
 *  validate + navigate exactly once per purchase. */
const _processedTransactions = new Set<string>();

// ── Helpers ──

/** Get the display price for a plan card from fetched prices or fallback to default. */
function displayPrice(prices: StripePrice[], planKey: string, defaultPrice: string): string {
  const usd = findUsdPrice(prices, planKey);
  if (usd) return `$${usd.amount}`;
  return defaultPrice;
}

/** Get the sale price for a plan (if active), or null. */
function salePrice(prices: StripePrice[], planKey: string): string | null {
  const sale = findUsdPrice(prices, planKey, 'sale');
  if (!sale) return null;
  return `$${sale.amount}`;
}

/** Check if a non-lifetime plan is gated on iOS (only lifetime is available via IAP). */
function isIOSGatedPlan(planKey: string): boolean {
  return Platform.OS === 'ios' && planKey !== 'lifetime';
}

/** Check if the viewer already has this plan. */
function isCurrentPlan(planKey: string, planType: string | null): boolean {
  return planKey === planType;
}

// ── Component ──

export default function GoProScreen() {
  const t = useT();
  const { isSm } = useResponsive();
  const { user } = useAuth();
  const {
    sub,
    isPro,
    planType,
    isLifetime,
    isExpired,
    willAutoRenew,
    daysUntilExpiry,
    loaded: subLoaded,
    fetchSubscription,
  } = useSubscription();
  const router = useRouter();

  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [prices, setPrices] = useState<StripePrice[]>([]);
  const [loadingPrices, setLoadingPrices] = useState(true);
  const [iapProcessing, setIapProcessing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [iapResult, setIapResult] = useState<{ purchase: any; receipt?: string; jws?: string } | null>(null);
  const [iapErrorCode, setIapErrorCode] = useState<string | null>(null);

  // Fetch Stripe prices from backend
  useEffect(() => {
    fetch(`${PYTHON_API_URL}/stripe-prices`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setPrices(Array.isArray(data) ? data : []))
      .catch(() => setError(t('msg.price_load_error')))
      .finally(() => setLoadingPrices(false));
  }, [t]);

  // ── IAP Purchase Listener ──
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    if (!IAP_AVAILABLE) return;
    connectIap().then(async () => {
      if (!mountedRef.current) return;
      await setPurchaseHandler(
        (result) => {
          // Purchase received from listener — set state to process it
          log('[IAP] purchase event received:', result.jws?.slice(0, 40) ?? '(no jws)');
          if (mountedRef.current) setIapResult(result);
        },
        (errorCode) => {
          if (mountedRef.current) {
            log('[IAP] purchase error code:', errorCode);
            setIapErrorCode(errorCode !== undefined ? String(errorCode) : 'unknown');
            if (errorCode !== 'user-cancelled') {
              setError(t('msg.iap_purchase_failed'));
            }
            setIapProcessing(false);
          }
        },
      );
    });
    return () => { mountedRef.current = false; };
  }, [t]);

  // Process IAP result: validate receipt on backend, then finish transaction
  useEffect(() => {
    if (!iapResult || !user?.id) return;
    const { purchase, receipt, jws } = iapResult;
    const txnId =
      (purchase as { transactionId?: string | null } | undefined)?.transactionId ??
      (purchase as { id?: string | null } | undefined)?.id ??
      jws;
    if (txnId) {
      if (_processedTransactions.has(String(txnId))) {
        // Already validating (or validated) this exact transaction — the
        // listener replayed it; don't POST again or push another success page.
        logwarn('[IAP] transaction already processed, skipping:', String(txnId).slice(0, 40));
        setIapResult(null);
        return;
      }
      _processedTransactions.add(String(txnId));
    }
    log('[IAP] processing purchase, txnId:', txnId ? String(txnId).slice(0, 40) : '(none)');

    (async () => {
      try {
        const res = await fetch(`${PYTHON_API_URL}/in_app_purchase_success`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: String(user.id), receipt, jws }),
        });

        const data = await res.json();
        log('[IAP] backend response type:', data?.type);

        if (data?.type === 'success') {
          await finishPurchaseTransaction(purchase);
          await fetchSubscription();
          log('[IAP] pushing go-pro-success');
          router.push('/go-pro-success' as any);
        } else {
          logwarn('[IAP] backend did not confirm:', data?.message);
          // Backend messages are English (Flask); map the known ones to
          // localized keys instead of showing raw text.
          const msg = data?.message as string | undefined;
          setError(
            msg?.includes('does not belong to the signed-in account')
              ? t('msg.iap_purchase_not_for_account')
              : msg?.includes('could not be verified from Apple')
                ? t('msg.receipt_validation_failed')
                : t('msg.receipt_validation_failed'),
          );
        }
      } catch (err: any) {
        logwarn('[IAP] purchase processing error:', err);
        setError(t('msg.receipt_validation_failed'));
      } finally {
        setIapProcessing(false);
        setIapResult(null);
      }
    })();
  }, [iapResult, user?.id, fetchSubscription, router, t]);

  const saleActive = isSaleActive(prices);
  const saleDiscount = getSaleDiscount(prices, 'lifetime');
  const lifetimeSalePrice = saleActive ? salePrice(prices, 'lifetime') : null;

  const selectedPlanData = PLANS.find((p) => p.planKey === selectedPlan);
  // Purchase gating (ARCH-022): an active auto-renewing subscription blocks
  // new purchases until cancelled — matches Classic (commit a8471782).
  // Only non-trial, unexpired subscriptions WITH payment_customer_id (i.e.
  // auto-renewing Stripe) show the "cancel first" gate. Lifetime IAP rows
  // have no payment_customer_id and instead get the "already owned" state
  // below (see isLifetimeOwner).
  const activeNonTrial =
    !!sub && sub.type !== 'trial' && !!sub.payment_customer_id && !isExpired;
  /** User already owns lifetime (IAP/Stripe/PayPal) — no repurchase possible. */
  const isLifetimeOwner = !!sub && sub.type === 'lifetime';

  // ── IAP Purchase (iOS only) ──
  const handleIapPurchase = useCallback(async () => {
    if (!user?.id) return;
    setIapProcessing(true);
    setError(null);
    setIapErrorCode(null);

    try {
      // initiatePurchase() fires the purchase listener — the result is
      // handled by the useEffect that watches iapResult state.
      await initiatePurchase(user.id);
    } catch (err: any) {
      if (err?.code !== 'user-cancelled') {
        // expo-iap throws the raw English "Failed to request purchase" for
        // any native request failure — show the localized message instead.
        setError(
          err?.message?.includes('Failed to request purchase')
            ? t('msg.iap_purchase_failed')
            : localizedError(t, err, 'msg.iap_purchase_failed'),
        );
      }
      setIapProcessing(false);
    }
    // NOTE: iapProcessing stays true until the listener resolves or errors
  }, [user?.id, t]);

  // ── Restore Purchases ──
  const handleRestorePurchases = useCallback(async () => {
    if (!user?.id) return;
    setRestoring(true);
    setError(null);

    try {
      const purchases = await restorePurchases();

      if (purchases.length === 0) {
        setError(t('msg.no_restore_found'));
        setRestoring(false);
        return;
      }

      // Validate each restored receipt (usually just one)
      let successCount = 0;
      for (const { purchase, receipt, jws } of purchases) {
        const res = await fetch(`${PYTHON_API_URL}/in_app_purchase_success`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: String(user.id), receipt, jws }),
        });

        const data = await res.json();

        if (data?.type === 'success') {
          await finishPurchaseTransaction(purchase);
          successCount++;
        }
      }

      if (successCount > 0) {
        await fetchSubscription();
        setError(null); // Clear any previous error
      } else {
        setError(t('msg.receipt_validation_failed'));
      }
    } catch {
      setError(t('msg.restore_failed'));
    } finally {
      setRestoring(false);
    }
  }, [user?.id, fetchSubscription, t]);

  // ── Render ──

  return (
    <PageContainer>
      <ScrollView className="flex-1 px-4 py-8">
      {/* Header */}
      <View className="items-center">
        <Crown size={48} color={ICON_PRIMARY} />
        <Text className="mt-3 text-2xl font-bold text-foreground">{t('action.go_pro')}</Text>
        <Text className="mt-2 text-center text-sm text-muted-foreground">
          {t('pro.desc', { count: CONTENT_L2_COUNT })}
        </Text>
      </View>

      {/* ── Sale Banner ── */}
      {saleActive && (
        <View className="mt-4 rounded-xl bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 p-3">
          <Text className="text-center text-sm font-bold text-amber-900 dark:text-amber-100">
            🔥 {t('msg.sale_active')}
          </Text>
          {saleDiscount !== null && (
            <Text className="mt-1 text-center text-xs text-amber-700 dark:text-amber-300">
              {lifetimeSalePrice
                ? t('msg.sale_lifetime_price', { pct: saleDiscount, price: lifetimeSalePrice })
                : t('msg.sale_discount', { pct: saleDiscount })}
            </Text>
          )}
        </View>
      )}

      {/* ── Current Subscription Status ── */}
      {subLoaded && isPro && (
        <View className="mt-6 rounded-xl border border-border bg-card p-4">
          <View className="flex-row items-center gap-2">
            <Crown size={18} color={ICON_WARNING} />
            <Text className="text-base font-semibold text-foreground">{t('title.subscription')}</Text>
          </View>
          <View className="mt-2 flex-row flex-wrap items-center gap-2">
            <View className={`rounded-full px-3 py-1 ${
              isLifetime ? 'bg-amber-100 dark:bg-amber-900' :
              isExpired ? 'bg-red-100 dark:bg-red-900' :
              'bg-green-100 dark:bg-green-900'
            }`}>
              <Text className={`text-sm font-medium ${
                isLifetime ? 'text-amber-800 dark:text-amber-200' :
                isExpired ? 'text-red-800 dark:text-red-200' :
                'text-green-800 dark:text-green-200'
              }`}>
                {t(planType === 'monthly' ? 'subscription.monthly_cap' : planType === 'annual' ? 'subscription.annual_cap' : 'subscription.lifetime_cap')}
                {isLifetime && ' 🎉'}
              </Text>
            </View>
            {willAutoRenew && (
              <View className="rounded-full bg-blue-100 dark:bg-blue-900 px-2 py-0.5">
                <Text className="text-xs font-medium text-blue-700 dark:text-blue-300">{t('label.auto_renews')}</Text>
              </View>
            )}
          </View>
          {daysUntilExpiry !== null && !isLifetime && (
            <Text className="mt-1 text-sm text-muted-foreground">
              {t('msg.days_remaining', { n: daysUntilExpiry })}
            </Text>
          )}
        </View>
      )}

      {/* ── Plan Selection ── */}
      <View className={`${isSm ? 'flex-row flex-wrap' : ''} mt-6 gap-3`}>
        {loadingPrices ? (
          <View className="items-center py-8">
            <ActivityIndicator size="small" color={ICON_MUTED} />
          </View>
        ) : (
          PLANS.map((plan, i) => {
            const isSelected = selectedPlan === plan.planKey;
            const isCurrent = isCurrentPlan(plan.planKey, planType);
            const restrictedOnIOS = isIOSGatedPlan(plan.planKey);
            const planDisplayPrice = displayPrice(prices, plan.planKey, plan.defaultPrice);
            const planSalePrice = saleActive ? salePrice(prices, plan.planKey) : null;

            return (
              <Pressable
                key={plan.planKey}
                style={isSm ? { width: '31%' } : undefined}
                onPress={() => !restrictedOnIOS && setSelectedPlan(plan.planKey)}
                disabled={restrictedOnIOS}
                className={`rounded-xl border-2 p-4 ${
                  restrictedOnIOS
                    ? 'border-border/50 bg-muted/30 opacity-60'
                    : isSelected
                      ? 'border-primary bg-primary/5'
                      : 'border-border bg-card'
                }`}
              >
                {/* Popular badge */}
                {i === 1 && !restrictedOnIOS && (
                  <View className="mb-2 self-start rounded-full bg-primary px-2 py-0.5">
                    <Text className="text-xs font-bold text-primary-foreground">{t('label.popular')}</Text>
                  </View>
                )}
                {/* Current plan badge */}
                {isCurrent && (
                  <View className="mb-2 self-start rounded-full bg-green-100 dark:bg-green-900 px-2 py-0.5">
                    <Text className="text-xs font-bold text-green-800 dark:text-green-200">{t('label.current_plan')}</Text>
                  </View>
                )}
                <View className="flex-row items-center justify-between">
                  <View className="flex-1">
                    <Text className="text-lg font-bold text-foreground">{t(plan.nameKey)}</Text>
                    <Text className="text-sm text-muted-foreground">{t(plan.intervalKey)}</Text>
                    {restrictedOnIOS && (
                      <Text className="text-xs text-muted-foreground mt-1 italic">
                        {t('msg.ios_lifetime_only')}
                      </Text>
                    )}
                  </View>
                  <View className="items-end">
                    {planSalePrice ? (
                      <View className="flex-row items-center gap-1">
                        <Text className="text-sm text-muted-foreground line-through">{planDisplayPrice}</Text>
                        <Text className="text-xl font-bold text-foreground">{planSalePrice}</Text>
                      </View>
                    ) : (
                      <Text className="text-xl font-bold text-foreground">{planDisplayPrice}</Text>
                    )}
                  </View>
                </View>
                {isSelected && !restrictedOnIOS && (
                  <View className="mt-3 gap-1">
                    {plan.benefits.map((key) => (
                      <View key={key} className="flex-row items-center gap-1.5">
                        <Check size={14} color={ICON_PRIMARY} />
                        <Text className="text-xs text-muted-foreground">{t(key)}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </Pressable>
            );
          })
        )}
      </View>

      {/* ── Purchase (store billing only, SPEC-014) ── */}
      {IAP_AVAILABLE ? (
        selectedPlan === 'lifetime' && selectedPlanData && (
          <View className="mt-8 rounded-xl border border-border bg-card p-4">
            <View className="flex-row items-center gap-2 mb-4">
              <Apple size={20} color={ICON_PRIMARY} />
              <Text className="text-base font-semibold text-foreground">{t('title.choose_payment_method')}</Text>
            </View>

            {activeNonTrial ? (
              <View className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 items-center">
                <AlertCircle size={28} color={ICON_WARNING} />
                <Text className="mt-2 text-center text-sm font-medium text-foreground">
                  {t('msg.cancel_existing_subscription_first')}
                </Text>
                <Pressable
                  onPress={() => router.push('/(tabs)/(me)/profile' as any)}
                  className="mt-4 rounded-lg border border-border px-4 py-2"
                >
                  <Text className="text-sm font-medium text-foreground">
                    {t('action.view_profile')}
                  </Text>
                </Pressable>
              </View>
            ) : isLifetimeOwner ? (
              <View className="rounded-lg border border-border bg-muted/40 p-4 items-center">
                <Crown size={28} color={ICON_PRIMARY} />
                <Text className="mt-2 text-center text-sm font-medium text-foreground">
                  {t('msg.already_lifetime')}
                </Text>
              </View>
            ) : (
              <View className="gap-3">
                {/* Apple In-App Purchase (iOS only — lifetime) */}
                <Pressable
                  onPress={handleIapPurchase}
                  disabled={iapProcessing}
                  className="flex-row items-center justify-between rounded-lg bg-black dark:bg-gray-800 px-4 py-3"
                >
                  <View className="flex-row items-center gap-2">
                    <Apple size={18} color={ICON_ON_PRIMARY} />
                    <Text className="text-sm font-semibold text-white">{t('payment.apple_pay')}</Text>
                  </View>
                  {iapProcessing ? (
                    <ActivityIndicator size="small" color={ICON_ON_PRIMARY} />
                  ) : (
                    <View className="flex-row items-center gap-1">
                      <Text className="text-xs text-white/70">
                        {lifetimeSalePrice ?? displayPrice(prices, 'lifetime', '$169')}
                      </Text>
                      <ArrowRight size={14} color={ICON_ON_PRIMARY} />
                    </View>
                  )}
                </Pressable>
              </View>
            )}

            {/* Restore Purchases (iOS) — hidden for lifetime owners (A5) */}
            {!isLifetimeOwner && (
              <Pressable
                onPress={handleRestorePurchases}
                disabled={restoring}
                className="mt-3 flex-row items-center justify-center gap-1.5 rounded-lg border border-border px-4 py-2.5"
              >
                {restoring ? (
                  <ActivityIndicator size="small" color={ICON_MUTED} />
                ) : (
                  <RefreshCw size={16} color={ICON_MUTED} />
                )}
                <Text className="text-sm text-muted-foreground">{t('action.restore_purchases')}</Text>
              </Pressable>
            )}

            {/* Error */}
            {error && (
              <View className="mt-4 flex-row items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
                <AlertCircle size={16} color={ICON_PRIMARY} />
                <Text className="text-sm text-destructive flex-1">{error}</Text>
              </View>
            )}

            {/* Money-back guarantee */}
            <View className="mt-4 flex-row items-center justify-center gap-1 flex-wrap">
              <Text className="text-center text-xs text-muted-foreground">
                {t('msg.money_back_guarantee')}
              </Text>
              <Pressable onPress={() => Linking.openURL('mailto:jon.long@zerotohero.ca')}>
                <Text className="text-xs text-primary underline">{t('action.contact_us')}</Text>
              </Pressable>
            </View>
          </View>
        )
      ) : (
        <View className="mt-8 rounded-xl border border-border bg-card p-4">
          <Text className="text-sm text-muted-foreground mb-4">
            {t('msg.upgrade_to_pro_banner')}
          </Text>
          <Pressable
            onPress={() => Linking.openURL('https://languageplayer.io/go-pro')}
            className="flex-row items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-3"
          >
            <Text className="text-sm font-semibold text-primary-foreground">{t('msg.buy_on_website')}</Text>
            <ArrowRight size={14} color={ICON_ON_PRIMARY} />
          </Pressable>

          {error && (
            <View className="mt-4 flex-row items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
              <AlertCircle size={16} color={ICON_PRIMARY} />
              <Text className="text-sm text-destructive flex-1">{error}</Text>
            </View>
          )}

          {/* Money-back guarantee */}
          <View className="mt-4 flex-row items-center justify-center gap-1 flex-wrap">
            <Text className="text-center text-xs text-muted-foreground">
              {t('msg.money_back_guarantee')}
            </Text>
            <Pressable onPress={() => Linking.openURL('mailto:jon.long@zerotohero.ca')}>
              <Text className="text-xs text-primary underline">{t('action.contact_us')}</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Features */}
      <View className="mt-8 rounded-xl border border-border bg-card p-4">
        <Text className="mb-3 text-sm font-semibold text-foreground">{t('pro.features_title')}</Text>
        {FEATURE_KEYS.map((key) => (
          <View key={key} className="flex-row items-center gap-2 py-1.5">
            <Check size={16} color={ICON_PRIMARY} />
            <Text className="text-sm text-foreground">{t(key)}</Text>
          </View>
        ))}
      </View>

      <Text className="mt-6 text-center text-xs text-muted-foreground">
        {t('msg.contact_support_email', { email: 'jon.long@zerotohero.ca' })}
      </Text>
      </ScrollView>
    </PageContainer>
  );
}
