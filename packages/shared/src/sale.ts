// ──────────────────────────────────────────────
// Sale Pricing — window gating + price lookup
// ──────────────────────────────────────────────
//
// Reference implementation: Classic (Nuxt) `lib/utils/variables.js` derives a
// single boolean from a hardcoded date window built with `new Date(y, m, d)` —
// which is the DEVICE's local timezone — and `components/Pricing.vue` /
// `components/Sale.vue` gate the sale UI on it:
//
//   export const SALE_START_DATE = new Date(2026, 1, 9);              // local
//   export const SALE_END_DATE   = new Date(2026, 1, 20, 23, 59, 59, 999);
//   export const SALE = new Date() >= SALE_START_DATE && new Date() <= SALE_END_DATE;
//   export const SALE_DISCOUNT = 0.5;
//
// This module ports that pattern to the shared package so web and mobile agree.
// See ADR-0048 for why the window — not the backend's `prices.csv` status
// column — is the client-side authority for whether a sale is running, and for
// why the *amount* still comes from the backend price rows.

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

export type SalePlan = 'lifetime';
export type SaleCurrency = 'usd' | 'cny';

// ──────────────────────────────────────────────
// The current sale
// ──────────────────────────────────────────────

/**
 * Sale identity. `SALE_NAME` is the English name used in logs and as a
 * fallback; the UI renders the translated `msg.sale_mid_autumn` key instead
 * (never hardcode English in the UI).
 */
export const SALE_NAME = 'Mid-Autumn';
/** Translation key for the sale headline used in the banner. */
export const SALE_NAME_KEY = 'msg.sale_mid_autumn';

/**
 * Declared discount intent: 0.5 = 50% off (Classic's `SALE_DISCOUNT`, where
 * the value is a multiplier — "0.65 means 35% off").
 *
 * The *displayed* percentage is derived from the actual price rows by
 * `getSaleDiscount()`, so the banner can never claim a discount the checkout
 * will not honour. Keep this constant in sync with `data/prices.csv`.
 */
export const SALE_DISCOUNT = 0.5;

/** Plans the sale applies to. Classic applies `SALE` to lifetime Pro only. */
export const SALE_PLANS: readonly SalePlan[] = ['lifetime'];

/**
 * The sale window as local wall-clock time. `month` is 0-indexed (8 = Sep),
 * matching both `new Date(y, m, d)` and Classic's `variables.js`.
 *
 * Mid-Autumn 2026: starts 0:00 on Sep 21 and ends 23:59:59.999 on Sep 27, in
 * whatever timezone the user's device reports.
 */
export const SALE_START_LOCAL = {
  year: 2026,
  month: 8,
  day: 21,
  hour: 0,
  minute: 0,
  second: 0,
  millisecond: 0,
} as const;

export const SALE_END_LOCAL = {
  year: 2026,
  month: 8,
  day: 27,
  hour: 23,
  minute: 59,
  second: 59,
  millisecond: 999,
} as const;

/** First instant of the sale, in the device's local timezone. */
export function saleWindowStart(): Date {
  const w = SALE_START_LOCAL;
  return new Date(w.year, w.month, w.day, w.hour, w.minute, w.second, w.millisecond);
}

/** Last instant of the sale, in the device's local timezone. */
export function saleWindowEnd(): Date {
  const w = SALE_END_LOCAL;
  return new Date(w.year, w.month, w.day, w.hour, w.minute, w.second, w.millisecond);
}

/**
 * Whether `now` falls inside the sale window, evaluated in the device's local
 * timezone. Bounds are inclusive on both ends.
 *
 * Callers on the server (or during SSR) must not rely on this before mount —
 * the server's timezone is not the user's. See `useSaleWindow()` in the web
 * app, which resolves it on the client only.
 */
export function isSaleWindowOpen(now: Date = new Date()): boolean {
  return now >= saleWindowStart() && now <= saleWindowEnd();
}

/** Whether the sale applies to `plan` and the window is open. */
export function isPlanOnSale(plan: string, now: Date = new Date()): boolean {
  return isSaleWindowOpen(now) && (SALE_PLANS as readonly string[]).includes(plan);
}

// ──────────────────────────────────────────────
// Price lookup
// ──────────────────────────────────────────────

/** Check whether a sale is active by looking for a `type: 'sale'` price that
 *  the backend has marked `current`.
 *
 *  NOTE: this is the backend-status signal only. Since the sale window is
 *  client-gated (ADR-0048), reach for `isPlanOnSale()` for UI decisions and
 *  `findSalePrice()` for the sale amount. */
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

/**
 * Find the sale price row for a plan, ignoring any currency.
 *
 * `status` is deliberately NOT filtered. `data/prices.csv` carries the sale
 * rows as `status=archived` whenever a sale is not being run (the Feb 2026
 * Chinese New Year rows are archived today), and ops flips them to `current`
 * to start a run. The client window is the authority for *when* the sale is
 * on, so a row's `status` must not be able to silently hide the discount that
 * the window has opened (ADR-0048).
 *
 * Rows with an empty `id` are skipped: `load_prices(test=True)` returns an
 * empty `id` for a row with no `test_price_id`, and handing an empty price id
 * to Stripe fails the checkout.
 */
export function findSalePrice(
  prices: StripePrice[],
  plan: string,
  currency?: SaleCurrency,
): StripePrice | undefined {
  return prices.find(
    (p) =>
      p.plan === plan &&
      p.type === 'sale' &&
      !!p.id &&
      (currency === undefined || p.currency === currency),
  );
}

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
 * Sale discount percentage, derived from the actual price rows so the banner
 * always matches what the checkout charges. Returns null when the sale price
 * row is missing, so callers must not invent a percentage.
 *
 * USD: 169 → 84.50 = 50%. CNY: 1227 → 608 = 50% (rounded from 50.45%).
 */
export function getSaleDiscount(
  prices: StripePrice[],
  plan: string,
  currency: SaleCurrency = 'usd',
): number | null {
  const regular = findRegularPrice(prices, plan, currency);
  const sale = findSalePrice(prices, plan, currency);
  if (!regular || !sale || regular.amount === 0) return null;
  return Math.round((1 - sale.amount / regular.amount) * 100);
}

/** The price a plan should be charged/displayed at, honouring the sale window.
 *
 *  Returns the sale row while the window is open (falling back to the regular
 *  row when no usable sale row exists), and the regular row otherwise. The
 *  returned row's `id` / `paymentLink` is what the checkout must use so the
 *  charged amount matches the displayed one. */
export function resolvePlanPrice(
  prices: StripePrice[],
  plan: string,
  currency: SaleCurrency,
  now: Date = new Date(),
): { price: StripePrice | undefined; onSale: boolean } {
  const sale = findSalePrice(prices, plan, currency);
  if (isPlanOnSale(plan, now) && sale) return { price: sale, onSale: true };
  return { price: findRegularPrice(prices, plan, currency), onSale: false };
}

// ──────────────────────────────────────────────
// Store-billing price comparison
// ──────────────────────────────────────────────

/** A store product price as reported by StoreKit / Play Billing.
 *  `price` is the numeric amount, `displayPrice` the store's own localized
 *  formatting (e.g. "$84.50" / "84,50 €"), `currency` the ISO code. */
export interface StorePrice {
  currency: string;
  price: number | null;
  displayPrice: string;
}

/**
 * Whether a store-billed price is genuinely discounted versus our regular
 * price for the same currency.
 *
 * App Store Connect and Play Console prices cannot be changed by the app, so
 * the app must never *claim* a discount on an IAP button — it can only report
 * what the store will actually charge. Comparing the store's own number
 * against the regular row lets the UI strike through a real regular price
 * only when the store confirms the reduction, so a console price that hasn't
 * been updated yet can never produce a misleading "50% off" next to a full
 * price (SPEC-014 store-policy constraints).
 */
export function hasStoreDiscount(
  prices: StripePrice[],
  plan: string,
  store: StorePrice | null | undefined,
): boolean {
  if (!store || typeof store.price !== 'number' || !(store.price > 0)) return false;
  const currency = store.currency?.toLowerCase();
  if (currency !== 'usd' && currency !== 'cny') return false;
  // Require a sale row for this plan + currency, so an unrelated low price is
  // never reported as "the sale applied".
  if (!findSalePrice(prices, plan, currency)) return false;
  const regular = findRegularPrice(prices, plan, currency);
  if (!regular) return false;
  // `<= sale.amount` would be too strict — a console price point of 84.99 is
  // still a genuine reduction versus 169, so any drop below regular counts.
  return store.price < regular.amount;
}
