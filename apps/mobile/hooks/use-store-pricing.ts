import { useCallback, useEffect, useState } from 'react';
import { findRegularPrice, formatPriceAmount, type StripePrice } from '@langplayer/shared';
import { PYTHON_API_URL } from '@/lib/api-url';
import { getStorePrice, type StorePrice } from '@/lib/iap';

/**
 * Store price resolution for the mobile purchase surfaces (go-pro and the
 * profile plan list), shared so both screens show the same numbers.
 *
 * SPEC-112: mobile does not run sales. StoreKit / Play Billing charge the
 * console price, which a Stripe coupon cannot discount, so the app shows the
 * store's own `displayPrice` and claims no discount at all. The non-IAP cards
 * (monthly/annual) show the regular USD row.
 *
 * ⚠️ Mobile has no non-store purchase path (SPEC-054 Phase 3 removed the rest),
 * so an IAP price must always be the price the store will charge.
 */

/** A displayed price. */
export interface DisplayPrice {
  current: string;
}

/** Regular (non-sale) USD price for a plan, from the fetched rows, falling back
 *  to the hardcoded default before the fetch resolves. */
export function regularUsdPrice(
  prices: StripePrice[],
  planKey: string,
  defaultPrice: string,
): string {
  const regular = findRegularPrice(prices, planKey, 'usd');
  if (regular) return `$${formatPriceAmount(regular.amount)}`;
  return defaultPrice;
}

/** The price to show for a plan: for lifetime, whatever the store reports;
 *  otherwise the regular USD row. */
export function planPrice(
  prices: StripePrice[],
  planKey: string,
  defaultPrice: string,
  storePrice: StorePrice | null,
): DisplayPrice {
  if (planKey === 'lifetime' && storePrice?.displayPrice) {
    return { current: storePrice.displayPrice };
  }
  return { current: regularUsdPrice(prices, planKey, defaultPrice) };
}

export interface StorePricing {
  /** Parsed `prices.csv` rows from `/stripe-prices`. */
  prices: StripePrice[];
  /** Live `pro_go` price from the store, or null when unavailable. */
  storePrice: StorePrice | null;
  /** True while the price rows are still loading. */
  loadingPrices: boolean;
  /** True when the price rows could not be fetched. */
  priceError: boolean;
  /** Display price for a plan card or the IAP button. */
  priceFor: (planKey: string, defaultPrice: string) => DisplayPrice;
}

export function useStorePricing(): StorePricing {
  const [prices, setPrices] = useState<StripePrice[]>([]);
  const [storePrice, setStorePrice] = useState<StorePrice | null>(null);
  const [loadingPrices, setLoadingPrices] = useState(true);
  const [priceError, setPriceError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`${PYTHON_API_URL}/stripe-prices`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (!cancelled) setPrices(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setPriceError(true);
      })
      .finally(() => {
        if (!cancelled) setLoadingPrices(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The live store price is the only price an IAP button may display.
  useEffect(() => {
    let cancelled = false;
    getStorePrice()
      .then((price) => {
        if (!cancelled) setStorePrice(price);
      })
      .catch(() => {
        /* getStorePrice returns null rather than rejecting; a null result
           makes `planPrice` fall back to the regular price. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const priceFor = useCallback(
    (planKey: string, defaultPrice: string): DisplayPrice =>
      planPrice(prices, planKey, defaultPrice, storePrice),
    [prices, storePrice],
  );

  return { prices, storePrice, loadingPrices, priceError, priceFor };
}
