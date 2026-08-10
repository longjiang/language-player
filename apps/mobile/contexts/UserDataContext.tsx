import React, { createContext, useContext, useEffect, useState, useRef, type ReactNode } from 'react';
import { useAuth } from './AuthContext';

interface UserDataContextValue {
  /** Always null — the legacy full-blob GET /user-data was removed in WS-8. */
  data: null;
  loaded: boolean;
}

const UserDataContext = createContext<UserDataContextValue>({ data: null, loaded: false });

/**
 * Placeholder provider kept for layout compatibility. All user-data fields use
 * the row APIs (SPEC-039 5.2+ / SPEC-034); the legacy full-blob GET /user-data
 * was removed with the saved-words scaffolding (WS-8, 2026-08-10).
 */
export function UserDataProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [loaded, setLoaded] = useState(false);
  const lastUserId = useRef<string | null>(null);

  const userId = user?.id ?? null;

  useEffect(() => {
    if (authLoading) return;

    if (!userId) {
      setLoaded(true);
      lastUserId.current = null;
      return;
    }

    if (loaded && lastUserId.current === userId) return;
    lastUserId.current = userId;
    setLoaded(true);
  }, [userId, authLoading, loaded]);

  return (
    <UserDataContext.Provider value={{ data: null, loaded }}>
      {children}
    </UserDataContext.Provider>
  );
}

export function useCloudUserData(): UserDataContextValue {
  return useContext(UserDataContext);
}
