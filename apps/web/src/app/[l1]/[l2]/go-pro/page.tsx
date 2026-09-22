'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/providers/language-provider';
import { useT } from '@/hooks/use-t';
import { useSubscriptionContext } from '@/providers/subscription-provider';
import { PYTHON_API_URL } from '@/lib/api-url';
import { getStripePrices, isStripeTestMode, type StripePrice } from '@/lib/prices';
import {
  findRegularPrice,
  findSalePrice,
  formatPriceAmount,
  getSaleDiscount,
  resolvePlanPriceForWindow,
} from '@langplayer/shared';
import { useSaleWindow, formatSaleDate } from '@/hooks/use-sale';
import { log } from '@/lib/logger';
import {
  Crown,
  Check,
  ArrowRight,
  Loader2,
  CreditCard,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

// ── Constants ──

// NEXT_PUBLIC_STRIPE_TEST=true switches to the Stripe test publishable key +
// test prices for local payment E2E (SPEC-054 Phase 2).
const STRIPE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_TEST === 'true'
  ? 'pk_test_kjsYSddsuYbdHnea22KggNe4'
  : 'pk_live_9lnc7wrGHtcFdPKIWZdy9p17';

/** The frontend host, used for post-payment redirect URLs. */
const APP_HOST = typeof window !== 'undefined' ? window.location.origin : 'https://languageplayer.io';

interface PlanCard {
  nameKey: 'plan.monthly' | 'plan.annual' | 'plan.lifetime';
  price: string;
  intervalKey: 'interval.monthly' | 'interval.annual' | null;
  descKey: 'plan.monthly_desc' | 'plan.annual_desc' | 'plan.lifetime_desc';
  benefitKeys: string[];
  planKey: string;
}

const PLANS: PlanCard[] = [
  {
    nameKey: 'plan.monthly',
    price: '$10',
    intervalKey: 'interval.monthly',
    descKey: 'plan.monthly_desc',
    benefitKeys: ['plan.interactive_transcripts', 'plan.unlimited_examples', 'plan.all_pro_features'],
    planKey: 'monthly',
  },
  {
    nameKey: 'plan.annual',
    price: '$90',
    intervalKey: 'interval.annual',
    descKey: 'plan.annual_desc',
    benefitKeys: ['plan.interactive_transcripts', 'plan.unlimited_examples', 'plan.all_pro_features', 'title.best_value'],
    planKey: 'annual',
  },
  {
    nameKey: 'plan.lifetime',
    price: '$169',
    intervalKey: null,
    descKey: 'plan.lifetime_desc',
    benefitKeys: ['plan.interactive_transcripts', 'plan.unlimited_examples', 'plan.all_pro_features', 'msg.pay_once_forever'],
    planKey: 'lifetime',
  },
];

// ── Sale helpers ──

/** The price row the checkout must send: the sale row while the sale applies,
 *  else the regular row.
 *
 *  ⚠️ In Stripe test mode `findSalePrice()` finds nothing, because the sale
 *  rows in `prices.csv` carry no `test_price_id`. `resolvePlanPriceForWindow`
 *  then falls back to the regular price — logged here so the fallback is
 *  visible instead of silently charging more than the UI advertised. */
function checkoutPrice(
  prices: StripePrice[],
  plan: string,
  currency: 'usd' | 'cny',
  saleOpen: boolean,
): StripePrice | undefined {
  const { price, onSale } = resolvePlanPriceForWindow(prices, plan, currency, saleOpen);
  if (saleOpen && !onSale && isStripeTestMode()) {
    log(`[LP Web] sale: no ${currency} test price id for "${plan}" — using the regular price`);
  }
  return price;
}

/** Card display prices for a plan, derived from the fetched rows so the card
 *  can never disagree with the checkout. The hardcoded `PLANS[].price` is only
 *  the pre-fetch fallback. */
function cardPrices(
  prices: StripePrice[],
  plan: string,
  saleOpen: boolean,
): { regular?: string; sale?: string } {
  const regularRow = findRegularPrice(prices, plan, 'usd');
  const saleRow = saleOpen ? findSalePrice(prices, plan, 'usd') : undefined;
  return {
    regular: regularRow ? `$${formatPriceAmount(regularRow.amount)}` : undefined,
    sale: saleRow ? `$${formatPriceAmount(saleRow.amount)}` : undefined,
  };
}

export default function GoProPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { l1, l2 } = useLanguage();
  const t = useT();
  const userId = session?.user?.id;
  const { sub: subscription } = useSubscriptionContext();

  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [prices, setPrices] = useState<StripePrice[]>([]);
  const [loadingPrices, setLoadingPrices] = useState(true);
  const [checkingOut, setCheckingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sale window, resolved against the device clock after mount (never during
  // SSR — see useSaleWindow). `saleOpen` drives both the banner and which
  // price id the checkout sends, so the two can never disagree.
  const { open: saleOpen, endsAt } = useSaleWindow();
  const saleDiscountPct = saleOpen ? getSaleDiscount(prices, 'lifetime') : null;
  const lifetimeSaleUsd = saleOpen ? findSalePrice(prices, 'lifetime', 'usd') : undefined;
  // Classic hides the sale when the viewer already owns lifetime
  // (`components/Sale.vue`: `subscription.type !== 'lifetime'`).
  const showSale = saleOpen && subscription?.type !== 'lifetime';

  // Redirect unauthenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push(`/login?redirect=/${l1.code}/${l2.code}/go-pro`);
    }
  }, [status, router, l1.code, l2.code]);

  // Load Stripe prices
  useEffect(() => {
    getStripePrices()
      .then(setPrices)
      .catch(() => setError(t('msg.pricing_load_error')))
      .finally(() => setLoadingPrices(false));
  }, []);

  const selectedPlanData = PLANS.find(p => p.planKey === selectedPlan);

  // Purchase gating (ARCH-022, commit a8471782): an active auto-renewing
  // subscription blocks new purchases until cancelled — matches Classic.
  // Non-trial + unexpired + payment_customer_id set (i.e. live Stripe
  // auto-renew). Lifetime rows have no payment_customer_id and instead get
  // the "already owned" state (see isLifetimeOwner below).
  const activeNonTrial = !!subscription
    && subscription.type !== 'trial'
    && !!subscription.payment_customer_id
    && (
      subscription.type === 'lifetime'
      || (subscription.expires_on
        && new Date(subscription.expires_on.replace(' ', 'T')) > new Date())
    );

  // ── Stripe Credit Card checkout ──
  const handleStripeCheckout = useCallback(async () => {
    if (!selectedPlan || !userId) return;
    setCheckingOut(true);
    setError(null);

    try {
      // Sale-aware: sends the sale price id while the window is open, so the
      // amount Stripe charges matches the card and the banner.
      const usdPrice = checkoutPrice(prices, selectedPlan, 'usd', saleOpen);
      if (!usdPrice) {
        setError(t('msg.no_usd_price'));
        setCheckingOut(false);
        return;
      }
      log(`[LP Web] checkout: plan=${selectedPlan} price=${usdPrice.id} amount=${usdPrice.amount} sale=${saleOpen}`);

      // Ask the Python backend to create a Stripe Checkout Session
      const res = await fetch(`${PYTHON_API_URL}/create-stripe-checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          price_id: usdPrice.id,
          user_id: String(userId),
          host: APP_HOST,
          mode: usdPrice.mode,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err?.error ?? t('msg.checkout_session_error'));
        setCheckingOut(false);
        return;
      }

      const { url } = await res.json();
      if (url) {
        window.location.href = url; // redirect to Stripe-hosted checkout
      } else {
        setError(t('msg.no_checkout_url'));
        setCheckingOut(false);
      }
    } catch (err: any) {
      setError(err?.message ?? t('msg.unexpected_error'));
      setCheckingOut(false);
    }
  }, [selectedPlan, userId, prices, saleOpen, t]);

  // ── WeChat / Alipay (CNY Payment Link) ──
  // Sale-aware: the CNY sale row carries its own Payment Link, and the Stripe
  // Payment Link is what fixes the amount charged — so the link must be the
  // sale link for the amount to match the displayed sale price.
  const cnyPrice = selectedPlan ? checkoutPrice(prices, selectedPlan, 'cny', saleOpen) : undefined;
  const cnyPaymentLink = cnyPrice?.paymentLink
    ? `${cnyPrice.paymentLink}?client_reference_id=${userId ?? ''}`
    : null;

  // Card (USD) checkout price — the same row `handleStripeCheckout` sends.
  const usdPrice = selectedPlan ? checkoutPrice(prices, selectedPlan, 'usd', saleOpen) : undefined;

  // ── Loading / unauthenticated states ──
  if (status === 'loading') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!session?.user) {
    return null; // will redirect
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold">{t('title.upgrade_to_pro')}</h1>
        <p className="mt-2 text-muted-foreground">
          {t('msg.upgrade_to_pro_desc')}
        </p>
      </div>

      {/* ── Sale Banner (Mid-Autumn) ── */}
      {showSale && (
        <div className="mb-8 rounded-xl border border-amber-200 bg-amber-50 p-4 text-center dark:border-amber-800 dark:bg-amber-950">
          <p className="text-base font-bold text-amber-900 dark:text-amber-100">
            🥮 {t('msg.sale_mid_autumn')}
          </p>
          {saleDiscountPct !== null && (
            <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">
              {lifetimeSaleUsd
                ? t('msg.sale_lifetime_price', {
                    pct: saleDiscountPct,
                    price: `$${formatPriceAmount(lifetimeSaleUsd.amount)}`,
                  })
                : t('msg.sale_discount', { pct: saleDiscountPct })}
            </p>
          )}
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
            {t('msg.sale_offer_ends', { date: formatSaleDate(endsAt, l1.code) })}
          </p>
        </div>
      )}

      {/* ── Plan Selection ── */}
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        {PLANS.map((plan) => {
          const isSelected = selectedPlan === plan.planKey;
          const { regular, sale } = cardPrices(prices, plan.planKey, showSale);
          const regularDisplay = regular ?? plan.price;
          return (
            <button
              key={plan.planKey}
              onClick={() => setSelectedPlan(plan.planKey)}
              className={`rounded-xl border-2 p-5 text-left transition-all ${
                isSelected
                  ? 'border-primary bg-primary/5 shadow-sm'
                  : 'border-border bg-card hover:border-primary/30'
              }`}
            >
              {sale && (
                <span className="mb-2 inline-block rounded-full bg-destructive px-2 py-0.5 text-xs font-bold text-destructive-foreground">
                  {t('msg.sale_mid_autumn')}
                </span>
              )}
              <p className="text-lg font-bold">{t(plan.nameKey)}</p>
              {sale ? (
                <p className="mt-1 flex items-baseline gap-2">
                  <span className="text-sm font-normal text-muted-foreground line-through">
                    {regularDisplay}
                  </span>
                  <span className="text-2xl font-bold text-red-600 dark:text-red-400">{sale}</span>
                </p>
              ) : (
                <p className="mt-1 text-2xl font-bold">
                  {regularDisplay}
                  {plan.intervalKey && <span className="text-sm font-normal text-muted-foreground">{t(plan.intervalKey)}</span>}
                </p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">{t(plan.descKey)}</p>
              <ul className="mt-3 space-y-1">
                {plan.benefitKeys.map((key) => (
                  <li key={key} className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Check className="h-3 w-3 shrink-0 text-green-500" />
                    {t(key)}
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>

      {/* ── Payment Methods ── */}
      {selectedPlan && selectedPlanData && (
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
            <CreditCard className="h-5 w-5" />
            {t('title.choose_payment_method')}
          </h2>

          {activeNonTrial ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-center">
              <AlertCircle className="mx-auto h-8 w-8 text-destructive" />
              <p className="mt-2 text-sm font-medium">
                {t('msg.cancel_existing_subscription_first')}
              </p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => router.push(`/${l1.code}/${l2.code}/profile`)}
              >
                {t('action.view_profile')}
              </Button>
            </div>
          ) : subscription?.type === 'lifetime' ? (
            <div className="rounded-lg border border-border bg-muted/40 p-4 text-center">
              <Crown className="mx-auto h-8 w-8 text-primary" />
              <p className="mt-2 text-sm font-medium">
                {t('msg.already_lifetime')}
              </p>
            </div>
          ) : (
          <div className="space-y-3">
            {/* Credit Card (USD) */}
            {usdPrice && (
              <Button
                onClick={handleStripeCheckout}
                disabled={checkingOut || loadingPrices}
                className="w-full justify-between"
                size="lg"
              >
                <span className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  {t('payment.credit_card')}
                </span>
                {checkingOut ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <span className="flex items-center gap-1 text-sm opacity-70">
                    ${formatPriceAmount(usdPrice.amount)}{selectedPlanData.intervalKey ? ` ${t(selectedPlanData.intervalKey)}` : ''}
                    <ArrowRight className="h-3 w-3" />
                  </span>
                )}
              </Button>
            )}

            {/* WeChat Pay (CNY) */}
            {cnyPaymentLink && (
              <a
                href={cnyPaymentLink}
                className="flex w-full items-center justify-between rounded-lg bg-green-600 px-4 py-3 text-white transition-colors hover:bg-green-700"
              >
                <span className="flex items-center gap-2 font-medium">
                  <span className="text-lg">💬</span>
                  {t('payment.wechat_pay')}
                </span>
                <span className="text-sm opacity-80">
                  ¥{formatPriceAmount(cnyPrice!.amount)} <ArrowRight className="inline h-3 w-3" />
                </span>
              </a>
            )}

            {/* Alipay (CNY) — same as WeChat, uses Payment Link */}
            {cnyPaymentLink && (
              <a
                href={cnyPaymentLink}
                className="flex w-full items-center justify-between rounded-lg bg-blue-600 px-4 py-3 text-white transition-colors hover:bg-blue-700"
              >
                <span className="flex items-center gap-2 font-medium">
                  <span className="text-lg">🔵</span>
                  {t('payment.alipay')}
                </span>
                <span className="text-sm opacity-80">
                  ¥{formatPriceAmount(cnyPrice!.amount)} <ArrowRight className="inline h-3 w-3" />
                </span>
              </a>
            )}

            {/* PayPal — lifetime only */}
            {selectedPlan === 'lifetime' && (
              <div className="rounded-lg border border-border bg-muted/30 p-4 text-center">
                <p className="text-sm text-muted-foreground">
                  {t('msg.paypal_available')}{' '}
                  <a
                    href="https://languageplayer.io/go-pro"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-primary underline"
                  >
                    {t('msg.use_paypal_classic')}
                  </a>
                </p>
              </div>
            )}
          </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Money-back guarantee */}
          <p className="mt-4 text-center text-xs text-muted-foreground">
            {t('msg.money_back_guarantee')}{' '}
            <a href="mailto:jon.long@zerotohero.ca" className="underline">
              {t('action.contact_us')}
            </a>
          </p>
        </div>
      )}
    </div>
  );
}
