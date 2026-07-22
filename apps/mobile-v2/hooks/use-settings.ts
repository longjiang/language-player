import { useState, useCallback, useEffect, useRef } from 'react';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '@/contexts/AuthContext';
import { useCloudUserData } from '@/contexts/UserDataContext';
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
import { useUserData } from '@langplayer/api-client';

const STORAGE_KEY = 'lp_settings';
const SYNC_DEBOUNCE_MS = 3000;

/**
 * Unified settings hook — ported from apps/web/src/hooks/use-settings.ts.
 *   - SecureStore replaces localStorage
 *   - useAuth() replaces useSession()
 *   - Cloud sync via read-merge-write (same as web)
 */
export function useSettings() {
  const { user } = useAuth();
  const { getUserData } = useUserData();
  const { data: cloudData, loaded: cloudLoaded } = useCloudUserData();
  const [settings, setSettings] = useState<SettingsV2>(() => createSettingsV2());
  const [loaded, setLoaded] = useState(false);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSyncing = useRef(false);

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

  // ── Merge cloud settings on load ──
  useEffect(() => {
    if (!user || !loaded || !cloudLoaded || !cloudData?.settings_v2) return;
    try {
      const cloud = JSON.parse(cloudData.settings_v2) as SettingsV2;
      if (cloud.v === 2) {
        setSettings((prev) => {
          if (cloud.ts > prev.ts) {
            const merged = { ...cloud, ...prev, v: 2 as const, ts: new Date().toISOString() };
            SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(merged));
            return merged;
          }
          return prev;
        });
      }
    } catch { /* ignore parse errors */ }
  }, [user, loaded, cloudLoaded, cloudData]);

  // ── Persist + cloud sync ──
  const persist = useCallback((s: SettingsV2) => {
    SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(s)).catch(() => {});

    if (!user) return;
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(async () => {
      if (isSyncing.current) return;
      isSyncing.current = true;
      try {
        const { apiClient } = await import('@langplayer/api-client');
        const cloudResp = await getUserData();
        if (cloudResp?.settings_v2) {
          const cloud = JSON.parse(cloudResp.settings_v2) as SettingsV2;
          if (cloud.v === 2 && cloud.ts > s.ts) {
            s = { ...cloud, ...s, v: 2, ts: new Date().toISOString() };
            SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(s)).catch(() => {});
          }
        }
        await apiClient.post('/user-data/sync', { settings_v2: JSON.stringify(s) });
      } catch (err) {
        console.warn('[settings] Cloud sync failed:', err);
      } finally {
        isSyncing.current = false;
      }
    }, SYNC_DEBOUNCE_MS);
  }, [user, getUserData]);

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
    getL2,
    updateL2,
    ensureL2,
  };
}
