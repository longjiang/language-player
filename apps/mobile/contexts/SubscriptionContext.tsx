import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import { useAuth } from './AuthContext';
import { PYTHON_API_URL } from '@/lib/api-url';
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import { isOfflineModeError } from '@/lib/offline-mode';
import {
  readCachedSubscription,
  writeCachedSubscription,
} from '@/lib/subscription-cache';
import type { SubscriptionCheck } from '@langplayer/utils';
import { classifySubscriptionResponse } from '@langplayer/utils';
import { log } from '@/lib/logger';
import type { SubscriptionRecord, SubscriptionState } from '@langplayer/shared';

// ── Types ──

interface SubscriptionContextValue extends SubscriptionState {
  /** Refetch subscription from the backend. */
  fetchSubscription: () => Promise<void>;
  /** Cancel auto-renewing subscription at end of period. */
  cancelSubscription: () => Promise<boolean>;
  /** Last error from fetch/cancel operations, or null. */
  error: string | null;
}

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);

export function useSubscription(): SubscriptionContextValue {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) throw new Error('useSubscription must be used within <SubscriptionProvider>');
  return ctx;
}

async function checkSubscription(): Promise<SubscriptionCheck> {
  let res: Response;
  try {
    res = await authenticatedFetch(`${PYTHON_API_URL}/user-subscription`);
  } catch (e) {
    // No response at all — offline, Offline Mode, or a transport failure.
    return {
      kind: 'failed',
      reason: isOfflineModeError(e) ? 'offline-mode' : 'network',
    };
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = undefined; // unparseable body → classified as failed below
  }
  return classifySubscriptionResponse(res.status, body);
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
  // willAutoRenew is true only for paid recurring plans (monthly/annual)
  // that have a payment customer ID and are not expired.
  // Trials are excluded because ['monthly', 'annual'].includes('trial') is false.
  // Lifetime plans are excluded by the !isLifetime check.
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
  const [error, setError] = useState<string | null>(null);
  /** Mirrors `sub` so async work can read the current value without a stale closure. */
  const subRef = useRef<SubscriptionRecord | null>(null);

  const applySub = useCallback((next: SubscriptionRecord | null) => {
    subRef.current = next;
    setSub(next);
  }, []);

  const fetchSubscription = useCallback(async () => {
    const userId = user?.id;
    if (!userId) {
      applySub(null);
      setLoaded(true);
      setError(null);
      return;
    }

    // 1. Show the last confirmed record immediately, so a Pro user never
    //    flickers to free while the check is in flight (or when it fails).
    const cached = await readCachedSubscription(userId);

    // 2. Ask the server.
    const outcome = await checkSubscription();

    if (outcome.kind === 'sub') {
      applySub(outcome.sub);
      setLoaded(true);
      setError(null);
      await writeCachedSubscription(userId, outcome.sub);
      log('[subscription] check ok', {
        userId,
        type: outcome.sub.type,
        expiresOn: outcome.sub.expires_on ?? null,
      });
      return;
    }

    if (outcome.kind === 'none') {
      // Authoritative: the server says this user has no subscription.
      applySub(null);
      setLoaded(true);
      setError(null);
      await writeCachedSubscription(userId, null);
      log('[subscription] check ok — no subscription on the account', { userId });
      return;
    }

    // 3. The check failed. Keep the subscription the user already had —
    //    cached record, or whatever is in memory — and never downgrade to free
    //    because a request failed.
    setLoaded(true);
    setError(null);
    const fromMemory = subRef.current;
    const keep = fromMemory ?? cached;
    applySub(keep);
    log('[subscription] check failed — keeping the last known subscription', {
      userId,
      reason: outcome.reason,
      kept: keep ? { type: keep.type, expiresOn: keep.expires_on ?? null } : null,
      source: fromMemory ? 'memory' : cached ? 'cache' : 'none',
    });
  }, [user?.id, applySub]);

  const cancelSubscription = useCallback(async () => {
    if (!sub?.payment_customer_id) return false;
    setError(null);
    try {
      await fetch(`${PYTHON_API_URL}/cancel-subscription-at-end-of-period`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: sub.payment_customer_id }),
      });
      // Optimistically clear the customer ID so auto-renew flags disappear
      const prev = subRef.current;
      applySub(prev ? { ...prev, payment_customer_id: '' } : null);
      // Re-fetch to get true server state
      await fetchSubscription();
      return true;
    } catch {
      setError('Failed to cancel subscription. Please try again.');
      return false;
    }
  }, [sub?.payment_customer_id, fetchSubscription, applySub]);

  // Load the cached record before the first check so the very first render
  // already knows about a Pro plan (offline start, Offline Mode).
  useEffect(() => {
    const userId = user?.id;
    if (!userId) return;
    let cancelled = false;
    void (async () => {
      const cached = await readCachedSubscription(userId);
      if (cancelled || !cached || subRef.current) return;
      applySub(cached);
      setLoaded(true);
      log('[subscription] preloaded the cached record', {
        userId,
        type: cached.type,
        expiresOn: cached.expires_on ?? null,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, applySub]);

  // Fetch on mount and when user changes
  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  // Refetch when the app returns to the foreground — a purchase made on the
  // website (or another device) should show up without restarting the app.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        fetchSubscription();
      }
    });
    return () => sub.remove();
  }, [fetchSubscription]);

  const value = useMemo<SubscriptionContextValue>(
    () => ({
      ...computeState(sub),
      loaded,
      error,
      fetchSubscription,
      cancelSubscription,
    }),
    [sub, loaded, error, fetchSubscription, cancelSubscription],
  );

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}
