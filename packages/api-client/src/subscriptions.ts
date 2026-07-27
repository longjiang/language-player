import { apiClient } from './client';
import type { SubscriptionRecord } from '@langplayer/shared';

/** Fetch the user's current subscription from the backend.
 *  GET /user-subscription?user_id=X
 *  Returns null when the user has no subscription or the fetch fails. */
export async function getUserSubscription(
  userId: string,
): Promise<SubscriptionRecord | null> {
  try {
    const data = await apiClient.get<SubscriptionRecord>(
      '/user-subscription',
      { params: { user_id: userId } },
    );
    return (data as any)?.id ? data : null;
  } catch {
    return null;
  }
}

/** Create a Stripe Checkout Session and return the redirect URL.
 *  POST /create-stripe-checkout-session */
export async function createStripeCheckoutSession(
  priceId: string,
  userId: string,
  host: string,
  mode: string,
): Promise<{ url: string }> {
  return apiClient.post<{ url: string }>('/create-stripe-checkout-session', {
    price_id: priceId,
    user_id: String(userId),
    host,
    mode,
  });
}

/** Cancel an auto-renewing subscription at end of period.
 *  POST /cancel-subscription-at-end-of-period */
export async function cancelSubscriptionAtEndOfPeriod(
  customerId: string,
): Promise<void> {
  await apiClient.post<void>('/cancel-subscription-at-end-of-period', {
    customer_id: customerId,
  });
}

/** Validate an App Store / IAP receipt on the backend.
 *  POST /in_app_purchase_success */
export async function validateIapReceipt(
  userId: string,
  receipt: string,
): Promise<{ type: string; message?: string }> {
  return apiClient.post<{ type: string; message?: string }>(
    `${apiClient.instance.defaults.baseURL}/in_app_purchase_success`,
    { user_id: userId, receipt },
  );
}
