import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import { useAuth } from './AuthContext';
import { PYTHON_API_URL } from '@/lib/api-url';
import type { SubscriptionRecord, SubscriptionState } from '@langplayer/shared';

// ── Types ──

interface SubscriptionContextValue extends SubscriptionState {
  /** Refetch subscription from the backend. */
  fetchSubscription: () => Promise<void>;
  /** Cancel auto-renewing subscription at end of period. */
  cancelSubscription: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);

export function useSubscription(): SubscriptionContextValue {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) throw new Error('useSubscription must be used within <SubscriptionProvider>');
  return ctx;
}

// ── Helpers ──

function computeState(sub: SubscriptionRecord | null): Omit<SubscriptionState, 'loaded'> {
  if (!sub) {
    return {
      sub: null,
      isPro: false,
      planType: null,
      isLifetime: false,
      isExpired: false,
      willAutoRenew: false,
      daysUntilExpiry: null,
    };
  }

  const planType = sub.type;
  const isLifetime = planType === 'lifetime';
  const expiresOn = sub.expires_on ? new Date(sub.expires_on.replace(' ', 'T')) : null;
  const isExpired = expiresOn ? expiresOn < new Date() : false;
  const isPro = isLifetime || (expiresOn !== null && !isExpired);
  const willAutoRenew =
    !isLifetime &&
    ['monthly', 'annual'].includes(planType) &&
    !!sub.payment_customer_id &&
    isPro;
  const daysUntilExpiry =
    expiresOn && isPro && !isLifetime
      ? Math.max(0, Math.ceil((expiresOn.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
      : null;

  return {
    sub,
    isPro,
    planType,
    isLifetime,
    isExpired,
    willAutoRenew,
    daysUntilExpiry,
  };
}

// ── Provider ──

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [sub, setSub] = useState<SubscriptionRecord | null>(null);
  const [loaded, setLoaded] = useState(false);

  const fetchSubscription = useCallback(async () => {
    if (!user?.id) {
      setSub(null);
      setLoaded(true);
      return;
    }
    try {
      const res = await fetch(
        `${PYTHON_API_URL}/user-subscription?user_id=${user.id}`,
      );
      const data = res.ok ? await res.json() : null;
      setSub(data?.id ? data : null);
    } catch {
      setSub(null);
    } finally {
      setLoaded(true);
    }
  }, [user?.id]);

  const cancelSubscription = useCallback(async () => {
    if (!sub?.payment_customer_id) return;
    try {
      await fetch(`${PYTHON_API_URL}/cancel-subscription-at-end-of-period`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: sub.payment_customer_id }),
      });
      // Optimistically clear the customer ID so auto-renew flags disappear
      setSub((prev) => (prev ? { ...prev, payment_customer_id: '' } : null));
      // Re-fetch to get true server state
      await fetchSubscription();
    } catch {
      // Silently fail — the UI will show the error state
    }
  }, [sub?.payment_customer_id, fetchSubscription]);

  // Fetch on mount and when user changes
  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  const value = useMemo<SubscriptionContextValue>(
    () => ({
      ...computeState(sub),
      loaded,
      fetchSubscription,
      cancelSubscription,
    }),
    [sub, loaded, fetchSubscription, cancelSubscription],
  );

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}
