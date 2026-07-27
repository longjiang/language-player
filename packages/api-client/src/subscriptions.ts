import { apiClient } from './client';
import type { SubscriptionRecord } from '@langplayer/shared';

// NOTE: These functions are designed for the Next.js web app, which proxies
// through its own API routes. The React Native mobile app calls the Flask
// backend directly via fetch() to PYTHON_API_URL and does not use these.

/** Type guard: check if a value is a valid SubscriptionRecord. */
function isSubscriptionRecord(data: unknown): data is SubscriptionRecord {
  return (
    typeof data === 'object' &&
    data !== null &&
    'id' in data &&
    'owner' in data &&
    'type' in data
  );
}

/** Fetch the user's current subscription from the backend.
 *  GET /user-subscription?user_id=X
 *  Returns null when the user has no subscription or the fetch fails. */
export async function getUserSubscription(
  userId: string,
): Promise<SubscriptionRecord | null> {
  try {
    const data = await apiClient.get<unknown>(
      '/user-subscription',
      { params: { user_id: userId } },
    );
    return isSubscriptionRecord(data) ? data : null;
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
    '/in_app_purchase_success',
    { user_id: userId, receipt },
  );
}
