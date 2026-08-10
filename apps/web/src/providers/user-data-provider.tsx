'use client';

import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from 'react';
import { useSession } from 'next-auth/react';

interface UserDataContextValue {
  /** Always null — the legacy full-blob GET /user-data was removed in WS-8. */
  data: null;
  /** True once the cloud fetch has completed (or failed). */
  loaded: boolean;
}

const UserDataContext = createContext<UserDataContextValue>({ data: null, loaded: false });

/**
 * No-op placeholder since WS-8 (2026-08-10). The legacy full-blob
 * GET /user-data was removed; all user-data fields use the row APIs
 * (SPEC-034 / SPEC-039 5.2+). Kept for layout compatibility.
 */
export function UserDataProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const [data, setData] = useState<null>(null);
  const [loaded, setLoaded] = useState(false);
  // Track which user ID was last fetched so we re-fetch on user change
  const lastUserId = useRef<string | null>(null);

  const userId = session?.user?.id ?? null;

  useEffect(() => {
    if (status === 'loading') return;

    // Not authenticated — clear any stale data
    if (status !== 'authenticated' || !userId) {
      setData(null);
      setLoaded(true);
      lastUserId.current = null;
      return;
    }

    let cancelled = false;
    lastUserId.current = userId;

    // All user-data fields now use the row APIs (SPEC-039 5.2+); the legacy
    // full-blob GET /user-data is no longer fetched.
    if (!cancelled) {
      setData(null);
      setLoaded(true);
    }

    return () => { cancelled = true; };
  }, [status, userId]);

  return (
    <UserDataContext.Provider value={{ data, loaded }}>
      {children}
    </UserDataContext.Provider>
  );
}

/** Read the cloud user data from the shared provider. */
export function useCloudUserData(): UserDataContextValue {
  return useContext(UserDataContext);
}
