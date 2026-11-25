import { describe, expect, it } from 'vitest';

import { findRegularPrice, formatPriceAmount, type StripePrice } from './sale';

/** The real rows from zerotohero-python-server/data/prices.csv (subset). */
const PRICES: StripePrice[] = [
  { plan: 'monthly', type: 'regular', status: 'current', mode: 'subscription', currency: 'usd', amount: 10, id: 'price_m_usd' },
  { plan: 'annual', type: 'regular', status: 'current', mode: 'subscription', currency: 'usd', amount: 90, id: 'price_a_usd' },
  { plan: 'lifetime', type: 'regular', status: 'current', mode: 'payment', currency: 'usd', amount: 169, id: 'price_l_usd' },
  { plan: 'lifetime', type: 'regular', status: 'current', mode: 'payment', currency: 'cny', amount: 1227, id: 'price_l_cny', paymentLink: 'https://buy.stripe.com/l' },
  // Legacy sale rows are kept in the CSV but are no longer read for display.
  { plan: 'lifetime', type: 'sale', status: 'archived', mode: 'payment', currency: 'usd', amount: 84.5, id: 'price_sale_usd' },
];

describe('findRegularPrice', () => {
  it('finds the current regular row for a plan and currency', () => {
    expect(findRegularPrice(PRICES, 'lifetime', 'usd')?.amount).toBe(169);
    expect(findRegularPrice(PRICES, 'lifetime', 'usd')?.id).toBe('price_l_usd');
    expect(findRegularPrice(PRICES, 'lifetime', 'cny')?.amount).toBe(1227);
  });

  it('never returns a legacy sale row', () => {
    expect(findRegularPrice(PRICES, 'lifetime', 'usd')?.type).toBe('regular');
  });

  it('returns undefined for an unknown plan', () => {
    expect(findRegularPrice(PRICES, 'weekly', 'usd')).toBeUndefined();
  });
});

describe('formatPriceAmount', () => {
  it('keeps whole amounts whole', () => {
    expect(formatPriceAmount(169)).toBe('169');
    expect(formatPriceAmount(608)).toBe('608');
  });

  it('pads fractional amounts to two decimals', () => {
    expect(formatPriceAmount(84.5)).toBe('84.50');
    expect(formatPriceAmount(84.505)).toBe('84.50');
  });
});
