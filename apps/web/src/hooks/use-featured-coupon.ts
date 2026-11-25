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

/**
 * Shared response cache. The banner, the landing pricing table and the in-app
 * sale notice can all mount on one page; the endpoint is public and cached for
 * 60s, so they should not each issue a request. A module-level value also
 * survives client-side navigation, which matters now that the banner renders on
 * every app page.
 */
const CACHE_MS = 55_000;
let cached: { at: number; coupon: FeaturedCoupon | null } | null = null;
let inflight: Promise<FeaturedCoupon | null> | null = null;

function fetchFeaturedCoupon(): Promise<FeaturedCoupon | null> {
  if (cached && Date.now() - cached.at < CACHE_MS) return Promise.resolve(cached.coupon);

  inflight ??= fetch(`${PYTHON_API_URL}/coupons/featured`)
    .then((res) => (res.ok ? res.json() : { coupon: null }))
    .then((data: { coupon?: FeaturedCoupon | null }): FeaturedCoupon | null => {
      const coupon = data?.coupon ?? null;
      cached = { at: Date.now(), coupon };
      return coupon;
    })
    .catch((err) => {
      log('[LP Web] featured coupon fetch failed:', err);
      // Do not cache a failure: the next mount should retry, but the current
      // render must not advertise a campaign that may have ended.
      return null;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

export function useFeaturedCoupon(): { coupon: FeaturedCoupon | null; loaded: boolean } {
  const [coupon, setCoupon] = useState<FeaturedCoupon | null>(cached?.coupon ?? null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = () => {
      fetchFeaturedCoupon().then((next) => {
        if (cancelled) return;
        setCoupon(next);
        setLoaded(true);
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
