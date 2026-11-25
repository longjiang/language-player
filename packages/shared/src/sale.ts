// ──────────────────────────────────────────────
// Price lookup helpers
// ──────────────────────────────────────────────
//
// SPEC-112 (ADR-0054) made a sale a **featured coupon** served by the backend,
// so the client-side sale window that used to live here (SALE_START_LOCAL,
// isSaleWindowOpen, getSaleDiscount, findSalePrice, …) is gone. The advertised
// discount and the charged amount both come from `GET /coupons/featured`.
//
// What remains is the shared price shape and the regular-row lookup web and
// mobile use to display prices (the checkout's price id comes from the same
// row). `type: 'sale'` rows still exist in `data/prices.csv` for historical
// reference but are no longer read for display.

/** A Stripe price object returned by GET /stripe-prices. */
export interface StripePrice {
  plan: 'monthly' | 'annual' | 'lifetime';
  type: 'regular' | 'sale';
  status: string;
  mode: 'subscription' | 'payment';
  currency: 'usd' | 'cny';
  amount: number;
  id: string;
  paymentLink?: string;
}

export type SaleCurrency = 'usd' | 'cny';

/** Find the `status=current`, `type=regular` price for a plan + currency. */
export function findRegularPrice(
  prices: StripePrice[],
  plan: string,
  currency: SaleCurrency,
): StripePrice | undefined {
  return prices.find(
    (p) =>
      p.plan === plan &&
      p.type === 'regular' &&
      p.currency === currency &&
      p.status === 'current',
  );
}

/**
 * Format a price amount for display.
 *
 * Whole amounts stay whole (169, 608) because "US$169.00" is noisier than
 * "US$169" for the regular plans; fractional amounts are padded because money
 * is written with two decimals.
 *
 * The currency symbol is the caller's job: the web page prefixes "$"/"¥"
 * itself, and the mobile app uses whatever StoreKit / Play Billing returns as
 * the localised `displayPrice`.
 */
export function formatPriceAmount(amount: number): string {
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}
