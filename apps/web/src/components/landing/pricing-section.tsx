'use client';

import Link from 'next/link';
import { useLocale } from 'next-intl';
import { Check, Minus } from 'lucide-react';
import { useT } from '@/hooks/use-t';
import {
  couponTitle,
  formatCouponDate,
  useFeaturedCoupon,
} from '@/hooks/use-featured-coupon';
import { getLastLanguagePair } from '@/lib/last-language-pair';
import { formatPriceAmount } from '@langplayer/shared';

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
  const { coupon } = useFeaturedCoupon();

  // The public sale is a featured coupon (SPEC-112). The amounts come from the
  // endpoint, computed with the same arithmetic as checkout.
  const salePct = coupon?.percentOff ?? null;
  const offerTitle = coupon ? couponTitle(coupon, locale) : null;
  const pair = getLastLanguagePair();
  const upgradeHref = pair
    ? `/${pair.l1}/${pair.l2}/go-pro?coupon=${encodeURIComponent(coupon?.code ?? '')}`
    : '/language-select';

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

        {coupon && offerTitle && (
          <div className="mb-4 rounded-xl bg-destructive p-4 text-center text-destructive-foreground">
            <p className="text-base font-bold text-destructive-foreground">
              {t('msg.sale_banner', { title: offerTitle, pct: salePct ?? 0 })}
            </p>
            <p className="mt-1 text-sm text-destructive-foreground/90">
              {t('msg.sale_use_code', { code: coupon.code })}
              {' · '}
              {t('msg.sale_offer_ends', {
                date: formatCouponDate(coupon.expiresAt, locale),
              })}
            </p>
            <Link
              href={upgradeHref}
              className="mt-2 inline-block text-sm font-semibold text-destructive-foreground underline underline-offset-2"
            >
              {t('title.upgrade_to_pro')}
            </Link>
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
                const isLifetime = plan.nameKey === 'plan.lifetime';
                const onSale = isLifetime && !!coupon;
                const regularDisplay = isLifetime && coupon
                  ? `US$${formatPriceAmount(coupon.regularCents / 100)}`
                  : plan.price;
                return (
                  <tr key={plan.nameKey} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-3 font-medium">
                      {t(plan.nameKey)}
                      {onSale && offerTitle && (
                        <span className="ml-2 inline-block rounded-full bg-destructive px-2 py-0.5 text-xs font-bold text-destructive-foreground">
                          {offerTitle}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {onSale && coupon ? (
                        <span className="flex flex-wrap items-baseline gap-2">
                          <span className="text-muted-foreground line-through">
                            {t(plan.priceKey, { price: regularDisplay })}
                          </span>
                          <span className="font-semibold text-destructive">
                            {t(plan.priceKey, {
                              price: `US$${formatPriceAmount(coupon.finalCents / 100)}`,
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
