import { useState, useCallback, useEffect, useRef } from 'react';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '@/contexts/AuthContext';
import { useUserDataColumns } from '@langplayer/api-client';
import { log, logwarn } from '@/lib/logger';
import { enqueueSyncOp, subscribeEntity } from '@/lib/sync-engine';
import { getEntityCacheRow } from '@/lib/sync-db';
import {
  initOfflineMode,
  isOfflineModeEnabled,
  setOfflineModeEnabled,
} from '@/lib/offline-mode';
import {
  createSettingsV2,
  normalizeSettingsV2,
  L2_DEFAULTS,
} from '@langplayer/shared';
import type {
  SettingsV2,
  TokenizedTextSettings,
  DisplaySettings,
  PlaybackSettings,
  ReviewSettings,
  SearchSettings,
  L2Settings,
} from '@langplayer/shared';

const STORAGE_KEY = 'lp_settings';
const SYNC_DEBOUNCE_MS = 3000;

/**
 * Unified settings hook (SPEC-039 5.2 row API).
 *
 * - SecureStore replaces localStorage
 * - Authenticated: hydrate from GET /user-settings (settings_v2, ts-based LWW)
 * - Changes: SecureStore immediately + debounced PUT /user-settings
 */
export function useSettings() {
  const { user } = useAuth();
  const { getUserSettings } = useUserDataColumns();
  const [settings, setSettings] = useState<SettingsV2>(() => createSettingsV2());
  const [loaded, setLoaded] = useState(false);
  const [offlineMode, setOfflineModeState] = useState<boolean>(() => isOfflineModeEnabled());
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cloudLoadedUserId = useRef<string | null>(null);
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  // Local-only network kill switch: stored separately from SettingsV2 and
  // never included in the cloud PUT, so it never syncs to the account.
  useEffect(() => {
    void initOfflineMode().then((value) => setOfflineModeState(value));
  }, []);

  const setOfflineMode = useCallback((value: boolean) => {
    setOfflineModeState(value);
    return setOfflineModeEnabled(value);
  }, []);

  // ── Load from SecureStore ──
  useEffect(() => {
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<SettingsV2>;
          if (parsed.v === 2) setSettings(normalizeSettingsV2(parsed));
        }
      } catch { /* corrupted or not found */ }
      setLoaded(true);
    })();
  }, []);

  // ── Authenticated: hydrate from the row API (ts-based LWW) ──
  useEffect(() => {
    if (!user || !loaded || cloudLoadedUserId.current === user.id || offlineMode) return;
    cloudLoadedUserId.current = user.id;
    let cancelled = false;
    (async () => {
      try {
        const res = await getUserSettings();
        if (cancelled) return;
        const cloud = res.settings_v2;
        if (!cloud || cloud.v !== 2) return;
        setSettings((prev) => {
          if (cloud.ts <= prev.ts) return prev;
          const merged = normalizeSettingsV2({
            ...prev,
            ...cloud,
            v: 2 as const,
            ts: new Date().toISOString(),
          });
          SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(merged)).catch(() => {});
          return merged;
        });
      } catch (err) {
        logwarn('[settings] Could not load from server:', err);
        cloudLoadedUserId.current = null;
      }
    })();
    return () => { cancelled = true; };
  }, [user, loaded, getUserSettings, offlineMode]);

  // ── User change (logout/login): drop the previous user's in-memory state ──
  useEffect(() => {
    const prev = prevUserIdRef.current;
    const next = user?.id ?? null;
    prevUserIdRef.current = next;
    if (prev === undefined) return; // initial boot — keep locally loaded state
    if (prev !== next) {
      cloudLoadedUserId.current = null;
      setSettings(createSettingsV2());
      if (syncTimer.current) clearTimeout(syncTimer.current);
      if (next === null) {
        // Logged out: reflect the wipe's Offline Mode reset in the UI state.
        setOfflineModeState(false);
      }
    }
  }, [user?.id]);

  // ── Persist + debounced row sync ──
  const persist = useCallback((s: SettingsV2) => {
    SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(s)).catch(() => {});

    if (!user) return;
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(async () => {
      try {
        log('[settings] enqueue sync — payload keys:', Object.keys(s).join(', '),
          '— offlineMode present:', 'offlineMode' in s);
        await enqueueSyncOp({
          entity: 'settings',
          entityId: 'v2',
          op: 'upsert',
          payload: { settings_v2: s, ts: s.ts },
          updatedAt: Date.parse(s.ts) || Date.now(),
        });
      } catch (err) {
        logwarn('[settings] Cloud sync failed:', err);
      }
    }, SYNC_DEBOUNCE_MS);
  }, [user]);

  // ── Pull-merge bridge: apply remote settings when the engine pulls them ──
  useEffect(() => {
    const unsub = subscribeEntity('settings', () => {
      void (async () => {
        try {
          const row = await getEntityCacheRow('settings', 'v2');
          if (!row || row.deleted_at != null) return;
          const payload = JSON.parse(row.payload) as { settings_v2?: SettingsV2 };
          const cloud = payload.settings_v2;
          if (!cloud || cloud.v !== 2) return;
          setSettings((prev) => {
            if (cloud.ts <= prev.ts) return prev;
            const merged = normalizeSettingsV2({
              ...prev,
              ...cloud,
              v: 2 as const,
              ts: new Date().toISOString(),
            });
            SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(merged)).catch(() => {});
            return merged;
          });
        } catch {
          // Corrupt payload — ignore.
        }
      })();
    });
    return unsub;
  }, []);

  // ── SSR-safe updates (write-through) ──
  const update = useCallback(
    (patch: Partial<SettingsV2>) => {
      setSettings((prev) => {
        const next = { ...prev, ...patch, ts: new Date().toISOString() };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const updateTokenizedText = useCallback(
    (patch: Partial<TokenizedTextSettings>) =>
      update({ tokenizedText: { ...settings.tokenizedText, ...patch } }),
    [update, settings.tokenizedText],
  );

  const updateDisplay = useCallback(
    (patch: Partial<DisplaySettings>) =>
      update({ display: { ...settings.display, ...patch } }),
    [update, settings.display],
  );

  const updatePlayback = useCallback(
    (patch: Partial<PlaybackSettings>) =>
      update({ playback: { ...settings.playback, ...patch } }),
    [update, settings.playback],
  );

  const updateReview = useCallback(
    (patch: Partial<ReviewSettings>) =>
      update({ review: { ...settings.review, ...patch } }),
    [update, settings.review],
  );

  const updateSearch = useCallback(
    (patch: Partial<SearchSettings>) =>
      update({ search: { ...settings.search, ...patch } }),
    [update, settings.search],
  );

  const getL2 = useCallback(
    (code: string): L2Settings => settings.l2[code] ?? { ...L2_DEFAULTS },
    [settings.l2],
  );

  const updateL2 = useCallback(
    (code: string, patch: Partial<L2Settings>) =>
      update({
        l2: {
          ...settings.l2,
          [code]: { ...getL2(code), ...patch },
        },
      }),
    [update, settings.l2, getL2],
  );

  const ensureL2 = useCallback(
    (code: string) => {
      if (!settings.l2[code]) {
        update({ l2: { ...settings.l2, [code]: { ...L2_DEFAULTS } } });
      }
    },
    [update, settings.l2],
  );

  return {
    settings,
    loaded,
    tokenizedText: settings.tokenizedText,
    updateTokenizedText,
    display: settings.display,
    updateDisplay,
    playback: settings.playback,
    updatePlayback,
    review: settings.review,
    updateReview,
    search: settings.search,
    updateSearch,
    offlineMode,
    setOfflineMode,
    getL2,
    updateL2,
    ensureL2,
  };
}
