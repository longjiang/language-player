'use client';

import { useEffect, useState } from 'react';
import { useLocale } from 'next-intl';
import { Check, Minus } from 'lucide-react';
import { useT } from '@/hooks/use-t';
import { useSaleWindow, formatSaleDate } from '@/hooks/use-sale';
import { getStripePrices, type StripePrice } from '@/lib/prices';
import {
  findRegularPrice,
  findSalePrice,
  formatPriceAmount,
  getSaleDiscount,
} from '@langplayer/shared';

type ComparisonValue = { kind: 'check' } | { kind: 'text'; key: string } | { kind: 'none' };

interface FeatureRow {
  labelKey: string;
  free: ComparisonValue;
  pro: ComparisonValue;
}

const FEATURE_ROWS: FeatureRow[] = [
  {
    labelKey: 'pricing.feature_library',
    free: { kind: 'check' },
    pro: { kind: 'check' },
  },
  {
    labelKey: 'pricing.feature_dictionary',
    free: { kind: 'check' },
    pro: { kind: 'check' },
  },
  {
    labelKey: 'pricing.feature_chinese_decomposition',
    free: { kind: 'check' },
    pro: { kind: 'check' },
  },
  {
    labelKey: 'pricing.feature_transcripts',
    free: { kind: 'text', key: 'pricing.free_transcripts' },
    pro: { kind: 'text', key: 'pricing.pro_transcripts' },
  },
  {
    labelKey: 'pricing.feature_word_examples',
    free: { kind: 'text', key: 'pricing.free_word_examples' },
    pro: { kind: 'text', key: 'pricing.pro_word_examples' },
  },
  {
    labelKey: 'pricing.feature_ai_explanations',
    free: { kind: 'none' },
    pro: { kind: 'check' },
  },
  {
    labelKey: 'pricing.feature_priority_support',
    free: { kind: 'none' },
    pro: { kind: 'check' },
  },
];

const PLANS = [
  {
    nameKey: 'plan.monthly',
    priceKey: 'price.monthly',
    price: 'US$10',
    billingKey: 'plan.monthly_desc',
  },
  {
    nameKey: 'plan.annual',
    priceKey: 'price.annual',
    price: 'US$90',
    billingKey: 'plan.annual_desc',
  },
  {
    nameKey: 'plan.lifetime',
    priceKey: 'price.lifetime',
    price: 'US$169',
    billingKey: 'plan.lifetime_desc',
  },
];

function ComparisonCell({ value }: { value: ComparisonValue }) {
  const t = useT();

  if (value.kind === 'check') {
    return (
      <span className="inline-flex items-center justify-center">
        <Check className="h-4 w-4 text-green-500" aria-label="✓" />
      </span>
    );
  }

  if (value.kind === 'text') {
    return <span className="text-sm text-muted-foreground">{t(value.key)}</span>;
  }

  return (
    <span className="inline-flex items-center justify-center text-muted-foreground">
      <Minus className="h-4 w-4" aria-label="—" />
    </span>
  );
}

export function PricingSection() {
  const t = useT();
  const locale = useLocale();
  const { open: saleOpen, endsAt } = useSaleWindow();
  const [prices, setPrices] = useState<StripePrice[]>([]);

  // Fetch the price rows only while a sale is running. Outside the window the
  // table renders its static regular prices, so the landing page (the busiest
  // public page) makes no extra API call and cannot be slowed down by one.
  useEffect(() => {
    if (!saleOpen) return;
    let cancelled = false;
    getStripePrices()
      .then((fetched) => {
        if (!cancelled) setPrices(fetched);
      })
      .catch(() => {
        /* No prices → the lifetime row keeps its regular price; the banner
           still advertises the offer. Never blank the table on a fetch error. */
      });
    return () => {
      cancelled = true;
    };
  }, [saleOpen]);

  // Sale applies to lifetime only, and the amount comes from the price row so
  // the table quotes exactly what the checkout will charge.
  const lifetimeSale = saleOpen ? findSalePrice(prices, 'lifetime', 'usd') : undefined;
  const lifetimeRegular = findRegularPrice(prices, 'lifetime', 'usd');
  const salePct = saleOpen ? getSaleDiscount(prices, 'lifetime') : null;

  return (
    <section className="border-t border-border px-4 py-20">
      <div className="mx-auto max-w-4xl">
        <h2 className="mb-12 text-center text-3xl font-bold">{t('pricing.title')}</h2>

        {/* Free vs Pro feature comparison */}
        <h3 className="mb-4 text-center text-xl font-semibold">{t('pricing.free_vs_pro')}</h3>
        <div className="mb-14 overflow-x-auto rounded-2xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-3 text-left font-semibold">{t('pricing.feature')}</th>
                <th className="px-4 py-3 text-center font-semibold">{t('label.free_user')}</th>
                <th className="px-4 py-3 text-center font-semibold">{t('label.pro')}</th>
              </tr>
            </thead>
            <tbody>
              {FEATURE_ROWS.map((row) => (
                <tr key={row.labelKey} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-3">{t(row.labelKey)}</td>
                  <td className="px-4 py-3 text-center">
                    <ComparisonCell value={row.free} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <ComparisonCell value={row.pro} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Plan pricing comparison */}
        <h3 className="mb-4 text-center text-xl font-semibold">{t('pricing.plans')}</h3>

        {saleOpen && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-center dark:border-amber-800 dark:bg-amber-950">
            <p className="text-base font-bold text-amber-900 dark:text-amber-100">
              🥮 {t('msg.sale_mid_autumn')}
            </p>
            {salePct !== null && (
              <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">
                {lifetimeSale
                  ? t('msg.sale_lifetime_price', {
                      pct: salePct,
                      price: `US$${formatPriceAmount(lifetimeSale.amount)}`,
                    })
                  : t('msg.sale_discount', { pct: salePct })}
              </p>
            )}
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
              {t('msg.sale_offer_ends', { date: formatSaleDate(endsAt, locale) })}
            </p>
          </div>
        )}

        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-3 text-left font-semibold">{t('label.plan')}</th>
                <th className="px-4 py-3 text-left font-semibold">{t('pricing.price')}</th>
                <th className="px-4 py-3 text-left font-semibold">{t('pricing.billing')}</th>
              </tr>
            </thead>
            <tbody>
              {PLANS.map((plan) => {
                const onSale = plan.nameKey === 'plan.lifetime' && !!lifetimeSale;
                const regularDisplay =
                  plan.nameKey === 'plan.lifetime' && lifetimeRegular
                    ? `US$${formatPriceAmount(lifetimeRegular.amount)}`
                    : plan.price;
                return (
                  <tr key={plan.nameKey} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-3 font-medium">
                      {t(plan.nameKey)}
                      {onSale && (
                        <span className="ml-2 inline-block rounded-full bg-destructive px-2 py-0.5 text-xs font-bold text-destructive-foreground">
                          {t('msg.sale_mid_autumn')}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {onSale && lifetimeSale ? (
                        <span className="flex flex-wrap items-baseline gap-2">
                          <span className="text-muted-foreground line-through">
                            {t(plan.priceKey, { price: regularDisplay })}
                          </span>
                          <span className="font-semibold text-red-600 dark:text-red-400">
                            {t(plan.priceKey, {
                              price: `US$${formatPriceAmount(lifetimeSale.amount)}`,
                            })}
                          </span>
                        </span>
                      ) : (
                        t(plan.priceKey, { price: regularDisplay })
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{t(plan.billingKey)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
