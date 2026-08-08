import { useState, useCallback, useEffect, useRef } from 'react';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '@/contexts/AuthContext';
import { useUserDataColumns } from '@langplayer/api-client';
import { logwarn } from '@/lib/logger';
import {
  initOfflineMode,
  isOfflineModeEnabled,
  setOfflineModeEnabled,
} from '@/lib/offline-mode';
import {
  createSettingsV2,
  L2_DEFAULTS,
} from '@langplayer/shared';
import type {
  SettingsV2,
  TokenizedTextSettings,
  DisplaySettings,
  PlaybackSettings,
  ReviewSettings,
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
  const { getUserSettings, putUserSettings } = useUserDataColumns();
  const [settings, setSettings] = useState<SettingsV2>(() => createSettingsV2());
  const [loaded, setLoaded] = useState(false);
  const [offlineMode, setOfflineModeState] = useState<boolean>(() => isOfflineModeEnabled());
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSyncing = useRef(false);
  const cloudLoaded = useRef(false);

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
          const parsed = JSON.parse(raw) as SettingsV2;
          if (parsed.v === 2) setSettings(parsed);
        }
      } catch { /* corrupted or not found */ }
      setLoaded(true);
    })();
  }, []);

  // ── Authenticated: hydrate from the row API (ts-based LWW) ──
  useEffect(() => {
    if (!user || !loaded || cloudLoaded.current || offlineMode) return;
    cloudLoaded.current = true;
    let cancelled = false;
    (async () => {
      try {
        const res = await getUserSettings();
        if (cancelled) return;
        const cloud = res.settings_v2;
        if (!cloud || cloud.v !== 2) return;
        setSettings((prev) => {
          if (cloud.ts <= prev.ts) return prev;
          const merged = { ...cloud, ...prev, v: 2 as const, ts: new Date().toISOString() };
          SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(merged)).catch(() => {});
          return merged;
        });
      } catch (err) {
        logwarn('[settings] Could not load from server:', err);
        cloudLoaded.current = false;
      }
    })();
    return () => { cancelled = true; };
  }, [user, loaded, getUserSettings, offlineMode]);

  // ── Persist + debounced row sync ──
  const persist = useCallback((s: SettingsV2) => {
    SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(s)).catch(() => {});

    if (!user) return;
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(async () => {
      if (isSyncing.current) return;
      isSyncing.current = true;
      try {
        await putUserSettings({ settings_v2: s });
      } catch (err) {
        logwarn('[settings] Cloud sync failed:', err);
      } finally {
        isSyncing.current = false;
      }
    }, SYNC_DEBOUNCE_MS);
  }, [user, putUserSettings]);

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
    offlineMode,
    setOfflineMode,
    getL2,
    updateL2,
    ensureL2,
  };
}
