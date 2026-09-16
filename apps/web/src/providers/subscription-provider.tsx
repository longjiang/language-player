'use client';

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { useSession } from 'next-auth/react';
import { PYTHON_API_URL } from '@/lib/api-url';
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import { classifySubscriptionResponse } from '@langplayer/utils';
import { log } from '@/lib/logger';

interface SubscriptionInfo {
  id?: number;
  type?: string;
  expires_on?: string | null;
  payment_processor?: string;
  payment_customer_id?: string;
  status?: string;
}

interface SubscriptionContextValue {
  sub: SubscriptionInfo | null;
  loaded: boolean;
  isPro: boolean;
  planType: string;
  isLifetime: boolean;
  isExpired: boolean;
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
  const [sub, setSub] = useState<SubscriptionInfo | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!userId) {
      setLoaded(true);
      return;
    }
    let cancelled = false;
    void (async () => {
      let status = 0;
      let body: unknown = undefined;
      try {
        const res = await authenticatedFetch(`${PYTHON_API_URL}/user-subscription`);
        status = res.status;
        body = await res.json().catch(() => undefined);
      } catch {
        status = 0; // no response at all
      }
      if (cancelled) return;
      const outcome = classifySubscriptionResponse(status, body);
      if (outcome.kind === 'sub') {
        setSub(outcome.sub as SubscriptionInfo);
      } else if (outcome.kind === 'none') {
        setSub(null);
      } else {
        // Keep whatever we already have — never downgrade on a failed check.
        log('[subscription] check failed — keeping the last known subscription', {
          reason: outcome.reason,
        });
      }
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [userId, token]);

  const planType = sub?.type ?? 'free';
  const isLifetime = planType === 'lifetime';
  const expiresOn = sub?.expires_on
    ? new Date(sub.expires_on.replace(' ', 'T'))
    : null;
  const isExpired = expiresOn ? expiresOn < new Date() : false;
  const isPro = isLifetime || (!!sub && sub.type !== 'free' && !isExpired);

  return (
    <SubscriptionContext.Provider value={{ sub, loaded, isPro, planType, isLifetime, isExpired }}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscriptionContext() {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) throw new Error('useSubscriptionContext must be used within <SubscriptionProvider>');
  return ctx;
}
