import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Linking } from 'react-native';
import { useT } from '@/hooks/use-t';
import { useAuth } from '@/contexts/AuthContext';
import { PYTHON_API_URL } from '@/lib/api-url';
import { Crown, Check, ArrowRight, CreditCard, AlertCircle } from 'lucide-react-native';
import { ICON_MUTED, ICON_PRIMARY } from '@/lib/theme-colors';

// ── Types ──

interface StripePrice {
  plan: string;
  type: string;
  status: string;
  mode: string;
  currency: string;
  amount: number;
  id: string;
  paymentLink?: string;
}

interface PlanCard {
  nameKey: 'subscription.monthly_cap' | 'subscription.annual_cap' | 'subscription.lifetime_cap';
  price: string;
  interval: string;
  planKey: string;
  benefits: string[];
}

const PLANS: PlanCard[] = [
  {
    nameKey: 'subscription.monthly_cap',
    price: '$10',
    interval: '/mo',
    planKey: 'monthly',
    benefits: ['pro.feature_transcripts', 'pro.feature_examples', 'pro.feature_saved_words'],
  },
  {
    nameKey: 'subscription.annual_cap',
    price: '$90',
    interval: '/yr',
    planKey: 'annual',
    benefits: ['pro.feature_transcripts', 'pro.feature_examples', 'pro.feature_saved_words', 'pro.feature_srs'],
  },
  {
    nameKey: 'subscription.lifetime_cap',
    price: '$169',
    interval: 'one-time',
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

// ── Helpers ──

function findUsdPrice(prices: StripePrice[], plan: string): StripePrice | undefined {
  return prices.find((p) => p.plan === plan && p.currency === 'usd' && p.status === 'current');
}

function findCnyPrice(prices: StripePrice[], plan: string): StripePrice | undefined {
  return prices.find((p) => p.plan === plan && p.currency === 'cny' && p.status === 'current');
}

// ── Component ──

export default function GoProScreen() {
  const t = useT();
  const { user } = useAuth();

  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [prices, setPrices] = useState<StripePrice[]>([]);
  const [loadingPrices, setLoadingPrices] = useState(true);
  const [checkingOut, setCheckingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch Stripe prices from backend
  useEffect(() => {
    fetch(`${PYTHON_API_URL}/stripe-prices`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setPrices(Array.isArray(data) ? data : []))
      .catch(() => setError('Could not load pricing. Please try again later.'))
      .finally(() => setLoadingPrices(false));
  }, [t]);

  const selectedPlanData = PLANS.find((p) => p.planKey === selectedPlan);
  const cnyPrice = selectedPlan ? findCnyPrice(prices, selectedPlan) : undefined;
  const cnyPaymentLink = cnyPrice?.paymentLink
    ? `${cnyPrice.paymentLink}?client_reference_id=${user?.id ?? ''}`
    : null;

  // ── Stripe Credit Card checkout ──
  const handleStripeCheckout = useCallback(async () => {
    if (!selectedPlan || !user?.id) return;
    setCheckingOut(true);
    setError(null);

    try {
      const usdPrice = findUsdPrice(prices, selectedPlan);
      if (!usdPrice) {
        setError('No USD price available for this plan. Please try another payment method.');
        setCheckingOut(false);
        return;
      }

      const res = await fetch(`${PYTHON_API_URL}/create-stripe-checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          price_id: usdPrice.id,
          user_id: String(user.id),
          host: 'https://languageplayer.io',
          mode: usdPrice.mode,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err?.error ?? 'Could not create checkout session. Please try again.');
        setCheckingOut(false);
        return;
      }

      const { url } = await res.json();
      if (url) {
        await Linking.openURL(url);
      } else {
        setError('No checkout URL returned. Please try again.');
      }
    } catch (err: any) {
      setError(err?.message ?? 'An unexpected error occurred.');
    } finally {
      setCheckingOut(false);
    }
  }, [selectedPlan, user?.id, prices, t]);

  // ── WeChat / Alipay ──
  const openPaymentLink = useCallback(async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      setError('Could not open the link.');
    }
  }, [t]);

  return (
    <ScrollView className="flex-1 bg-background px-4 py-8">
      {/* Header */}
      <View className="items-center">
        <Crown size={48} color={ICON_PRIMARY} />
        <Text className="mt-3 text-2xl font-bold text-foreground">{t('action.go_pro')}</Text>
        <Text className="mt-2 text-center text-sm text-muted-foreground">{t('pro.desc')}</Text>
      </View>

      {/* ── Plan Selection ── */}
      <View className="mt-8 gap-3">
        {loadingPrices ? (
          <View className="items-center py-8">
            <ActivityIndicator size="small" color={ICON_MUTED} />
          </View>
        ) : (
          PLANS.map((plan, i) => {
            const isSelected = selectedPlan === plan.planKey;
            return (
              <Pressable
                key={plan.planKey}
                onPress={() => setSelectedPlan(plan.planKey)}
                className={`rounded-xl border-2 p-4 ${
                  isSelected ? 'border-primary bg-primary/5' : 'border-border bg-card'
                }`}
              >
                {i === 1 && (
                  <View className="mb-2 self-start rounded-full bg-primary px-2 py-0.5">
                    <Text className="text-xs font-bold text-primary-foreground">{t('label.popular')}</Text>
                  </View>
                )}
                <View className="flex-row items-center justify-between">
                  <View>
                    <Text className="text-lg font-bold text-foreground">{t(plan.nameKey)}</Text>
                    <Text className="text-sm text-muted-foreground">{plan.interval}</Text>
                  </View>
                  <Text className="text-xl font-bold text-foreground">{plan.price}</Text>
                </View>
                {isSelected && (
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

      {/* ── Payment Methods ── */}
      {selectedPlan && selectedPlanData && (
        <View className="mt-8 rounded-xl border border-border bg-card p-4">
          <View className="flex-row items-center gap-2 mb-4">
            <CreditCard size={20} color={ICON_PRIMARY} />
            <Text className="text-base font-semibold text-foreground">{t('title.choose_payment_method')}</Text>
          </View>

          <View className="gap-3">
            {/* Credit Card (USD) */}
            {findUsdPrice(prices, selectedPlan) && (
              <Pressable
                onPress={handleStripeCheckout}
                disabled={checkingOut}
                className="flex-row items-center justify-between rounded-lg bg-primary px-4 py-3"
              >
                <View className="flex-row items-center gap-2">
                  <CreditCard size={18} color="#fff" />
                  <Text className="text-sm font-semibold text-primary-foreground">{t('payment.credit_card')}</Text>
                </View>
                {checkingOut ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <View className="flex-row items-center gap-1">
                    <Text className="text-xs text-primary-foreground/70">
                      {selectedPlanData.price} {selectedPlanData.interval}
                    </Text>
                    <ArrowRight size={14} color="#fff" />
                  </View>
                )}
              </Pressable>
            )}

            {/* WeChat Pay (CNY) */}
            {cnyPaymentLink && (
              <Pressable
                onPress={() => openPaymentLink(cnyPaymentLink)}
                className="flex-row items-center justify-between rounded-lg bg-green-600 px-4 py-3"
              >
                <View className="flex-row items-center gap-2">
                  <Text className="text-lg">💬</Text>
                  <Text className="text-sm font-semibold text-white">{t('payment.wechat_pay')}</Text>
                </View>
                <View className="flex-row items-center gap-1">
                  <Text className="text-xs text-white/80">¥{cnyPrice?.amount}</Text>
                  <ArrowRight size={14} color="#fff" />
                </View>
              </Pressable>
            )}

            {/* Alipay (CNY) */}
            {cnyPaymentLink && (
              <Pressable
                onPress={() => openPaymentLink(cnyPaymentLink)}
                className="flex-row items-center justify-between rounded-lg bg-blue-600 px-4 py-3"
              >
                <View className="flex-row items-center gap-2">
                  <Text className="text-lg">🔵</Text>
                  <Text className="text-sm font-semibold text-white">{t('payment.alipay')}</Text>
                </View>
                <View className="flex-row items-center gap-1">
                  <Text className="text-xs text-white/80">¥{cnyPrice?.amount}</Text>
                  <ArrowRight size={14} color="#fff" />
                </View>
              </Pressable>
            )}

            {/* PayPal — lifetime only */}
            {selectedPlan === 'lifetime' && (
              <Pressable
                onPress={() => openPaymentLink('https://languageplayer.io/go-pro')}
                className="rounded-lg border border-border bg-muted/30 px-4 py-3"
              >
                <Text className="text-sm text-center text-muted-foreground">
                  {t('msg.paypal_available')}
                </Text>
                <Text className="text-sm text-center font-medium text-primary mt-1">
                  {t('msg.use_paypal_classic')}
                </Text>
              </Pressable>
            )}
          </View>

          {/* Error */}
          {error && (
            <View className="mt-4 flex-row items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
              <AlertCircle size={16} color={ICON_PRIMARY} />
              <Text className="text-sm text-destructive flex-1">{error}</Text>
            </View>
          )}

          {/* Money-back guarantee */}
          <Text className="mt-4 text-center text-xs text-muted-foreground">
            14-day money-back guarantee. Questions? Contact: jon.long@zerotohero.ca
          </Text>
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
        Contact: jon.long@zerotohero.ca
      </Text>
    </ScrollView>
  );
}
