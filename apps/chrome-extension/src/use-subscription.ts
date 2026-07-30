/**
 * useSubscription — check if the authenticated user has a Pro subscription.
 *
 * Calls GET /user-subscription?user_id={userId} with the stored JWT.
 * Returns isPro, isLifetime, and loading state.
 */

import { useState, useEffect } from 'react';
import { getAuthState } from './auth';

const API_BASE = 'https://pythonvps.zerotohero.ca';

interface UseSubscriptionResult {
  isPro: boolean;
  isLifetime: boolean;
  loading: boolean;
}

export function useSubscription(): UseSubscriptionResult {
  const [isPro, setIsPro] = useState(false);
  const [isLifetime, setIsLifetime] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const auth = await getAuthState();
      if (!auth || !auth.userId) {
        if (!cancelled) setLoading(false);
        return;
      }

      try {
        const res = await fetch(
          `${API_BASE}/user-subscription?user_id=${auth.userId}`,
          { headers: { Authorization: `Bearer ${auth.token}` } },
        );
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && data?.type) {
            setIsPro(data.type !== 'free');
            setIsLifetime(data.type === 'lifetime');
          }
        }
      } catch {
        // Non-pro or error — leave as false
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  return { isPro, isLifetime, loading };
}
