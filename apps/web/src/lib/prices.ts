import { PYTHON_API_URL } from './api-url';

export interface StripePrice {
  plan: string;       // 'monthly' | 'annual' | 'lifetime'
  type: string;       // 'regular' | 'sale'
  status: string;     // 'current' | 'legacy'
  mode: string;       // 'subscription' | 'payment'
  currency: string;   // 'usd' | 'cny'
  amount: number;
  id: string;         // Stripe Price ID (or test_price_id)
  paymentLink?: string; // Stripe Payment Link URL (CNY only)
}

let cachedPrices: StripePrice[] | null = null;

/** Fetch prices from the Python backend. Result is cached in memory. */
export async function getStripePrices(): Promise<StripePrice[]> {
  if (cachedPrices) return cachedPrices;
  const res = await fetch(`${PYTHON_API_URL}/stripe-prices`);
  if (!res.ok) throw new Error(`Failed to fetch prices: ${res.status}`);
  cachedPrices = (await res.json()) as StripePrice[];
  return cachedPrices!;
}

/** Find the active USD price for a given plan. */
export function findUsdPrice(prices: StripePrice[], plan: string, type: 'regular' | 'sale' = 'regular'): StripePrice | undefined {
  return prices.find(p => p.plan === plan && p.type === type && p.currency === 'usd' && p.status === 'current');
}

/** Find the active CNY price for a given plan (for WeChat/Alipay Payment Links). */
export function findCnyPrice(prices: StripePrice[], plan: string, type: 'regular' | 'sale' = 'regular'): StripePrice | undefined {
  return prices.find(p => p.plan === plan && p.type === type && p.currency === 'cny' && p.status === 'current');
}
