import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSettingsContext } from '@/contexts/SettingsContext';
import {
  runSyncNow,
  setEngineOfflineMode,
  startSyncEngine,
  subscribeSyncStatus,
  type SyncStatusSnapshot,
} from '@/lib/sync-engine';

interface SyncStatusContextValue {
  status: SyncStatusSnapshot;
  syncNow: () => Promise<void>;
}

const SyncStatusContext = createContext<SyncStatusContextValue | null>(null);

const INITIAL_STATUS: SyncStatusSnapshot = {
  connectivity: 'unknown',
  offlineMode: false,
  effectiveOffline: true,
  syncing: false,
  pendingCount: 0,
  errorCount: 0,
  lastSyncAt: null,
  lastError: null,
};

export function SyncStatusProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { offlineMode } = useSettingsContext();
  const [status, setStatus] = useState<SyncStatusSnapshot>(INITIAL_STATUS);
  const userIdRef = useRef<string | null>(user?.id ?? null);
  userIdRef.current = user?.id ?? null;

  // Start the engine once, after auth/settings providers are mounted.
  useEffect(() => {
    const stop = startSyncEngine(() => ({ userId: userIdRef.current }));
    const unsub = subscribeSyncStatus(setStatus);
    return () => {
      unsub();
      stop();
    };
  }, []);

  // Keep the manual Offline Mode override in the engine's status model.
  useEffect(() => {
    setEngineOfflineMode(offlineMode);
  }, [offlineMode]);

  // Trigger a cycle right after login/session restore (the engine's periodic
  // timer would eventually do this, but an immediate attempt is expected).
  useEffect(() => {
    if (user) void runSyncNow();
  }, [user]);

  const syncNow = useCallback(() => runSyncNow(), []);

  return (
    <SyncStatusContext.Provider value={{ status, syncNow }}>
      {children}
    </SyncStatusContext.Provider>
  );
}

export function useSyncStatus(): SyncStatusContextValue {
  const ctx = useContext(SyncStatusContext);
  if (!ctx) {
    throw new Error('useSyncStatus must be used within <SyncStatusProvider>');
  }
  return ctx;
}
