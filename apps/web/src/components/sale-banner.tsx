'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale } from 'next-intl';
import { ArrowRight, Tag } from 'lucide-react';
import { useT } from '@/hooks/use-t';
import {
  couponTitle,
  formatCouponDate,
  useFeaturedCoupon,
} from '@/hooks/use-featured-coupon';
import { getLastLanguagePair } from '@/lib/last-language-pair';

/**
 * The thin sale strip above the public header (SPEC-112).
 *
 * Landing page only: the public layout renders it on every public route, so it
 * checks the pathname and returns nothing elsewhere. Everything it shows comes
 * from `GET /coupons/featured`; there is no hardcoded campaign copy or date.
 */
export function SaleBanner() {
  const pathname = usePathname();
  // The public layout renders this on every public route; do not fetch the
  // sale on pages that cannot show it.
  if (pathname !== '/') return null;
  return <SaleBannerInner />;
}

function SaleBannerInner() {
  const locale = useLocale();
  const t = useT();
  const { coupon } = useFeaturedCoupon();

  if (!coupon) return null;

  const title = couponTitle(coupon, locale);
  const pair = getLastLanguagePair();
  const href = pair
    ? `/${pair.l1}/${pair.l2}/go-pro?coupon=${encodeURIComponent(coupon.code)}`
    : '/language-select';

  return (
    <Link
      href={href}
      className="group flex w-full items-center justify-center gap-2 bg-brand-600 px-4 py-2 text-center text-xs font-semibold text-primary-foreground transition-colors hover:bg-brand-700 sm:text-sm"
    >
      <Tag className="hidden h-4 w-4 shrink-0 sm:block" />
      <span>{t('msg.sale_banner', { title, pct: coupon.percentOff ?? 0 })}</span>
      <span className="hidden text-primary-foreground/80 sm:inline">
        {t('msg.sale_offer_ends', {
          date: formatCouponDate(coupon.expiresAt, locale),
        })}
      </span>
      <span className="rounded-full bg-primary-foreground/15 px-2 py-0.5 font-mono text-[11px]">
        {t('msg.sale_use_code', { code: coupon.code })}
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
