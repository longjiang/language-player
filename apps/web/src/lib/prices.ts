import { PYTHON_API_URL } from './api-url';
import type { StripePrice } from '@langplayer/shared';

// The price shape and the regular-row lookup live in
// `@langplayer/shared/src/sale.ts` so web and mobile cannot drift. This module
// only owns the fetch (with the in-memory cache) and the Stripe test-mode
// switch.
export type { StripePrice };

let cachedPrices: StripePrice[] | null = null;

/**
 * Whether the Stripe TEST price set is in use (SPEC-054 Phase 2).
 *
 * Sale pricing is no longer read from these rows (SPEC-112 made a sale a
 * coupon), so the old "sale rows have no test_price_id" caveat no longer
 * applies: a coupon checkout uses the test Stripe coupon.
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
