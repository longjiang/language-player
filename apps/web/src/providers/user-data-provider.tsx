'use client';

import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from 'react';
import { useSession } from 'next-auth/react';
import type { UserDataResponse } from '@langplayer/api-client';

interface UserDataContextValue {
  /** The full user-data response from GET /user-data, or null if not yet fetched / error. */
  data: UserDataResponse | null;
  /** True once the cloud fetch has completed (or failed). */
  loaded: boolean;
}

const UserDataContext = createContext<UserDataContextValue>({ data: null, loaded: false });

/**
 * Fetches GET /user-data ONCE when the user is authenticated, then
 * distributes the result via React Context. Downstream hooks (useSrs,
 * useSettings, useProgress) read from this context instead of calling
 * getUserData() independently. Saved words hydrate from GET /saved-words
 * (SPEC-034) and do not use this context.
 *
 * Re-fetches automatically when the user ID changes (login/logout/switch).
 */
export function UserDataProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const [data, setData] = useState<UserDataResponse | null>(null);
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
