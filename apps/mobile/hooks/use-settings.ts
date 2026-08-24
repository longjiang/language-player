import { useState, useCallback, useEffect, useRef } from 'react';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '@/contexts/AuthContext';
import { useUserDataColumns } from '@langplayer/api-client';
import { bootLogger } from '@/lib/logger';
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
import { pushSettingsDiag, readSettingsDiag } from '@langplayer/utils';
import type { KeyValueStorage } from '@langplayer/utils';
import type {
  SettingsV2,
  TokenizedTextSettings,
  DisplaySettings,
  PlaybackSettings,
  ReviewSettings,
  SearchSettings,
  L2Settings,
} from '@langplayer/shared';

const { log, logwarn } = bootLogger;

const STORAGE_KEY = 'lp_settings';
const SYNC_DEBOUNCE_MS = 3000;

/** SecureStore adapter for the settings diagnostics ring buffer. */
const diagStorage: KeyValueStorage = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
};

/**
 * Unified settings hook (SPEC-039 5.2 row API).
 *
 * - SecureStore replaces localStorage
 * - Authenticated: hydrate from GET /user-settings (settings_v2, ts-based LWW)
 * - Changes: SecureStore immediately + debounced PUT /user-settings
 */
export function useSettings() {
  const { user, loading } = useAuth();
  const { getUserSettings } = useUserDataColumns();
  const [settings, setSettings] = useState<SettingsV2>(() => createSettingsV2());
  const [loaded, setLoaded] = useState(false);
  const [cloudHydrated, setCloudHydrated] = useState(false);
  const [offlineMode, setOfflineModeState] = useState<boolean>(() => isOfflineModeEnabled());
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cloudLoadedUserId = useRef<string | null>(null);
  const prevUserIdRef = useRef<string | null | undefined>(undefined);
  /**
   * True once the in-memory settings came from a real source (a saved
   * SecureStore blob or a successful cloud hydrate). While false the state is
   * the pristine `createSettingsV2()` defaults (e.g. after the user-change
   * reset or a fresh install) and persisting it — with a fresh ts — would
   * overwrite the saved copy locally and, via the outbox, destroy it
   * server-side (the same failure mode 32154e91 fixed on web, still reachable
   * through persist-before-hydration vectors like `ensureL2`). The guard in
   * `persist` drops those writes and logs them.
   */
  const hydratedFromSource = useRef(false);

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
          if (parsed.v === 2) {
            const restored = normalizeSettingsV2(parsed);
            hydratedFromSource.current = true;
            log('[settings] loaded local blob — ts:', restored.ts,
              'review:', JSON.stringify(restored.review));
            void pushSettingsDiag(diagStorage, 'loaded local blob', { ts: restored.ts, review: restored.review });
            setSettings(restored);
          } else {
            log('[settings] local blob has v !== 2 — starting from defaults');
            void pushSettingsDiag(diagStorage, 'local blob has v !== 2 — starting from defaults');
          }
        } else {
          log('[settings] no local blob — starting from defaults');
          void pushSettingsDiag(diagStorage, 'no local blob — starting from defaults');
        }
      } catch {
        logwarn('[settings] local blob corrupted — starting from defaults');
        void pushSettingsDiag(diagStorage, 'local blob corrupted — starting from defaults');
      }
      setLoaded(true);
    })();
  }, []);

  // ── Boot: log the recent settings diagnostics history (survives reloads,
  //    so a reset that happened in a previous session is still explainable) ──
  useEffect(() => {
    void readSettingsDiag(diagStorage).then((events) => {
      const tail = events.slice(-12);
      if (tail.length > 0) {
        log('[settings] recent diagnostics:', tail);
      }
    });
  }, []);

  // ── Authenticated: hydrate from the row API (ts-based LWW) ──
  useEffect(() => {
    if (!loaded) return;
    if (!user) {
      cloudLoadedUserId.current = null;
      setCloudHydrated(true);
      return;
    }
    if (offlineMode) {
      log('[settings] hydrate skipped — offlineMode is on');
      setCloudHydrated(true);
      return;
    }
    if (cloudLoadedUserId.current === user.id) return;
    cloudLoadedUserId.current = user.id;
    setCloudHydrated(false);
    let cancelled = false;
    (async () => {
      try {
        const res = await getUserSettings();
        if (cancelled) return;
        // A definitive answer — even "no row yet" — means the current
        // defaults are a legitimate baseline (nothing saved to destroy).
        hydratedFromSource.current = true;
        const cloud = res.settings_v2;
        log('[settings] GET /user-settings ok — user:', user.id,
          'cloud v:', cloud?.v, 'cloud ts:', cloud?.ts,
          'cloud review:', JSON.stringify(cloud?.review ?? null));
        if (!cloud || cloud.v !== 2) {
          void pushSettingsDiag(diagStorage, 'GET /user-settings ok — no settings_v2 row', {});
          setCloudHydrated(true);
          return;
        }
        setSettings((prev) => {
          if (cloud.ts <= prev.ts) {
            log('[settings] hydrate SKIP cloud — cloud.ts <= local.ts',
              { cloudTs: cloud.ts, localTs: prev.ts, localReview: prev.review });
            void pushSettingsDiag(diagStorage, 'hydrate SKIP cloud (cloud.ts <= local.ts)', {
              cloudTs: cloud.ts,
              localTs: prev.ts,
              localReview: prev.review,
            });
            return prev;
          }
          const merged = normalizeSettingsV2({
            ...prev,
            ...cloud,
            v: 2 as const,
            ts: new Date().toISOString(),
          });
          log('[settings] hydrate APPLY cloud — dailyNewLimit:',
            merged.review.dailyNewLimit, 'dayStartHour:', merged.review.dayStartHour,
            'new ts:', merged.ts);
          void pushSettingsDiag(diagStorage, 'hydrate APPLY cloud', {
            cloudTs: cloud.ts,
            localTs: prev.ts,
            review: merged.review,
          });
          SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(merged)).catch(() => {});
          return merged;
        });
        setCloudHydrated(true);
      } catch (err) {
        logwarn('[settings] GET /user-settings failed — user:', user.id, err);
        void pushSettingsDiag(diagStorage, 'GET /user-settings FAILED', { error: String(err) });
        cloudLoadedUserId.current = null;
        setCloudHydrated(true);
      }
    })();
    return () => { cancelled = true; };
  }, [user, loaded, getUserSettings, offlineMode]);

  // ── User change (logout/login): drop the previous user's in-memory state ──
  useEffect(() => {
    if (loading) return; // auth still restoring — don't treat boot as a user change
    const prev = prevUserIdRef.current;
    const next = user?.id ?? null;
    prevUserIdRef.current = next;
    if (prev === undefined) return; // initial boot — keep locally loaded state
    if (prev !== next) {
      cloudLoadedUserId.current = null;
      hydratedFromSource.current = false; // in-memory state is fresh defaults again
      setCloudHydrated(next === null || offlineMode);
      log('[settings] user changed — resetting local settings',
        { from: prev, to: next });
      void pushSettingsDiag(diagStorage, 'user changed — resetting local settings', {
        from: prev,
        to: next,
      });
      setSettings(createSettingsV2());
      if (syncTimer.current) clearTimeout(syncTimer.current);
      if (next === null) {
        // Logged out: reflect the wipe's Offline Mode reset in the UI state.
        setOfflineModeState(false);
      }
    }
  }, [user?.id, loading]);

  // ── Persist + debounced row sync ──
  const persist = useCallback((s: SettingsV2) => {
    // Guard: never persist/sync a settings blob that was never backed by a
    // real source (saved SecureStore blob or hydrated cloud row). A pristine
    // defaults blob stamped with a fresh ts would overwrite the saved copy
    // locally and, via the outbox, destroy it server-side (the same failure
    // mode 32154e91 fixed on web, still reachable through persist-before-
    // hydration vectors like ensureL2 on the settings display page). Log the
    // drop so the window is visible.
    if (!hydratedFromSource.current && user) {
      log('[settings] persist SKIPPED — settings still pristine defaults (no local blob / hydration pending)', {
        ts: s.ts,
        review: s.review,
      });
      void pushSettingsDiag(diagStorage, 'persist SKIPPED (pristine defaults)', {
        ts: s.ts,
        review: s.review,
      });
      return;
    }
    SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(s)).catch(() => {});

    if (!user) return;
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(async () => {
      try {
        log('[settings] enqueue sync — payload keys:', Object.keys(s).join(', '),
          '— offlineMode present:', 'offlineMode' in s);
        void pushSettingsDiag(diagStorage, 'enqueue sync (outbox)', {
          ts: s.ts,
          updatedAt: Date.parse(s.ts) || Date.now(),
          review: s.review,
        });
        await enqueueSyncOp({
          entity: 'settings',
          entityId: 'v2',
          op: 'upsert',
          payload: { settings_v2: s, ts: s.ts },
          updatedAt: Date.parse(s.ts) || Date.now(),
        });
      } catch (err) {
        logwarn('[settings] Cloud sync failed:', err);
        void pushSettingsDiag(diagStorage, 'enqueue sync FAILED', { error: String(err) });
      }
    }, SYNC_DEBOUNCE_MS);
  }, [user]);

  // ── Pull-merge bridge: apply remote settings when the engine pulls them ──
  useEffect(() => {
    const unsub = subscribeEntity('settings', () => {
      void (async () => {
        try {
          const row = await getEntityCacheRow('settings', 'v2');
          if (!row || row.deleted_at != null) {
            log('[settings] pull bridge — no settings cache row');
            return;
          }
          const payload = JSON.parse(row.payload) as { settings_v2?: SettingsV2 };
          const cloud = payload.settings_v2;
          log('[settings] pull bridge — cache row ts:', row.updated_at,
            'cloud ts:', cloud?.ts,
            'cloud review:', JSON.stringify(cloud?.review ?? null));
          if (!cloud || cloud.v !== 2) return;
          setSettings((prev) => {
            if (cloud.ts <= prev.ts) {
              log('[settings] pull bridge SKIP cloud — cloud.ts <= local.ts',
                { cloudTs: cloud.ts, localTs: prev.ts, localReview: prev.review });
              return prev;
            }
            const merged = normalizeSettingsV2({
              ...prev,
              ...cloud,
              v: 2 as const,
              ts: new Date().toISOString(),
            });
            hydratedFromSource.current = true;
            log('[settings] pull bridge APPLY cloud — dailyNewLimit:',
              merged.review.dailyNewLimit, 'dayStartHour:', merged.review.dayStartHour,
              'new ts:', merged.ts);
            void pushSettingsDiag(diagStorage, 'pull bridge APPLY cloud', {
              cloudTs: cloud.ts,
              localTs: prev.ts,
              review: merged.review,
            });
            SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(merged)).catch(() => {});
            return merged;
          });
        } catch (err) {
          logwarn('[settings] pull bridge failed:', err);
        }
      })();
    });
    return unsub;
  }, []);

  // ── SSR-safe updates (write-through) ──
  // `update` accepts either a patch or a patch-builder receiving the latest
  // `prev`, so section setters never build their patch from a stale render
  // closure (two rapid updates to the same section used to lose the first).
  const update = useCallback(
    (patch: Partial<SettingsV2> | ((prev: SettingsV2) => Partial<SettingsV2>)) => {
      setSettings((prev) => {
        const applied = typeof patch === 'function' ? patch(prev) : patch;
        // No-op patch (e.g. ensureL2 when the section already exists) — do
        // not bump ts or re-persist, which would re-rank LWW for nothing.
        if (Object.keys(applied).length === 0) return prev;
        const next = { ...prev, ...applied, ts: new Date().toISOString() };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const updateTokenizedText = useCallback(
    (patch: Partial<TokenizedTextSettings>) =>
      update((prev) => ({ tokenizedText: { ...prev.tokenizedText, ...patch } })),
    [update],
  );

  const updateDisplay = useCallback(
    (patch: Partial<DisplaySettings>) =>
      update((prev) => ({ display: { ...prev.display, ...patch } })),
    [update],
  );

  const updatePlayback = useCallback(
    (patch: Partial<PlaybackSettings>) =>
      update((prev) => ({ playback: { ...prev.playback, ...patch } })),
    [update],
  );

  const updateReview = useCallback(
    (patch: Partial<ReviewSettings>) =>
      update((prev) => ({ review: { ...prev.review, ...patch } })),
    [update],
  );

  const updateSearch = useCallback(
    (patch: Partial<SearchSettings>) =>
      update((prev) => ({ search: { ...prev.search, ...patch } })),
    [update],
  );

  const getL2 = useCallback(
    (code: string): L2Settings => settings.l2[code] ?? { ...L2_DEFAULTS },
    [settings.l2],
  );

  const updateL2 = useCallback(
    (code: string, patch: Partial<L2Settings>) =>
      update((prev) => ({
        l2: {
          ...prev.l2,
          [code]: { ...(prev.l2[code] ?? L2_DEFAULTS), ...patch },
        },
      })),
    [update],
  );

  const ensureL2 = useCallback(
    (code: string) => {
      update((prev) => {
        if (prev.l2[code]) return {};
        return { l2: { ...prev.l2, [code]: { ...L2_DEFAULTS } } };
      });
    },
    [update],
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
    cloudHydrated,
    offlineMode,
    setOfflineMode,
    getL2,
    updateL2,
    ensureL2,
  };
}
