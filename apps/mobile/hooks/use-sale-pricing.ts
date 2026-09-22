import { useCallback, useEffect, useState } from 'react';
import {
  SALE_DISCOUNT,
  findRegularPrice,
  formatPriceAmount,
  getSaleDiscount,
  hasStoreDiscount,
  type StripePrice,
} from '@langplayer/shared';
import { PYTHON_API_URL } from '@/lib/api-url';
import { getStorePrice, type StorePrice } from '@/lib/iap';
import { useSaleWindow } from '@/hooks/use-sale';

/**
 * Sale + price resolution for the mobile purchase surfaces (the go-pro screen
 * and the profile plan list).
 *
 * Kept in one hook because both screens must agree on every price they show,
 * and because the two halves of the answer come from different authorities:
 *
 *   WHEN the sale runs  → the shared window, evaluated against the device clock
 *   HOW MUCH it costs   → the store's own reported price (`pro_go`)
 *
 * ⚠️ Mobile has no non-store purchase path (SPEC-054 Phase 3 removed the rest),
 * so an IAP price must always be the price StoreKit / Play Billing will charge.
 * During the Mid-Autumn sale that price is lowered by hand in App Store Connect
 * and Play Console; this hook reads it back rather than computing a discount,
 * which is why an un-updated console can never produce a misleading "50% off".
 */

/** A displayed price, with the struck-through regular reference when — and only
 *  when — a real discount has been proven. */
export interface DisplayPrice {
  current: string;
  regular: string | null;
}

/** Regular (non-sale) USD price for a plan, from the fetched rows, falling back
 *  to the hardcoded default before the fetch resolves.
 *
 *  Uses `findRegularPrice` rather than the looser `findUsdPrice`, which matches
 *  ANY `status=current` row for the currency — including a sale row if ops ever
 *  flips one to `current`, which would render a discounted amount as the
 *  "regular" fallback. */
export function regularUsdPrice(
  prices: StripePrice[],
  planKey: string,
  defaultPrice: string,
): string {
  const regular = findRegularPrice(prices, planKey, 'usd');
  if (regular) return `$${formatPriceAmount(regular.amount)}`;
  return defaultPrice;
}

/** Our own regular price, formatted for the currency the store reported, for
 *  the struck-through reference beside a discounted store price. Only ever
 *  rendered when a discount is proven, so it is never shown next to a full
 *  price. */
export function regularReference(
  prices: StripePrice[],
  storeCurrency: string,
): string | null {
  const currency = storeCurrency?.toLowerCase();
  if (currency !== 'usd' && currency !== 'cny') return null;
  const regular = findRegularPrice(prices, 'lifetime', currency);
  if (!regular) return null;
  return `${currency === 'usd' ? '$' : '¥'}${formatPriceAmount(regular.amount)}`;
}

/**
 * The price to show for a plan.
 *
 * For lifetime, the authoritative price is whatever the store reports. For the
 * store-gated monthly/annual cards there is no store product (only lifetime is
 * sold via IAP), so the regular USD row is used.
 *
 * `regular` is populated only while the sale window is open AND the store's own
 * number proves a reduction, so sale chrome can neither appear outside the sale
 * nor be paired with a full price.
 */
export function planPrice(
  prices: StripePrice[],
  planKey: string,
  defaultPrice: string,
  storePrice: StorePrice | null,
  saleOpen: boolean,
): DisplayPrice {
  if (planKey === 'lifetime' && storePrice?.displayPrice) {
    return {
      current: storePrice.displayPrice,
      regular:
        saleOpen && hasStoreDiscount(prices, planKey, storePrice)
          ? regularReference(prices, storeCurrencyOf(storePrice))
          : null,
    };
  }
  return { current: regularUsdPrice(prices, planKey, defaultPrice), regular: null };
}

function storeCurrencyOf(storePrice: StorePrice): string {
  return storePrice.currency ?? '';
}

export interface SalePricing {
  /** True only while the device's local clock is inside the sale window. */
  saleOpen: boolean;
  /** Last instant of the sale, in the device's local timezone. */
  endsAt: Date;
  /** Parsed `prices.csv` rows from `/stripe-prices`. */
  prices: StripePrice[];
  /** Live `pro_go` price from the store, or null when unavailable. */
  storePrice: StorePrice | null;
  /** True while the price rows are still loading. */
  loadingPrices: boolean;
  /** True when the price rows could not be fetched. */
  priceError: boolean;
  /** Whether the STORE has confirmed the discount (and the sale is open). */
  discountConfirmed: boolean;
  /** Sale percentage, derived from the price rows where possible. */
  salePct: number;
  /** Display price for a plan card or the IAP button. */
  priceFor: (planKey: string, defaultPrice: string) => DisplayPrice;
}

export function useSalePricing(): SalePricing {
  const { open: saleOpen, endsAt } = useSaleWindow();
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
      planPrice(prices, planKey, defaultPrice, storePrice, saleOpen),
    [prices, storePrice, saleOpen],
  );

  return {
    saleOpen,
    endsAt,
    prices,
    storePrice,
    loadingPrices,
    priceError,
    discountConfirmed: saleOpen && hasStoreDiscount(prices, 'lifetime', storePrice),
    // Derived from the price rows; the declared constant is the fallback so the
    // banner still reads correctly before `/stripe-prices` resolves.
    salePct: getSaleDiscount(prices, 'lifetime') ?? Math.round((1 - SALE_DISCOUNT) * 100),
    priceFor,
  };
}
