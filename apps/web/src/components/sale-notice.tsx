'use client';

import { useLocale } from 'next-intl';
import { useT } from '@/hooks/use-t';
import {
  couponTitle,
  formatCouponDate,
  useFeaturedCoupon,
} from '@/hooks/use-featured-coupon';

/**
 * Compact sale line for the in-app upgrade prompts (SPEC-112).
 *
 * Classic renders its full `Sale.vue` banner inside the "you need Pro" prompt
 * (`zerotohero-nuxt/components/YouNeedPro.vue` → `<Sale class="mt-4 mx-2" />`).
 * The prompts here are inline strips, so this is the condensed version: the
 * campaign title, the discount, the code, and the deadline.
 *
 * Everything comes from `GET /coupons/featured` — the same response the landing
 * banner and the go-pro page use — so the percentage here cannot disagree with
 * the amount checkout charges. Renders nothing when no sale is on, so callers
 * mount it unconditionally.
 */
export function SaleNotice({ className = '' }: { className?: string }) {
  const t = useT();
  const locale = useLocale();
  const { coupon } = useFeaturedCoupon();

  if (!coupon) return null;

  const title = couponTitle(coupon, locale);

  return (
    <div className={className}>
      <p className="text-sm font-semibold text-destructive">
        {t('msg.sale_banner', { title, pct: coupon.percentOff ?? 0 })}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {t('msg.sale_use_code', { code: coupon.code })}
        {' · '}
        {t('msg.sale_offer_ends', {
          date: formatCouponDate(coupon.expiresAt, locale),
        })}
      </p>
    </div>
  );
}
