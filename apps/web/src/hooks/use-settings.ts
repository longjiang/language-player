'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useUserDataColumns } from '@langplayer/api-client';
import { logwarn } from '@/lib/logger';
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
 * - localStorage key: `lp_settings`
 * - Authenticated: hydrate from GET /user-settings (settings_v2, ts-based LWW)
 * - Changes: localStorage immediately + debounced PUT /user-settings
 */
export function useSettings() {
  const { data: session, status } = useSession();
  const { getUserSettings, putUserSettings } = useUserDataColumns();
  const [settings, setSettings] = useState<SettingsV2>(() => createSettingsV2());
  const [loaded, setLoaded] = useState(false);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSyncing = useRef(false);
  const cloudLoaded = useRef(false);

  // ── Helper: persist to localStorage + debounced row sync ──
  const persist = useCallback((s: SettingsV2) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch { /* quota exceeded */ }

    if (!session) return;
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
  }, [session, putUserSettings]);

  // ── Migrate from legacy keys (unchanged) ──
  const migrateFromLegacy = useCallback((): SettingsV2 | null => {
    try {
      const newSettings = createSettingsV2();
      const oldTranslation = localStorage.getItem('lp_show_translation');
      if (oldTranslation !== null) {
        try { newSettings.display.translation = JSON.parse(oldTranslation) as boolean; } catch {}
      }
      const oldPhonetics = localStorage.getItem('lp_show_phonetics');
      if (oldPhonetics !== null) {
        try { (newSettings as any).__migratedPhonetics = JSON.parse(oldPhonetics) as boolean; } catch {}
      }
      const oldTraditional = localStorage.getItem('lp_use_traditional');
      if (oldTraditional !== null) {
        try { (newSettings as any).__migratedTraditional = JSON.parse(oldTraditional) as boolean; } catch {}
      }
      const oldSrs = localStorage.getItem('zthSrsProgress');
      if (oldSrs) {
        try {
          const parsed = JSON.parse(oldSrs);
          if (parsed?.settings?.dailyNewLimit != null) {
            newSettings.review.dailyNewLimit = parsed.settings.dailyNewLimit;
          }
        } catch {}
      }
      const oldSpeech = localStorage.getItem('zthSpeechSettings');
      if (oldSpeech) {
        try {
          const parsed = JSON.parse(oldSpeech);
          if (parsed.voiceURI || parsed.rate != null) {
            (newSettings as any).__migratedSpeech = parsed;
          }
        } catch {}
      }
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
          setSettings(normalizeSettingsV2(parsed));
          setLoaded(true);
          return;
        }
      }
      const migrated = migrateFromLegacy();
      if (migrated) {
        setSettings(migrated);
        persist(migrated);
      }
    } catch { /* corrupted — defaults */ }
    setLoaded(true);
  }, [status, loaded, migrateFromLegacy, persist]);

  // ── Authenticated: hydrate from the row API (ts-based LWW) ──
  useEffect(() => {
    if (status !== 'authenticated' || !loaded || cloudLoaded.current) return;
    cloudLoaded.current = true;
    let cancelled = false;
    (async () => {
      try {
        const res = await getUserSettings();
        if (cancelled) return;
        const cloud = res.settings_v2;
        if (!cloud || cloud.v !== 2) return;
        setSettings((prev) => {
          const merged = normalizeSettingsV2({
            ...prev,
            ...(cloud.ts > prev.ts ? cloud : {}),
            ts: new Date().toISOString(),
          });
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(merged)); } catch {}
          return merged;
        });
      } catch (err) {
        logwarn('[settings] Could not load from server:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [status, loaded, getUserSettings]);

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
      const next: SettingsV2 = {
        ...prev,
        ts: new Date().toISOString(),
        l2: { ...prev.l2, [l2Code]: L2_DEFAULTS },
      };
      persist(next);
      return next;
    });
  }, [persist]);

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

    getL2: (code: string): L2Settings => settings.l2[code] ?? L2_DEFAULTS,
    updateL2,
    ensureL2,
  };
}
