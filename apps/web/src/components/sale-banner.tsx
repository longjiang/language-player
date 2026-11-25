'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useLocale } from 'next-intl';
import { ArrowRight, Tag, X } from 'lucide-react';
import { useT } from '@/hooks/use-t';
import {
  couponTitle,
  formatCouponDate,
  useFeaturedCoupon,
} from '@/hooks/use-featured-coupon';
import { getLastLanguagePair } from '@/lib/last-language-pair';
import { useSubscriptionContext } from '@/providers/subscription-provider';

/** Dismissal is per browser session (and per campaign code, so a new sale
 *  appears even in a tab where the previous one was closed). */
const DISMISS_KEY_PREFIX = 'lp_sale_banner_dismissed:';

function dismissedThisSession(code: string): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY_PREFIX + code) === '1';
  } catch {
    return false;
  }
}

function rememberDismissal(code: string): void {
  try {
    sessionStorage.setItem(DISMISS_KEY_PREFIX + code, '1');
  } catch {
    /* Storage can be unavailable (private mode/quota); the banner simply shows. */
  }
}

/**
 * The thin sale strip above the header, on every web page (SPEC-112).
 *
 * - Dismissible for the browser session (sessionStorage, keyed by coupon code).
 * - Hidden for lifetime Pro owners — nothing to sell them.
 * - Renders only while `GET /coupons/featured` returns a campaign.
 *
 * It is a client component that fetches after hydration, so adding it to the
 * static `[l1]/[l2]` shell adds no request-time API and leaves the shell
 * cacheable (ADR-0051).
 */
export function SaleBanner() {
  const locale = useLocale();
  const t = useT();
  const { coupon } = useFeaturedCoupon();
  const { loaded, isLifetime } = useSubscriptionContext();
  const [dismissedCode, setDismissedCode] = useState<string | null>(null);

  if (!coupon) return null;
  // Wait for the subscription check so a lifetime owner never sees a flash of
  // the sale before being excluded.
  if (!loaded) return null;
  if (isLifetime) return null;
  if (dismissedCode === coupon.code || dismissedThisSession(coupon.code)) return null;

  const title = couponTitle(coupon, locale);
  const pair = getLastLanguagePair();
  const href = pair
    ? `/${pair.l1}/${pair.l2}/go-pro?coupon=${encodeURIComponent(coupon.code)}`
    : '/language-select';

  const dismiss = () => {
    rememberDismissal(coupon.code);
    setDismissedCode(coupon.code);
  };

  return (
    <div className="relative flex w-full items-center justify-center bg-brand-600 text-primary-foreground">
      <Link
        href={href}
        className="group flex flex-1 items-center justify-center gap-2 px-10 py-2 text-center text-xs font-semibold transition-colors hover:bg-brand-700 sm:text-sm"
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
      <button
        type="button"
        onClick={dismiss}
        aria-label={t('action.close')}
        className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-primary-foreground/80 transition-colors hover:bg-primary-foreground/10 hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground/60"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
