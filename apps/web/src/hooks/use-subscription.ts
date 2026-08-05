'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { PYTHON_API_URL } from '@/lib/api-url';
import { authenticatedFetch } from '@/lib/authenticated-fetch';

interface SubscriptionInfo {
  id?: number;
  type?: string;
  expires_on?: string | null;
  payment_processor?: string;
  payment_customer_id?: string;
  status?: string;
}

/**
 * Lightweight hook to check if the current user has a Pro subscription.
 * Fetches from /user-subscription on mount.
 */
export function useSubscription() {
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const token = (session?.user as any)?.accessToken as string | undefined;
  const [sub, setSub] = useState<SubscriptionInfo | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!userId) {
      setLoaded(true);
      return;
    }
    let cancelled = false;
    authenticatedFetch(`${PYTHON_API_URL}/user-subscription`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        setSub(data?.id ? data : null);
        setLoaded(true);
      })
      .catch(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [userId, token]);

  const planType = sub?.type ?? 'free';
  const isLifetime = planType === 'lifetime';
  const expiresOn = sub?.expires_on
    ? new Date(sub.expires_on.replace(' ', 'T'))
    : null;
  const isExpired = expiresOn ? expiresOn < new Date() : false;
  const isPro = isLifetime || (!!sub && sub.type !== 'free' && !isExpired);

  return { sub, loaded, isPro, planType, isLifetime, isExpired };
}
