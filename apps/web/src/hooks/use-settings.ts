'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useUserData } from '@langplayer/api-client';
import {
  createSettingsV2,
  TOKENIZED_TEXT_DEFAULTS,
  DISPLAY_DEFAULTS,
  PLAYBACK_DEFAULTS,
  REVIEW_DEFAULTS,
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
 * Unified settings hook.
 *
 * Store shape: SettingsV2 (see @langplayer/shared)
 * - localStorage key: `lp_settings`
 * - Cloud field: `user_data.settings_v2`
 *
 * Migrates from legacy keys (lp_show_translation, lp_use_traditional,
 * lp_show_phonetics, zthSpeechSettings, zthSrsProgress.settings)
 * on first load if lp_settings (v2) is not present.
 */
export function useSettings() {
  const { data: session, status } = useSession();
  const { getUserData } = useUserData();
  const [settings, setSettings] = useState<SettingsV2>(() => createSettingsV2());
  const [loaded, setLoaded] = useState(false);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSyncing = useRef(false);

  // ── Helper: sync settings_v2 to cloud ──
  const syncToCloud = useCallback(async (s: SettingsV2) => {
    // Import fetch dynamically since we're in a browser context
    try {
      const { apiClient } = await import('@langplayer/api-client');
      await apiClient.post('/user-data/sync', {
        settings_v2: JSON.stringify(s),
      });
    } catch (err) {
      console.warn('[settings] Cloud sync failed:', err);
    }
  }, []);

  // ── Helper: persist to localStorage + schedule cloud sync ──
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
        await syncToCloud(s);
      } finally {
        isSyncing.current = false;
      }
    }, SYNC_DEBOUNCE_MS);
  }, [session, syncToCloud]);

  // ── Migrate from legacy keys ──
  const migrateFromLegacy = useCallback((): SettingsV2 | null => {
    try {
      const newSettings = createSettingsV2();

      // lp_show_translation → tokenizedText (already defaults to true, but respect old pref)
      const oldTranslation = localStorage.getItem('lp_show_translation');
      if (oldTranslation !== null) {
        try { newSettings.tokenizedText = { ...newSettings.tokenizedText }; } catch {}
      }

      // lp_show_phonetics → l2 tokenSpan phonetics (migrate to current L2 only)
      const oldPhonetics = localStorage.getItem('lp_show_phonetics');
      if (oldPhonetics !== null) {
        // We don't know the current L2 code here, so we'll handle this lazily
      }

      // zthSrsProgress.settings.dailyNewLimit → review.dailyNewLimit
      const oldSrs = localStorage.getItem('zthSrsProgress');
      if (oldSrs) {
        try {
          const parsed = JSON.parse(oldSrs);
          if (parsed?.settings?.dailyNewLimit != null) {
            newSettings.review.dailyNewLimit = parsed.settings.dailyNewLimit;
          }
        } catch {}
      }

      // zthSpeechSettings → l2 speech (migrate to current L2 only)
      const oldSpeech = localStorage.getItem('zthSpeechSettings');
      if (oldSpeech) {
        try {
          const parsed = JSON.parse(oldSpeech);
          // Will be applied when we know the L2 code
          if (parsed.voiceURI || parsed.rate != null) {
            // Stash for later per-L2 migration
            (newSettings as any).__migratedSpeech = parsed;
          }
        } catch {}
      }

      return newSettings;
    } catch {
      return null;
    }
  }, []);

  // ── Load from localStorage on mount ──
  useEffect(() => {
    if (loaded) return;
    if (status === 'loading') return; // still loading auth

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.v === 2) {
          setSettings(parsed as SettingsV2);
          setLoaded(true);
          return;
        }
      }

      // Try migration from legacy keys
      const migrated = migrateFromLegacy();
      if (migrated) {
        setSettings(migrated);
        persist(migrated);
      }
    } catch {
      // corrupted — use defaults
    }

    setLoaded(true);
  }, [status, loaded, migrateFromLegacy, persist]);

  // ── On login, load from cloud and merge ──
  useEffect(() => {
    if (status !== 'authenticated' || !loaded) return;

    const loadFromCloud = async () => {
      try {
        const data = await getUserData();
        if (!data?.settings_v2) return;

        const cloud: SettingsV2 = JSON.parse(data.settings_v2);
        if (cloud.v !== 2) return;

        setSettings((prev) => {
          // Merge: local is base, cloud overlays.
          // Compare timestamps — newer wins.
          const merged: SettingsV2 = {
            ...prev,
            ...(cloud.ts > prev.ts ? cloud : {}),
            v: 2,
            ts: new Date().toISOString(),
          };
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(merged)); } catch {}
          return merged;
        });
      } catch (err) {
        console.warn('[settings] Could not load from cloud:', err);
      }
    };
    loadFromCloud();
  }, [status, loaded, getUserData]);

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

  // ── Convenience: ensure L2 entry exists (called on language switch) ──

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

    // Global
    tokenizedText: settings.tokenizedText,
    updateTokenizedText,
    display: settings.display,
    updateDisplay,
    playback: settings.playback,
    updatePlayback,
    review: settings.review,
    updateReview,

    // Per-L2
    getL2: (code: string): L2Settings => settings.l2[code] ?? L2_DEFAULTS,
    updateL2,
    ensureL2,
  };
}
