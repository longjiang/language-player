import { PYTHON_API_URL } from './api-url';
import type { StripePrice } from '@langplayer/shared';

// The price shape and every lookup live in `@langplayer/shared/src/sale.ts` so
// web and mobile cannot drift. This module only owns the fetch (with the
// in-memory cache) and the Stripe test-mode switch.
export type { StripePrice };

let cachedPrices: StripePrice[] | null = null;

/**
 * Whether the Stripe TEST price set is in use (SPEC-054 Phase 2).
 *
 * ⚠️ `data/prices.csv` has no `test_price_id` for the `type=sale` rows, so in
 * test mode `load_prices(test=True)` returns an empty `id` for them and the
 * sale price cannot be checked out. `findSalePrice()` skips empty-id rows, so
 * checkout silently falls back to the regular price — callers log that
 * fallback explicitly rather than charging a different amount than the UI
 * showed.
 */
export function isStripeTestMode(): boolean {
  return process.env.NEXT_PUBLIC_STRIPE_TEST === 'true';
}

/** Fetch prices from the Python backend. Result is cached in memory. */
export async function getStripePrices(): Promise<StripePrice[]> {
  if (cachedPrices) return cachedPrices;
  const res = await fetch(`${PYTHON_API_URL}/stripe-prices${isStripeTestMode() ? '?test=true' : ''}`);
  if (!res.ok) throw new Error(`Failed to fetch prices: ${res.status}`);
  cachedPrices = (await res.json()) as StripePrice[];
  return cachedPrices!;
}
