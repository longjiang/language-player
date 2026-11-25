'use client';

import { useEffect, useState } from 'react';
import { PYTHON_API_URL } from '@/lib/api-url';
import { log } from '@/lib/logger';

/**
 * The public sale, served by `GET /coupons/featured` (SPEC-112, ADR-0054).
 *
 * A sale is a featured coupon: the server decides whether one is on and how
 * much it costs, using the same arithmetic as checkout. There is no client
 * clock and no hardcoded date — changing a campaign is an admin action.
 */
export interface FeaturedCoupon {
  code: string;
  publicTitle: string;
  publicTitleI18n: Record<string, string>;
  plan: string;
  currency: string;
  discountType: 'percent' | 'amount';
  percentOff: number | null;
  amountOffCents: number | null;
  regularCents: number;
  finalCents: number;
  expiresAt: string;
  expiresTimezone: string;
}

/** Matches the endpoint's 60s cache, so a campaign start/end is picked up
 *  within a minute without a reload. */
const RECHECK_MS = 60_000;

export function useFeaturedCoupon(): { coupon: FeaturedCoupon | null; loaded: boolean } {
  const [coupon, setCoupon] = useState<FeaturedCoupon | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = () => {
      fetch(`${PYTHON_API_URL}/coupons/featured`)
        .then((res) => (res.ok ? res.json() : { coupon: null }))
        .then((data: { coupon?: FeaturedCoupon | null }) => {
          if (cancelled) return;
          setCoupon(data?.coupon ?? null);
          setLoaded(true);
        })
        .catch((err) => {
          log('[LP Web] featured coupon fetch failed:', err);
          if (!cancelled) {
            setCoupon(null);
            setLoaded(true);
          }
        });
    };

    load();
    const id = setInterval(load, RECHECK_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return { coupon, loaded };
}

/** The campaign title in the viewer's locale, falling back to English. */
export function couponTitle(coupon: FeaturedCoupon, locale: string): string {
  return coupon.publicTitleI18n?.[locale]?.trim() || coupon.publicTitle;
}

/** Format the coupon's expiry in the viewer's locale. */
export function formatCouponDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}
