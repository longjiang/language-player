// ──────────────────────────────────────────────
// Sale Pricing Detection
// ──────────────────────────────────────────────

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

/** Check whether a sale is active by looking for `type: 'sale'` prices. */
export function isSaleActive(prices: StripePrice[]): boolean {
  return prices.some((p) => p.type === 'sale' && p.status === 'current');
}

/** Find the regular USD price for a given plan. */
export function findUsdPrice(
  prices: StripePrice[],
  plan: string,
  type?: string,
): StripePrice | undefined {
  return prices.find(
    (p) =>
      p.plan === plan &&
      p.currency === 'usd' &&
      p.status === 'current' &&
      (type === undefined || p.type === type),
  );
}

/** Find the regular CNY price for a given plan. */
export function findCnyPrice(
  prices: StripePrice[],
  plan: string,
  type?: string,
): StripePrice | undefined {
  return prices.find(
    (p) =>
      p.plan === plan &&
      p.currency === 'cny' &&
      p.status === 'current' &&
      (type === undefined || p.type === type),
  );
}

/** Get only active (status=current) prices. */
export function getActivePrices(prices: StripePrice[]): StripePrice[] {
  return prices.filter((p) => p.status === 'current');
}

/** Calculate sale discount percentage. */
export function getSaleDiscount(
  prices: StripePrice[],
  plan: string,
): number | null {
  const regular = findUsdPrice(prices, plan, 'regular');
  const sale = findUsdPrice(prices, plan, 'sale');
  if (!regular || !sale || regular.amount === 0) return null;
  return Math.round((1 - sale.amount / regular.amount) * 100);
}
