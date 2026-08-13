/**
 * useSubscription — check if the authenticated user has a Pro subscription.
 *
 * Calls GET /user-subscription with the stored Supabase JWT (the Flask
 * endpoint resolves the user from the verified `sub` claim — SPEC-039).
 * Mirrors web/mobile: Pro = lifetime OR a non-free, unexpired subscription
 * (ARCH-022 / ADR-0034).
 */

import { useState, useEffect, useCallback } from 'react';
import { authorizedFetch } from './auth';
import { API_BASE } from './api-config';

interface SubscriptionInfo {
  id?: number;
  type?: string;
  expires_on?: string | null;
  payment_processor?: string;
  payment_customer_id?: string;
  status?: string;
}

interface UseSubscriptionResult {
  isPro: boolean;
  isLifetime: boolean;
  loading: boolean;
  isExpired: boolean;
  sub: SubscriptionInfo | null;
}

export function useSubscription(): UseSubscriptionResult {
  const [isPro, setIsPro] = useState(false);
  const [isLifetime, setIsLifetime] = useState(false);
  const [isExpired, setIsExpired] = useState(false);
  const [sub, setSub] = useState<SubscriptionInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const resetState = useCallback(() => {
    setSub(null);
    setIsLifetime(false);
    setIsExpired(false);
    setIsPro(false);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await authorizedFetch(`${API_BASE}/user-subscription`);
    if (!res) {
      resetState();
      setLoading(false);
      return;
    }
    if (res.ok) {
      const data = (await res.json()) as SubscriptionInfo | null;
      if (data && (data.id || data.type)) {
        const planType = data.type ?? 'free';
        const lifetime = planType === 'lifetime';
        const expiresOn = data.expires_on
          ? new Date(String(data.expires_on).replace(' ', 'T'))
          : null;
        const expired = expiresOn ? expiresOn < new Date() : false;
        setSub(data);
        setIsLifetime(lifetime);
        setIsExpired(expired);
        // Matches shared SubscriptionState: Pro = lifetime, or a non-expired
        // plan that actually has an expiry date (free trials always do).
        setIsPro(lifetime || (expiresOn !== null && !expired));
      } else {
        resetState();
      }
    }
    setLoading(false);
  }, [resetState]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await load();
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [load]);

  // Refetch when the user logs in/out from the popup
  useEffect(() => {
    const onChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      area: string,
    ) => {
      if (area === 'local' && changes.lpv_auth) load();
    };
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, [load]);

  return { isPro, isLifetime, loading, isExpired, sub };
}
