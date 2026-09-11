'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useUserDataColumns } from '@langplayer/api-client';
import { log, logwarn } from '@/lib/logger';
import { pushSettingsDiag, readSettingsDiag, getOrCreateDeviceId } from '@langplayer/utils';
import type { KeyValueStorage } from '@langplayer/utils';
import {
  createSettingsV2,
  normalizeSettingsV2,
  applyLegacySeed,
  hasLegacySeedValues,
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
  LegacySettingsSeed,
} from '@langplayer/shared';

const STORAGE_KEY = 'lp_settings';
const SYNC_DEBOUNCE_MS = 3000;

/** localStorage adapter for the settings diagnostics ring buffer. */
const diagStorage: KeyValueStorage = {
  getItem: (key) => Promise.resolve(localStorage.getItem(key)),
  setItem: (key, value) => {
    localStorage.setItem(key, value);
    return Promise.resolve();
  },
};

/**
 * Unified settings hook (SPEC-039 5.2 row API).
 *
 * - localStorage key: `lp_settings`
 * - Authenticated: hydrate from GET /user-settings (settings_v2, ts-based LWW)
 * - Changes: localStorage immediately + debounced PUT /user-settings
 */
export function useSettings() {
  const { data: session, status } = useSession();
  const { getUserSettings, putUserSettings } = useUserDataColumns();
  const [settings, setSettings] = useState<SettingsV2>(() => createSettingsV2());
  const [loaded, setLoaded] = useState(false);
  const [cloudHydrated, setCloudHydrated] = useState(false);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSyncing = useRef(false);
  const cloudLoadedUserId = useRef<string | null>(null);
  /**
   * True once the in-memory settings came from a real source (a saved local
   * blob, a legacy migration, or a successful cloud hydrate). While false the
   * state is the pristine `createSettingsV2()` defaults and persisting it —
   * with a fresh `ts` — would overwrite the user's saved copy locally and,
   * via the debounced PUT, destroy it server-side (the exact failure mode
   * fixed in 32154e91, still reachable through persist-before-hydration
   * vectors like `ensureL2`). The guard in `persist` drops those writes.
   */
  const hydratedFromSource = useRef(false);

  /** Pre-V2 legacy values that are now per-L2, waiting for the first language
   *  entry to be created (see `migrateFromLegacy` / `ensureL2`). Transient —
   *  never persisted or synced. */
  const legacySeedRef = useRef<LegacySettingsSeed | null>(null);

  // ── Helper: persist to localStorage + debounced row sync ──
  const persist = useCallback((s: SettingsV2) => {
    // Guard: never persist/sync a settings blob that was never backed by a
    // real source (saved blob, migration, or hydrated cloud row). A pristine
    // defaults blob stamped with a fresh ts would overwrite the user's saved
    // copy locally (the newer ts makes the next hydrate SKIP the cloud row)
    // and, via the debounced PUT (updatedAt = now), destroy it server-side —
    // the same failure mode 32154e91 fixed for the load effect, still
    // reachable through persist-before-hydration vectors (e.g. ensureL2 on
    // the settings display page). Log the drop so the window is visible.
    if (!hydratedFromSource.current && session) {
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
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch { /* quota exceeded */ }

    if (!session) return;
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(async () => {
      if (isSyncing.current) return;
      isSyncing.current = true;
      try {
        const deviceId = await getOrCreateDeviceId(diagStorage);
        log('[settings] PUT /user-settings', { ts: s.ts, updatedAt: Date.parse(s.ts) || Date.now(), deviceId });
        void pushSettingsDiag(diagStorage, 'PUT /user-settings', {
          ts: s.ts,
          updatedAt: Date.parse(s.ts) || Date.now(),
          review: s.review,
          deviceId,
        });
        await putUserSettings({
          settings_v2: s,
          updatedAt: Date.parse(s.ts) || Date.now(),
          deviceId,
        });
      } catch (err) {
        logwarn('[settings] Cloud sync failed:', err);
        void pushSettingsDiag(diagStorage, 'PUT /user-settings FAILED', { error: String(err) });
      } finally {
        isSyncing.current = false;
      }
    }, SYNC_DEBOUNCE_MS);
  }, [session, putUserSettings]);

  // ── Migrate from legacy keys ──
  // Returns null when no legacy keys exist: an empty local store must NOT be
  // persisted/synced (that would overwrite the user's cloud copy with
  // defaults — `createSettingsV2()` now stamps an epoch ts precisely so the
  // cloud row wins the LWW comparison on the next hydrate).
  //
  // Values that are now PER-L2 (translation, phonetics, traditional, speech)
  // cannot be written here: the legacy keys carry no language, and the app does
  // not know which L2 will be opened first. They go into `legacySeedRef` and are
  // applied by `ensureL2` when it creates the first language entry. (Until
  // 2026-09-11 these were stashed as `__migrated*` fields that NOTHING read, so
  // every recovered phonetics/traditional/speech value was silently dropped and
  // the dead fields were persisted into the blob.)
  const migrateFromLegacy = useCallback((): SettingsV2 | null => {
    try {
      let migrated = false;
      const newSettings = createSettingsV2();
      const seed: LegacySettingsSeed = {};
      const oldTranslation = localStorage.getItem('lp_show_translation');
      if (oldTranslation !== null) {
        try { seed.translation = JSON.parse(oldTranslation) as boolean; migrated = true; } catch {}
      }
      const oldPhonetics = localStorage.getItem('lp_show_phonetics');
      if (oldPhonetics !== null) {
        try { seed.phonetics = JSON.parse(oldPhonetics) as boolean; migrated = true; } catch {}
      }
      const oldTraditional = localStorage.getItem('lp_use_traditional');
      if (oldTraditional !== null) {
        try { seed.traditional = JSON.parse(oldTraditional) as boolean; migrated = true; } catch {}
      }
      const oldSrs = localStorage.getItem('zthSrsProgress');
      if (oldSrs) {
        try {
          const parsed = JSON.parse(oldSrs);
          if (parsed?.settings?.dailyNewLimit != null) {
            newSettings.review.dailyNewLimit = parsed.settings.dailyNewLimit;
            migrated = true;
          }
        } catch {}
      }
      const oldSpeech = localStorage.getItem('zthSpeechSettings');
      if (oldSpeech) {
        try {
          const parsed = JSON.parse(oldSpeech);
          if (parsed.voiceURI || parsed.rate != null) {
            seed.speech = { voiceURI: parsed.voiceURI ?? null, rate: parsed.rate };
            migrated = true;
          }
        } catch {}
      }
      if (!migrated) return null;
      if (hasLegacySeedValues(seed)) legacySeedRef.current = seed;
      // A real migration is a real write — stamp a fresh ts so the migrated
      // values win the LWW comparison on other devices.
      newSettings.ts = new Date().toISOString();
      return newSettings;
    } catch {
      return null;
    }
  }, []);

  // ── Load from localStorage on mount (with legacy migration) ──
  useEffect(() => {
    if (loaded) return;
    if (status === 'loading') return;

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.v === 2) {
          hydratedFromSource.current = true;
          const restored = normalizeSettingsV2(parsed);
          log('[settings] loaded local blob — ts:', restored.ts, 'review:', JSON.stringify(restored.review));
          void pushSettingsDiag(diagStorage, 'loaded local blob', { ts: restored.ts, review: restored.review });
          setSettings(restored);
          setLoaded(true);
          return;
        }
      }
      const migrated = migrateFromLegacy();
      if (migrated) {
        // A real migration is a real write — safe to persist even before the
        // cloud hydrate (it carries the user's legacy values).
        hydratedFromSource.current = true;
        log('[settings] migrated legacy keys — ts:', migrated.ts);
        void pushSettingsDiag(diagStorage, 'migrated legacy keys', { ts: migrated.ts, review: migrated.review });
        setSettings(migrated);
        persist(migrated);
      } else {
        log('[settings] no local blob — starting from defaults');
        void pushSettingsDiag(diagStorage, 'no local blob — starting from defaults');
      }
    } catch {
      logwarn('[settings] local blob corrupted — starting from defaults');
      void pushSettingsDiag(diagStorage, 'local blob corrupted — starting from defaults');
    }
    setLoaded(true);
  }, [status, loaded, migrateFromLegacy, persist]);

  // ── Boot: log the recent settings diagnostics history (survives reloads,
  //    so a reset that happened in a previous session is still explainable) ──
  useEffect(() => {
    void readSettingsDiag(diagStorage).then((events) => {
      const tail = events.slice(-12);
      if (tail.length > 0) {
        log('[settings] recent diagnostics:', tail);
      }
    });
    // Expose an on-demand dump for DevTools: window.__settingsDiag()
    if (typeof window !== 'undefined') {
      (window as any).__settingsDiag = () =>
        readSettingsDiag(diagStorage).then((events) => {
          log('[settings] diag history (window.__settingsDiag):', JSON.stringify(events));
          return events;
        });
    }
  }, []);

  // ── Authenticated: hydrate from the row API (ts-based LWW) ──
  useEffect(() => {
    if (status !== 'authenticated') {
      cloudLoadedUserId.current = null;
      setCloudHydrated(true);
      return;
    }
    if (!loaded) return;
    const userId = session?.user?.id;
    if (!userId || cloudLoadedUserId.current === userId) return;
    cloudLoadedUserId.current = userId;
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
        if (!cloud || cloud.v !== 2) {
          void pushSettingsDiag(diagStorage, 'GET /user-settings ok — no settings_v2 row', {});
          setCloudHydrated(true);
          return;
        }
        setSettings((prev) => {
          // Stale cloud (older than the local blob) must not touch local
          // state — and must not bump the local ts either, or the next
          // comparison would silently discard a still-newer cloud row.
          if (cloud.ts <= prev.ts) {
            log('[settings] hydrate SKIP cloud — cloud.ts <= local.ts',
              { cloudTs: cloud.ts, localTs: prev.ts });
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
          log('[settings] hydrate APPLY cloud', {
            cloudTs: cloud.ts,
            localTs: prev.ts,
            dailyNewLimit: merged.review.dailyNewLimit,
            dayStartHour: merged.review.dayStartHour,
          });
          void pushSettingsDiag(diagStorage, 'hydrate APPLY cloud', {
            cloudTs: cloud.ts,
            localTs: prev.ts,
            review: merged.review,
          });
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(merged)); } catch {}
          return merged;
        });
        setCloudHydrated(true);
      } catch (err) {
        logwarn('[settings] Could not load from server:', err);
        void pushSettingsDiag(diagStorage, 'GET /user-settings FAILED', { error: String(err) });
        setCloudHydrated(true);
      }
    })();
    return () => { cancelled = true; };
  }, [status, loaded, session?.user?.id, getUserSettings]);

  // ── Global setters ──

  const updateTokenizedText = useCallback((patch: Partial<TokenizedTextSettings>) => {
    setSettings((prev) => {
      const next: SettingsV2 = {
        ...prev,
        ts: new Date().toISOString(),
        tokenizedText: { ...prev.tokenizedText, ...patch },
      };
      persist(next);
      return next;
    });
  }, [persist]);

  const updateDisplay = useCallback((patch: Partial<DisplaySettings>) => {
    setSettings((prev) => {
      const next: SettingsV2 = {
        ...prev,
        ts: new Date().toISOString(),
        display: { ...prev.display, ...patch },
      };
      persist(next);
      return next;
    });
  }, [persist]);

  const updatePlayback = useCallback((patch: Partial<PlaybackSettings>) => {
    setSettings((prev) => {
      const next: SettingsV2 = {
        ...prev,
        ts: new Date().toISOString(),
        playback: { ...prev.playback, ...patch },
      };
      persist(next);
      return next;
    });
  }, [persist]);

  const updateReview = useCallback((patch: Partial<ReviewSettings>) => {
    setSettings((prev) => {
      const next: SettingsV2 = {
        ...prev,
        ts: new Date().toISOString(),
        review: { ...prev.review, ...patch },
      };
      persist(next);
      return next;
    });
  }, [persist]);

  const updateSearch = useCallback((patch: Partial<SearchSettings>) => {
    setSettings((prev) => {
      const next: SettingsV2 = {
        ...prev,
        ts: new Date().toISOString(),
        search: { ...prev.search, ...patch },
      };
      persist(next);
      return next;
    });
  }, [persist]);

  // ── Per-L2 setter ──

  const updateL2 = useCallback((l2Code: string, patch: Partial<L2Settings>) => {
    setSettings((prev) => {
      const current = prev.l2[l2Code] ?? L2_DEFAULTS;
      const next: SettingsV2 = {
        ...prev,
        ts: new Date().toISOString(),
        l2: {
          ...prev.l2,
          [l2Code]: {
            tokenSpan: { ...current.tokenSpan, ...(patch.tokenSpan ?? {}) },
            display: { ...current.display, ...(patch.display ?? {}) },
            speech: { ...current.speech, ...(patch.speech ?? {}) },
            content: { ...current.content, ...(patch.content ?? {}) },
          },
        },
      };
      persist(next);
      return next;
    });
  }, [persist]);

  const ensureL2 = useCallback((l2Code: string) => {
    setSettings((prev) => {
      if (prev.l2[l2Code]) return prev;
      // Seed the first language entry with any recovered pre-V2 legacy values
      // (translation / phonetics / traditional / speech). Applied here rather
      // than at migration time because the legacy keys carry no language — the
      // first L2 the learner opens is the one they came from. The seed is then
      // cleared so a second language starts from the plain defaults.
      const seed = legacySeedRef.current;
      const entry = seed && hasLegacySeedValues(seed)
        ? applyLegacySeed({ ...L2_DEFAULTS }, seed)
        : L2_DEFAULTS;
      if (seed && hasLegacySeedValues(seed)) {
        legacySeedRef.current = null;
        log('[settings] applied legacy seed to first language entry:', l2Code, JSON.stringify(seed));
      }
      const next: SettingsV2 = {
        ...prev,
        ts: new Date().toISOString(),
        l2: { ...prev.l2, [l2Code]: entry },
      };
      persist(next);
      return next;
    });
  }, [persist]);

  /** Record the learner's last-used L1/L2 pair in the cloud settings blob so
   *  after login (on any device) they land back on it instead of a fresh
   *  /language-select. Last-write-wins by the stamped ts. Pushed immediately
   *  (not debounced) because a language change navigates away and the debounced
   *  PUT would be dropped by the page unload. */
  const setLanguagePair = useCallback((l1: string, l2: string) => {
    setSettings((prev) => {
      const next: SettingsV2 = {
        ...prev,
        ts: new Date().toISOString(),
        languagePair: { l1, l2, updatedAt: new Date().toISOString() },
      };
      persist(next);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      if (session && hydratedFromSource.current) {
        getOrCreateDeviceId(diagStorage).then((deviceId) =>
          putUserSettings({
            settings_v2: next,
            updatedAt: Date.parse(next.ts) || Date.now(),
            deviceId,
          }).catch(() => {})
        );
      }
      return next;
    });
  }, [persist, session, putUserSettings]);

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

    getL2: (code: string): L2Settings => settings.l2[code] ?? L2_DEFAULTS,
    updateL2,
    ensureL2,
    setLanguagePair,
  };
}
