import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * `getStorePrice()` is the mobile app's only source of truth for the price an
 * IAP button may display. Because App Store Connect / Play Console prices
 * cannot be changed by the app, the app must report exactly what the store will
 * charge — and must return null (not a guess) when it cannot find out, so the
 * UI never advertises a discount the purchase sheet will not honour.
 */

// `vi.hoisted` so the mock factories can reference these before the module
// graph is imported (vi.mock calls are hoisted above the imports).
const mocks = vi.hoisted(() => ({
  fetchProducts: vi.fn(),
  initConnection: vi.fn(async () => undefined),
  platform: { OS: 'ios' as string },
}));

vi.mock('react-native', () => ({ Platform: mocks.platform }));

vi.mock('expo-iap', () => ({
  initConnection: mocks.initConnection,
  endConnection: vi.fn(async () => undefined),
  purchaseUpdatedListener: vi.fn(),
  purchaseErrorListener: vi.fn(),
  getReceiptDataIOS: vi.fn(async () => ''),
  requestReceiptRefreshIOS: vi.fn(async () => ''),
  getAvailablePurchases: vi.fn(async () => []),
  requestPurchase: vi.fn(),
  finishTransaction: vi.fn(),
  fetchProducts: mocks.fetchProducts,
}));

vi.mock('@/lib/logger', () => ({
  log: () => {},
  logwarn: () => {},
  logerr: () => {},
}));

import { clearStorePriceCache, getStorePrice } from './iap';

/** A StoreKit product payload, trimmed to the fields this module reads. */
function product(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pro_go',
    displayPrice: '$84.50',
    currency: 'USD',
    price: 84.5,
    platform: 'ios',
    type: 'in-app',
    ...overrides,
  };
}

beforeEach(() => {
  clearStorePriceCache();
  mocks.fetchProducts.mockReset();
  mocks.initConnection.mockClear();
  mocks.platform.OS = 'ios';
});

describe('getStorePrice', () => {
  it('returns the price the store reported, formatted by the store', async () => {
    mocks.fetchProducts.mockResolvedValue([product()]);

    const price = await getStorePrice();

    expect(price).toEqual({
      productId: 'pro_go',
      displayPrice: '$84.50',
      currency: 'USD',
      price: 84.5,
    });
  });

  it('passes the localized store string through untouched', async () => {
    // Never re-format this: the purchase sheet shows the store's own string.
    mocks.fetchProducts.mockResolvedValue([
      product({ displayPrice: '84,50 €', currency: 'EUR', price: 84.5 }),
    ]);

    expect((await getStorePrice())?.displayPrice).toBe('84,50 €');
  });

  it('asks only for the pro_go in-app product', async () => {
    mocks.fetchProducts.mockResolvedValue([product()]);

    await getStorePrice();

    expect(mocks.fetchProducts).toHaveBeenCalledWith({ skus: ['pro_go'], type: 'in-app' });
  });

  it('returns null when the store omits the product', async () => {
    mocks.fetchProducts.mockResolvedValue([]);

    expect(await getStorePrice()).toBeNull();
  });

  it('returns null when the store returns a null payload', async () => {
    mocks.fetchProducts.mockResolvedValue(null);

    expect(await getStorePrice()).toBeNull();
  });

  it('ignores a product whose price string is empty', async () => {
    mocks.fetchProducts.mockResolvedValue([product({ displayPrice: '' })]);

    expect(await getStorePrice()).toBeNull();
  });

  it('ignores a product with a different id', async () => {
    mocks.fetchProducts.mockResolvedValue([product({ id: 'some_other_sku' })]);

    expect(await getStorePrice()).toBeNull();
  });

  it('returns a null numeric amount when the store reports none', async () => {
    mocks.fetchProducts.mockResolvedValue([product({ price: null })]);

    const price = await getStorePrice();

    // The display string is still usable; only the discount comparison needs
    // the number, and `hasStoreDiscount` treats null as "no provable discount".
    expect(price?.displayPrice).toBe('$84.50');
    expect(price?.price).toBeNull();
  });

  it('returns null instead of throwing when the store call fails', async () => {
    mocks.fetchProducts.mockRejectedValue(new Error('store unreachable'));

    await expect(getStorePrice()).resolves.toBeNull();
  });

  it('does not cache a failure, so a later mount can retry', async () => {
    mocks.fetchProducts.mockRejectedValueOnce(new Error('store unreachable'));

    expect(await getStorePrice()).toBeNull();

    mocks.fetchProducts.mockResolvedValue([product()]);
    expect((await getStorePrice())?.displayPrice).toBe('$84.50');
    expect(mocks.fetchProducts).toHaveBeenCalledTimes(2);
  });

  it('caches a success — the go-pro screen and the profile list share one query', async () => {
    mocks.fetchProducts.mockResolvedValue([product()]);

    const first = await getStorePrice();
    const second = await getStorePrice();

    expect(second).toEqual(first);
    expect(mocks.fetchProducts).toHaveBeenCalledTimes(1);
  });

  it('re-queries after the cache is cleared', async () => {
    mocks.fetchProducts.mockResolvedValue([product()]);

    await getStorePrice();
    clearStorePriceCache();
    await getStorePrice();

    expect(mocks.fetchProducts).toHaveBeenCalledTimes(2);
  });
});
