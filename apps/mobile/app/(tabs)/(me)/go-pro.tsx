import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Linking, Platform } from 'react-native';
import { Button, buttonTextClass } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Pressable } from '@/components/ui/pressable';
import { useRouter } from 'expo-router';
import { useT } from '@/hooks/use-t';
import { localizedError } from '@/lib/errors';
import { useResponsive } from '@/hooks/use-responsive';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { PYTHON_API_URL } from '@/lib/api-url';
import { IAP_AVAILABLE, ANDROID_IAP_PRODUCT_ID, getStorePrice, initiatePurchase, finishPurchaseTransaction, restorePurchases, connectIap, setPurchaseHandler, type StorePrice } from '@/lib/iap';
import { SALE_DISCOUNT, findRegularPrice, formatPriceAmount, getSaleDiscount, hasStoreDiscount, isPlanOnSale, CONTENT_L2_COUNT } from '@langplayer/shared';
import type { StripePrice } from '@langplayer/shared';
import { useSaleWindow, formatSaleDate } from '@/hooks/use-sale';
import { useLanguage } from '@/contexts/LanguageContext';
import { Crown, Check, ArrowRight, AlertCircle, Apple, RefreshCw, CreditCard } from 'lucide-react-native';
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

/** Regular (non-sale) USD price for a plan card, from the fetched price rows,
 *  falling back to the hardcoded default before the fetch resolves.
 *
 *  Uses `findRegularPrice` rather than the loose `findUsdPrice`, because the
 *  latter matches any `status=current` row for the currency — including a sale
 *  row if ops ever flips one to `current`. A fallback that renders the regular
 *  price must never accidentally render a discounted one. */
function displayPrice(prices: StripePrice[], planKey: string, defaultPrice: string): string {
  const regular = findRegularPrice(prices, planKey, 'usd');
  if (regular) return `$${formatPriceAmount(regular.amount)}`;
  return defaultPrice;
}

/** Our own regular price, formatted for the currency the store reported, for
 *  the struck-through reference beside a discounted store price. Only used when
 *  a real discount has been proven (see `planPrice`), so it is never shown next
 *  to a full price. */
function regularReference(prices: StripePrice[], storeCurrency: string): string | null {
  const currency = storeCurrency?.toLowerCase();
  if (currency !== 'usd' && currency !== 'cny') return null;
  const regular = findRegularPrice(prices, 'lifetime', currency);
  if (!regular) return null;
  return `${currency === 'usd' ? '$' : '¥'}${formatPriceAmount(regular.amount)}`;
}

/**
 * The price a plan card (and the IAP button) shows.
 *
 * ⚠️ On mobile the ONLY purchase path is store billing, so for lifetime the
 * authoritative price is whatever StoreKit / Play Billing reports — never a
 * price this app computed. During a sale the store price is changed by hand in
 * App Store Connect / Play Console, and reading it back here means the button
 * can only ever display what the purchase sheet will charge.
 *
 * `regular` (the struck-through reference) is populated ONLY while the sale
 * window is open AND the store's own number proves a reduction
 * (`hasStoreDiscount`). So the sale chrome can never appear outside the sale,
 * and an unchanged console price can never be paired with a "50% off" claim.
 * When the store cannot be queried at all (Expo Go, offline, SKU not
 * configured) this falls back to the regular USD price, which makes no discount
 * claim either — the displayed `current` price is always the truth about what
 * will be charged.
 */
function planPrice(
  prices: StripePrice[],
  planKey: string,
  defaultPrice: string,
  storePrice: StorePrice | null,
  saleOpen: boolean,
): { current: string; regular: string | null } {
  if (planKey === 'lifetime' && storePrice?.displayPrice) {
    return {
      current: storePrice.displayPrice,
      regular:
        saleOpen && hasStoreDiscount(prices, planKey, storePrice)
          ? regularReference(prices, storePrice.currency)
          : null,
    };
  }
  return { current: displayPrice(prices, planKey, defaultPrice), regular: null };
}

/** Check if a non-lifetime plan is gated on store-billing platforms
 *  (only lifetime is available via Apple IAP / Play Billing). */
function isStoreGatedPlan(planKey: string): boolean {
  return (Platform.OS === 'ios' || Platform.OS === 'android') && planKey !== 'lifetime';
}

/** Check if the viewer already has this plan. */
function isCurrentPlan(planKey: string, planType: string | null): boolean {
  return planKey === planType;
}

/** POST a store purchase to the correct backend endpoint.
 *  iOS → /in_app_purchase_success (receipt/JWS); Android → /play_billing_success
 *  (purchase token). SPEC-068 Step 3. */
async function sendPurchaseForValidation(
  userId: string,
  purchase: { platform?: string; purchaseToken?: string | null },
  receipt?: string,
  jws?: string,
): Promise<any> {
  const isAndroid = purchase?.platform === 'android' || Platform.OS === 'android';
  const body = isAndroid
    ? {
        user_id: String(userId),
        purchase_token: jws ?? purchase?.purchaseToken ?? null,
        product_id: ANDROID_IAP_PRODUCT_ID,
      }
    : { user_id: String(userId), receipt, jws };
  const res = await fetch(
    isAndroid
      ? `${PYTHON_API_URL}/play_billing_success`
      : `${PYTHON_API_URL}/in_app_purchase_success`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  return res.json();
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
  const [storePrice, setStorePrice] = useState<StorePrice | null>(null);

  // Fetch Stripe prices from backend
  useEffect(() => {
    fetch(`${PYTHON_API_URL}/stripe-prices`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setPrices(Array.isArray(data) ? data : []))
      .catch(() => setError(t('msg.price_load_error')))
      .finally(() => setLoadingPrices(false));
  }, [t]);

  // The live store price is what an IAP button may display (see `planPrice`).
  useEffect(() => {
    let cancelled = false;
    getStorePrice()
      .then((price) => {
        if (!cancelled) setStorePrice(price);
      })
      .catch(() => {
        /* getStorePrice never rejects, but a null result is handled by
           `planPrice` falling back to the regular price. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
        const data = await sendPurchaseForValidation(String(user.id), purchase, receipt, jws);
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
              : msg?.includes('could not be verified from Apple') ||
                  msg?.includes('could not be verified from Google')
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

  // ── Sale ──
  // The window is the authority for WHEN the sale runs (Classic's
  // `SALE` constant); the price rows remain the authority for HOW MUCH.
  const { open: saleOpen, endsAt } = useSaleWindow();
  const { l1Lang } = useLanguage();
  const lifetimePriced = planPrice(prices, 'lifetime', '$169', storePrice, saleOpen);
  /** Whether the store has confirmed the discount — see `showSale` below. */
  const storeDiscountConfirmed =
    saleOpen && hasStoreDiscount(prices, 'lifetime', storePrice);
  // Percentage from the price rows, falling back to the declared constant so
  // the banner still reads correctly before `/stripe-prices` resolves.
  const salePct =
    getSaleDiscount(prices, 'lifetime') ?? Math.round((1 - SALE_DISCOUNT) * 100);

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

  /** Whether to render the sale banner at all. Classic hides it for lifetime
   *  owners (`components/Sale.vue`: `subscription.type !== 'lifetime'`).
   *
   *  ⚠️ `storeDiscountConfirmed` gates the *discount claim* separately. Mobile
   *  has no non-store purchase path, so until the App Store Connect / Play
   *  Console price is lowered, an in-app "50% off" would be a promise the
   *  purchase sheet cannot keep. The banner then degrades to the headline and
   *  the deadline, and the card shows the full store price with no
   *  strike-through. */
  const showSale = saleOpen && isPlanOnSale('lifetime') && !isLifetimeOwner;

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
        const data = await sendPurchaseForValidation(String(user.id), purchase, receipt, jws);

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
        <Text className="mt-3 text-3xl font-bold text-foreground">{t('action.go_pro')}</Text>
        <Text className="mt-2 text-center text-base text-muted-foreground">
          {t('pro.desc', { count: CONTENT_L2_COUNT })}
        </Text>
      </View>

      {/* ── Sale Banner (Mid-Autumn) ── */}
      {showSale && (
        <View className="mt-4 rounded-xl bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 p-3">
          <Text className="text-center text-sm font-bold text-amber-900 dark:text-amber-100">
            🥮 {t('msg.sale_mid_autumn')}
          </Text>
          {/* The discount is only claimed once the store price proves it — see
              `showSale`. Because mobile has no non-store purchase path, the
              banner never quotes a price: the card and the IAP button show the
              store's own localized price string. */}
          {storeDiscountConfirmed && (
            <Text className="mt-1 text-center text-xs text-amber-700 dark:text-amber-300">
              {t('msg.sale_discount', { pct: salePct })}
            </Text>
          )}
          <Text className="mt-0.5 text-center text-xs text-amber-700 dark:text-amber-300">
            {t('msg.sale_offer_ends', { date: formatSaleDate(endsAt, l1Lang.code) })}
          </Text>
        </View>
      )}

      {/* ── Current Subscription Status ── */}
      {subLoaded && isPro && (
        <Card className="mt-6">
          <CardHeader>
            <View className="flex-row items-center gap-2">
              <Crown size={18} color={ICON_WARNING} />
              <CardTitle>{t('title.subscription')}</CardTitle>
            </View>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>
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
            const restrictedOnStore = isStoreGatedPlan(plan.planKey);
            // Store price for lifetime (the only purchase path on mobile);
            // regular USD row otherwise.
            const { current: planDisplayPrice, regular: planRegularPrice } = planPrice(
              prices,
              plan.planKey,
              plan.defaultPrice,
              storePrice,
              saleOpen,
            );
            const planOnSale = !!planRegularPrice;

            return (
              <Pressable
                key={plan.planKey}
                style={isSm ? { width: '31%' } : undefined}
                onPress={() => !restrictedOnStore && setSelectedPlan(plan.planKey)}
                disabled={restrictedOnStore}
                className={`rounded-xl border-2 p-4 ${
                  restrictedOnStore
                    ? 'border-border/50 bg-muted/30 opacity-60'
                    : isSelected
                      ? 'border-primary bg-primary/5'
                      : 'border-border bg-card'
                }`}
              >
                {/* Popular badge */}
                {i === 1 && !restrictedOnStore && (
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
                    {restrictedOnStore && (
                      <Text className="text-xs text-muted-foreground mt-1 italic">
                        {t('msg.store_lifetime_only')}
                      </Text>
                    )}
                  </View>
                  <View className="items-end">
                    {planOnSale ? (
                      <View className="flex-row items-center gap-1">
                        <Text className="text-sm text-muted-foreground line-through">{planRegularPrice}</Text>
                        <Text className="text-2xl font-bold text-foreground">{planDisplayPrice}</Text>
                      </View>
                    ) : (
                      <Text className="text-2xl font-bold text-foreground">{planDisplayPrice}</Text>
                    )}
                  </View>
                </View>
                {isSelected && !restrictedOnStore && (
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

      {/* ── Purchase (store billing only, SPEC-014 / SPEC-068) ── */}
      {IAP_AVAILABLE && selectedPlan === 'lifetime' && selectedPlanData && (
          <Card className="mt-8">
            <CardHeader>
              <View className="flex-row items-center gap-2 mb-4">
                {Platform.OS === 'android' ? (
                  <CreditCard size={20} color={ICON_PRIMARY} />
                ) : (
                  <Apple size={20} color={ICON_PRIMARY} />
                )}
                <CardTitle className="text-lg">{t('title.choose_payment_method')}</CardTitle>
              </View>
            </CardHeader>
            <CardContent>
            {activeNonTrial ? (
              <View className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 items-center">
                <AlertCircle size={28} color={ICON_WARNING} />
                <Text className="mt-2 text-center text-sm font-medium text-foreground">
                  {t('msg.cancel_existing_subscription_first')}
                </Text>
                <Button
                  onPress={() => router.push('/(tabs)/(me)/profile' as any)}
                  variant="outline"
                  className="mt-4"
                >
                  <Text className={buttonTextClass('outline')}>
                    {t('action.view_profile')}
                  </Text>
                </Button>
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
                {/* Store billing (lifetime): Apple IAP on iOS, Play Billing on Android */}
                <Pressable
                  onPress={handleIapPurchase}
                  disabled={iapProcessing}
                  className={`flex-row items-center justify-between rounded-lg px-4 py-3 ${
                    Platform.OS === 'android' ? 'bg-primary' : 'bg-black dark:bg-gray-800'
                  }`}
                >
                  <View className="flex-row items-center gap-2">
                    {Platform.OS === 'android' ? (
                      <CreditCard size={18} color={ICON_ON_PRIMARY} />
                    ) : (
                      <Apple size={18} color={ICON_ON_PRIMARY} />
                    )}
                    <Text className={`text-sm font-semibold ${
                      Platform.OS === 'android' ? 'text-primary-foreground' : 'text-white'
                    }`}>
                      {Platform.OS === 'android' ? t('option.google_play') : t('payment.apple_pay')}
                    </Text>
                  </View>
                  {iapProcessing ? (
                    <ActivityIndicator size="small" color={ICON_ON_PRIMARY} />
                  ) : (
                    <View className="flex-row items-center gap-1">
                      <Text className="text-sm text-white/70">
                        {lifetimePriced.current}
                      </Text>
                      <ArrowRight size={14} color={ICON_ON_PRIMARY} />
                    </View>
                  )}
                </Pressable>
              </View>
            )}

            {/* Restore Purchases (iOS / Android) — hidden for lifetime owners (A5) */}
            {!isLifetimeOwner && (
              <Button
                onPress={handleRestorePurchases}
                disabled={restoring}
                variant="outline"
                className="mt-3"
              >
                {restoring ? (
                  <ActivityIndicator size="small" color={ICON_MUTED} />
                ) : (
                  <RefreshCw size={16} color={ICON_MUTED} />
                )}
                <Text className={buttonTextClass('outline')}>{t('action.restore_purchases')}</Text>
              </Button>
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
            </CardContent>
          </Card>
      )}

      {/* Features */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>{t('pro.features_title')}</CardTitle>
        </CardHeader>
        <CardContent>
          {FEATURE_KEYS.map((key) => (
            <View key={key} className="flex-row items-center gap-2 py-1.5">
              <Check size={16} color={ICON_PRIMARY} />
              <Text className="text-sm text-foreground">{t(key)}</Text>
            </View>
          ))}
        </CardContent>
      </Card>

      <Text className="mt-6 text-center text-xs text-muted-foreground">
        {t('msg.contact_support_email', { email: 'jon.long@zerotohero.ca' })}
      </Text>
      </ScrollView>
    </PageContainer>
  );
}
