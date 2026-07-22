import React, { createContext, useContext, useEffect, useState, useRef, type ReactNode } from 'react';
import { useUserData, type UserDataResponse } from '@langplayer/api-client';
import { useAuth } from './AuthContext';

interface UserDataContextValue {
  data: UserDataResponse | null;
  loaded: boolean;
}

const UserDataContext = createContext<UserDataContextValue>({ data: null, loaded: false });

/**
 * Fetches GET /user-data ONCE when the user is authenticated, then
 * distributes the result via React Context. All downstream hooks
 * (useSavedWords, useSrs, useSettings) read from this context.
 */
export function UserDataProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { getUserData } = useUserData();
  const [data, setData] = useState<UserDataResponse | null>(null);
  const [loaded, setLoaded] = useState(false);
  const lastUserId = useRef<string | null>(null);

  const userId = user?.id ?? null;

  useEffect(() => {
    if (authLoading) return;

    if (!userId) {
      setData(null);
      setLoaded(true);
      lastUserId.current = null;
      return;
    }

    if (loaded && lastUserId.current === userId) return;

    let cancelled = false;
    lastUserId.current = userId;

    getUserData()
      .then((result) => { if (!cancelled) setData(result); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoaded(true); });

    return () => { cancelled = true; };
  }, [userId, authLoading, loaded, getUserData]);

  return (
    <UserDataContext.Provider value={{ data, loaded }}>
      {children}
    </UserDataContext.Provider>
  );
}

export function useCloudUserData(): UserDataContextValue {
  return useContext(UserDataContext);
}
