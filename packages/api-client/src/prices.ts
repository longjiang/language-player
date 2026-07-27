import { apiClient } from './client';
import type { StripePrice } from '@langplayer/shared';

/** Fetch all Stripe prices from the backend.
 *  Returns parsed prices.csv data. */
export async function fetchPrices(): Promise<StripePrice[]> {
  const data = await apiClient.get<StripePrice[]>('/stripe-prices');
  return Array.isArray(data) ? data : [];
}
