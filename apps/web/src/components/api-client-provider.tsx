'use client';

import { useRef, useMemo } from 'react';
import { createApiClient } from '@langplayer/api-client';
import { useSession } from 'next-auth/react';
import { PYTHON_API_URL } from '@/lib/api-url';

/**
 * Initializes the shared API client synchronously before any child component
 * mounts, avoiding the race condition where useSavedWords tries apiClient.get()
 * before the client exists.
 *
 * getAccessToken reads the latest session from a ref so we don't need to
 * re-create the client on every auth change.
 */
export function ApiClientProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const sessionRef = useRef(session);
  sessionRef.current = session; // always current

  // Initialize synchronously (not in useEffect) — runs before child effects
  useMemo(() => {
    createApiClient({
      baseURL: PYTHON_API_URL,
      timeout: 15000,
      getAccessToken() {
        const token = (sessionRef.current?.user as any)?.directusToken as string | undefined;
        return Promise.resolve(token ?? null);
      },
      onError(error) {
        console.error('[API]', error.code, error.message);
      },
    });
  }, []); // once, on mount

  return <>{children}</>;
}
