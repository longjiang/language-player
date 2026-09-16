'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useSession } from 'next-auth/react';
import { PYTHON_API_URL } from '@/lib/api-url';
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import { classifySubscriptionResponse } from '@langplayer/utils';
import { log } from '@/lib/logger';
import type { SubscriptionRecord, SubscriptionState } from '@langplayer/shared';

interface SubscriptionContextValue extends SubscriptionState {
  /** Re-run the check (used after a purchase on another surface). */
  fetchSubscription: () => Promise<void>;
  /** Cancel an auto-renewing plan at the end of the period. */
  cancelSubscription: () => Promise<boolean>;
}

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);

/**
 * App-wide subscription status provider.
 * Fetches /user-subscription once on mount and shares the result via context,
 * so individual components don't need to re-fetch on every mount.
 *
 * A check that never happened — a bad connection, or a non-2xx from a proxy or
 * the auth layer — must never be read as "this user has no subscription". Only
 * an authoritative server answer (a record, or an explicit
 * `{"subscription": null}`) changes the state, so a Pro user is never
 * downgraded by a failed request (SPEC-053, ADR-0034).
 */
export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const token = (session?.user as any)?.accessToken as string | undefined;
  const [sub, setSub] = useState<SubscriptionRecord | null>(null);
  const [loaded, setLoaded] = useState(false);

  const fetchSubscription = useCallback(async () => {
    if (!userId) {
      setLoaded(true);
      return;
    }
    let status = 0;
    let body: unknown = undefined;
    try {
      const res = await authenticatedFetch(`${PYTHON_API_URL}/user-subscription`);
      status = res.status;
      body = await res.json().catch(() => undefined);
    } catch {
      status = 0; // no response at all
    }
    const outcome = classifySubscriptionResponse(status, body);
    if (outcome.kind === 'sub') {
      setSub(outcome.sub);
    } else if (outcome.kind === 'none') {
      setSub(null);
    } else {
      // Keep whatever we already have — never downgrade on a failed check.
      log('[subscription] check failed — keeping the last known subscription', {
        reason: outcome.reason,
      });
    }
    setLoaded(true);
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setLoaded(true);
      return;
    }
    void fetchSubscription();
  }, [userId, token, fetchSubscription]);

  /**
   * Cancel an auto-renewing subscription, then re-check so the UI reflects the
   * server. Returns false when there is nothing to cancel or the call failed.
   */
  const cancelSubscription = useCallback(async () => {
    const customerId = sub?.payment_customer_id;
    if (!customerId) return false;
    try {
      await authenticatedFetch(`${PYTHON_API_URL}/cancel-subscription-at-end-of-period`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: customerId }),
      });
      // Optimistic: drop the customer id so auto-renew flags disappear, then
      // re-check for the server's truth.
      setSub((prev) => (prev ? { ...prev, payment_customer_id: null } : prev));
      return true;
    } catch (e) {
      log('[subscription] cancel failed', { error: (e as Error)?.message ?? String(e) });
      return false;
    }
  }, [sub?.payment_customer_id]);

  const planType = sub?.type ?? 'free';
  const isLifetime = planType === 'lifetime';
  const expiresOn = sub?.expires_on
    ? new Date(sub.expires_on.replace(' ', 'T'))
    : null;
  const isExpired = expiresOn ? expiresOn < new Date() : false;
  // Lifetime never expires; a dated plan counts while unexpired. Mirrors the
  // mobile context and the backend's `is_srs_pro`.
  const isPro = isLifetime || (expiresOn !== null && !isExpired);
  const willAutoRenew =
    !isLifetime &&
    (planType === 'monthly' || planType === 'annual') &&
    !!sub?.payment_customer_id &&
    isPro;
  const daysUntilExpiry =
    expiresOn && isPro && !isLifetime
      ? Math.max(0, Math.ceil((expiresOn.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
      : null;

  return (
    <SubscriptionContext.Provider
      value={{
        sub,
        loaded,
        isPro,
        planType: sub?.type ?? null,
        isLifetime,
        isExpired,
        willAutoRenew,
        daysUntilExpiry,
        fetchSubscription,
        cancelSubscription,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscriptionContext() {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) throw new Error('useSubscriptionContext must be used within <SubscriptionProvider>');
  return ctx;
}
