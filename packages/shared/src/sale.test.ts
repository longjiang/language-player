import { describe, expect, it } from 'vitest';

import {
  SALE_DISCOUNT,
  SALE_PLANS,
  findRegularPrice,
  findSalePrice,
  getSaleDiscount,
  hasStoreDiscount,
  isPlanOnSale,
  isSaleWindowOpen,
  resolvePlanPrice,
  saleWindowEnd,
  saleWindowStart,
  type StripePrice,
} from './sale';

/** The real rows from zerotohero-python-server/data/prices.csv. The sale rows
 *  are `status: 'archived'` between runs — that is the case these tests guard. */
const PRICES: StripePrice[] = [
  { plan: 'monthly', type: 'regular', status: 'current', mode: 'subscription', currency: 'usd', amount: 10, id: 'price_m_usd' },
  { plan: 'annual', type: 'regular', status: 'current', mode: 'subscription', currency: 'usd', amount: 90, id: 'price_a_usd' },
  { plan: 'lifetime', type: 'regular', status: 'current', mode: 'payment', currency: 'usd', amount: 169, id: 'price_l_usd' },
  { plan: 'monthly', type: 'regular', status: 'current', mode: 'payment', currency: 'cny', amount: 73, id: 'price_m_cny', paymentLink: 'https://buy.stripe.com/m' },
  { plan: 'annual', type: 'regular', status: 'current', mode: 'payment', currency: 'cny', amount: 653, id: 'price_a_cny', paymentLink: 'https://buy.stripe.com/a' },
  { plan: 'lifetime', type: 'regular', status: 'current', mode: 'payment', currency: 'cny', amount: 1227, id: 'price_l_cny', paymentLink: 'https://buy.stripe.com/l' },
  // Sale rows — archived between runs, and with no test price ids.
  { plan: 'lifetime', type: 'sale', status: 'archived', mode: 'payment', currency: 'usd', amount: 84.5, id: 'price_sale_usd' },
  { plan: 'lifetime', type: 'sale', status: 'archived', mode: 'payment', currency: 'cny', amount: 608, id: 'price_sale_cny', paymentLink: 'https://buy.stripe.com/sale' },
];

/** Local-time helper so the assertions hold in any machine timezone. */
function local(y: number, m: number, d: number, h = 0, min = 0, s = 0, ms = 0): Date {
  return new Date(y, m, d, h, min, s, ms);
}

describe('sale window', () => {
  it('starts at 0:00 on Sep 21 local and ends 23:59:59.999 on Sep 27 local', () => {
    const start = saleWindowStart();
    expect([start.getFullYear(), start.getMonth(), start.getDate()]).toEqual([2026, 8, 21]);
    expect([start.getHours(), start.getMinutes(), start.getSeconds(), start.getMilliseconds()]).toEqual([0, 0, 0, 0]);

    const end = saleWindowEnd();
    expect([end.getFullYear(), end.getMonth(), end.getDate()]).toEqual([2026, 8, 27]);
    expect([end.getHours(), end.getMinutes(), end.getSeconds(), end.getMilliseconds()]).toEqual([23, 59, 59, 999]);
  });

  it('is open on the first and last instants, closed a millisecond outside', () => {
    expect(isSaleWindowOpen(saleWindowStart())).toBe(true);
    expect(isSaleWindowOpen(saleWindowEnd())).toBe(true);
    // 1 ms before the start (Sep 20 23:59:59.999 local)
    expect(isSaleWindowOpen(local(2026, 8, 20, 23, 59, 59, 999))).toBe(false);
    // 1 ms after the end (Sep 28 00:00:00.000 local)
    expect(isSaleWindowOpen(local(2026, 8, 28, 0, 0, 0, 0))).toBe(false);
  });

  it('is open throughout the middle of the window', () => {
    expect(isSaleWindowOpen(local(2026, 8, 21, 0, 0, 1))).toBe(true);
    expect(isSaleWindowOpen(local(2026, 8, 24, 12, 0, 0))).toBe(true);
    expect(isSaleWindowOpen(local(2026, 8, 27, 23, 59, 59, 998))).toBe(true);
  });

  it('is closed before the window opens', () => {
    expect(isSaleWindowOpen(local(2026, 8, 20, 12, 0, 0))).toBe(false);
    expect(isSaleWindowOpen(local(2026, 0, 1))).toBe(false);
  });

  it('is closed after the window ends', () => {
    expect(isSaleWindowOpen(local(2026, 8, 28, 0, 0, 1))).toBe(false);
    expect(isSaleWindowOpen(local(2026, 11, 31))).toBe(false);
  });

  it('does not run in 2025 or 2027', () => {
    expect(isSaleWindowOpen(local(2025, 8, 24))).toBe(false);
    expect(isSaleWindowOpen(local(2027, 8, 24))).toBe(false);
  });

  it('applies to lifetime only', () => {
    expect(SALE_PLANS).toEqual(['lifetime']);
    const during = local(2026, 8, 24);
    expect(isPlanOnSale('lifetime', during)).toBe(true);
    expect(isPlanOnSale('monthly', during)).toBe(false);
    expect(isPlanOnSale('annual', during)).toBe(false);
  });

  it('applies to no plan outside the window', () => {
    expect(isPlanOnSale('lifetime', local(2026, 8, 28))).toBe(false);
  });
});

describe('findSalePrice', () => {
  it('finds the archived sale row (status must not hide the discount)', () => {
    const sale = findSalePrice(PRICES, 'lifetime', 'usd');
    expect(sale?.amount).toBe(84.5);
    expect(sale?.id).toBe('price_sale_usd');
    expect(sale?.status).toBe('archived');
  });

  it('finds the CNY sale row and its payment link', () => {
    const sale = findSalePrice(PRICES, 'lifetime', 'cny');
    expect(sale?.amount).toBe(608);
    expect(sale?.paymentLink).toBe('https://buy.stripe.com/sale');
  });

  it('returns undefined for plans with no sale row', () => {
    expect(findSalePrice(PRICES, 'monthly', 'usd')).toBeUndefined();
    expect(findSalePrice(PRICES, 'annual', 'usd')).toBeUndefined();
  });

  it('skips a sale row with no price id (test mode has no test_price_id)', () => {
    const noTestIds: StripePrice[] = [
      { plan: 'lifetime', type: 'sale', status: 'archived', mode: 'payment', currency: 'usd', amount: 84.5, id: '' },
    ];
    expect(findSalePrice(noTestIds, 'lifetime', 'usd')).toBeUndefined();
  });
});

describe('getSaleDiscount', () => {
  it('derives 50% from the USD rows', () => {
    expect(getSaleDiscount(PRICES, 'lifetime')).toBe(50);
    expect(SALE_DISCOUNT).toBe(0.5);
  });

  it('derives 50% from the CNY rows', () => {
    expect(getSaleDiscount(PRICES, 'lifetime', 'cny')).toBe(50);
  });

  it('returns null when there is no sale row to derive from', () => {
    expect(getSaleDiscount(PRICES, 'monthly')).toBeNull();
  });
});

describe('resolvePlanPrice', () => {
  const during = local(2026, 8, 24);
  const after = local(2026, 8, 28);

  it('returns the sale row while the window is open', () => {
    const { price, onSale } = resolvePlanPrice(PRICES, 'lifetime', 'usd', during);
    expect(onSale).toBe(true);
    expect(price?.id).toBe('price_sale_usd');
    expect(price?.amount).toBe(84.5);
  });

  it('returns the regular row after the window closes', () => {
    const { price, onSale } = resolvePlanPrice(PRICES, 'lifetime', 'usd', after);
    expect(onSale).toBe(false);
    expect(price?.id).toBe('price_l_usd');
    expect(price?.amount).toBe(169);
  });

  it('never puts a non-lifetime plan on sale', () => {
    const { price, onSale } = resolvePlanPrice(PRICES, 'monthly', 'usd', during);
    expect(onSale).toBe(false);
    expect(price?.amount).toBe(10);
  });

  it('falls back to the regular row when no sale row is usable', () => {
    const noIds: StripePrice[] = [
      ...PRICES.filter((p) => p.type === 'regular'),
      { plan: 'lifetime', type: 'sale', status: 'archived', mode: 'payment', currency: 'usd', amount: 84.5, id: '' },
    ];
    const { price, onSale } = resolvePlanPrice(noIds, 'lifetime', 'usd', during);
    expect(onSale).toBe(false);
    expect(price?.amount).toBe(169);
  });

  it('uses the CNY sale payment link while the window is open', () => {
    const { price } = resolvePlanPrice(PRICES, 'lifetime', 'cny', during);
    expect(price?.paymentLink).toBe('https://buy.stripe.com/sale');
    expect(findRegularPrice(PRICES, 'lifetime', 'cny')?.paymentLink).toBe('https://buy.stripe.com/l');
  });
});

describe('hasStoreDiscount', () => {
  it('is true when the store charges less than the regular USD price', () => {
    expect(hasStoreDiscount(PRICES, 'lifetime', { currency: 'USD', price: 84.5, displayPrice: '$84.50' })).toBe(true);
  });

  it('is false when the console price has not been updated yet', () => {
    // The misleading case this guard exists for: banner says 50% off, the
    // store still bills full price.
    expect(hasStoreDiscount(PRICES, 'lifetime', { currency: 'USD', price: 169, displayPrice: '$169.00' })).toBe(false);
  });

  it('is false when the store price is missing or unparseable', () => {
    expect(hasStoreDiscount(PRICES, 'lifetime', null)).toBe(false);
    expect(hasStoreDiscount(PRICES, 'lifetime', undefined)).toBe(false);
    expect(hasStoreDiscount(PRICES, 'lifetime', { currency: 'USD', price: null, displayPrice: '' })).toBe(false);
    expect(hasStoreDiscount(PRICES, 'lifetime', { currency: 'USD', price: 0, displayPrice: '$0' })).toBe(false);
  });

  it('compares per currency, so a CNY storefront checks the CNY regular price', () => {
    expect(hasStoreDiscount(PRICES, 'lifetime', { currency: 'CNY', price: 608, displayPrice: '¥608' })).toBe(true);
    expect(hasStoreDiscount(PRICES, 'lifetime', { currency: 'CNY', price: 1227, displayPrice: '¥1227' })).toBe(false);
  });

  it('is false for a currency we hold no regular price for', () => {
    expect(hasStoreDiscount(PRICES, 'lifetime', { currency: 'JPY', price: 12000, displayPrice: '¥12000' })).toBe(false);
  });

  it('is false for a plan with no sale price row', () => {
    expect(hasStoreDiscount(PRICES, 'monthly', { currency: 'USD', price: 5, displayPrice: '$5' })).toBe(false);
  });
});
