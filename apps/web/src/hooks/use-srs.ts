'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useUserData } from '@langplayer/api-client';
import { useCloudUserData } from '@/providers/user-data-provider';
import { createSrsStore, getLanguageCards } from '@langplayer/utils';
import type { SrsFields, SrsProgressStore } from '@langplayer/shared';

const STORAGE_KEY = 'zthSrsProgress';
const SYNC_DEBOUNCE_MS = 3000;

/**
 * Hook for managing SRS (spaced repetition) progress.
 *
 * Store shape (nested by language):
 *   {
 *     settings: { dailyNewLimit: 20 },
 *     cards: { "zh": { "cedict-0": {...}, ... }, "ja": {...} }
 *   }
 *
 * - Read/write localStorage immediately (offline-first)
 * - If authenticated, sync to Directus via Flask /user-data/sync
 * - On login, load from cloud
 * - Settings are embedded in the same store so they sync across devices
 */
export function useSrs() {
  const { data: session, status } = useSession();
  const { syncSrsProgress } = useUserData();
  const { data: cloudData, loaded: cloudLoaded } = useCloudUserData();
  const [store, setStore] = useState<SrsProgressStore>(createSrsStore());
  const [loaded, setLoaded] = useState(false);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSyncing = useRef(false);

  // ── Load from localStorage (always, for both logged-in and anonymous users) ──
  // LocalStorage is always read first so that settings changes survive page
  // reloads even when the cloud sync hasn't completed yet (3s debounce).
  useEffect(() => {
    if (loaded) return;
    if (status === 'loading') return; // still loading auth state

    // Always try localStorage first — offline-first principle
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          setStore({
            settings: { ...createSrsStore().settings, ...(parsed.settings ?? {}) },
            cards: parsed.cards ?? {},
          });
        }
      }
    } catch { /* corrupted localStorage — use defaults */ }

    setLoaded(true);
  }, [status, loaded]);

  // ── On cloud load, merge cloud data (cloud overlays local) ──
  useEffect(() => {
    if (status !== 'authenticated' || !loaded || !cloudLoaded) return;
    if (!cloudData?.srs_progress) return;

    try {
      const cloud: SrsProgressStore = JSON.parse(cloudData.srs_progress);

      setStore((prev) => {
        const merged: SrsProgressStore = {
          settings: { ...prev.settings, ...(cloud.settings ?? {}) },
          cards: { ...prev.cards, ...(cloud.cards ?? {}) },
        };
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(merged)); } catch {}
        return merged;
      });
    } catch (err) {
      console.warn('[srs] Could not parse cloud data:', err);
    }
  }, [status, loaded, cloudLoaded, cloudData]);

  // ── Debounced cloud sync ──
  const scheduleSync = useCallback((s: SrsProgressStore) => {
    if (!session) return;
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(async () => {
      if (isSyncing.current) return;
      isSyncing.current = true;
      try {
        await syncSrsProgress(JSON.stringify(s));
      } catch (err) {
        console.warn('[srs] Sync failed:', err);
      } finally {
        isSyncing.current = false;
      }
    }, SYNC_DEBOUNCE_MS);
  }, [session]);

  // ── Persist + schedule sync ──
  const persist = useCallback((s: SrsProgressStore) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch { /* quota exceeded */ }
    scheduleSync(s);
  }, [scheduleSync]);

  // ── Card API (per-language) ──

  /** Get all cards for a language. */
  const getCards = useCallback((l2Code: string): Record<string, SrsFields> => {
    return getLanguageCards(store, l2Code);
  }, [store]);

  /** Update a single card for a language. */
  const updateCard = useCallback((l2Code: string, wordId: string, fields: SrsFields) => {
    setStore((prev) => {
      const next: SrsProgressStore = {
        settings: { ...prev.settings },
        cards: {
          ...prev.cards,
          [l2Code]: { ...(prev.cards[l2Code] ?? {}), [wordId]: fields },
        },
      };
      persist(next);
      return next;
    });
  }, [persist]);

  /** Remove a card for a language. */
  const removeCard = useCallback((l2Code: string, wordId: string) => {
    setStore((prev) => {
      const langCards = { ...(prev.cards[l2Code] ?? {}) };
      delete langCards[wordId];
      const next: SrsProgressStore = {
        settings: { ...prev.settings },
        cards: { ...prev.cards, [l2Code]: langCards },
      };
      persist(next);
      return next;
    });
  }, [persist]);

  /** Get a single card for a language. */
  const getCard = useCallback((l2Code: string, wordId: string): SrsFields | undefined => {
    return store.cards[l2Code]?.[wordId];
  }, [store]);

  // ── Settings API ──

  const dailyNewLimit = store.settings.dailyNewLimit;

  const updateSettings = useCallback((partial: Partial<SrsProgressStore['settings']>) => {
    setStore((prev) => {
      const next: SrsProgressStore = {
        settings: { ...prev.settings, ...partial },
        cards: prev.cards,
      };
      persist(next);
      return next;
    });
  }, [persist]);

  return {
    store,
    loaded,
    getCards,
    updateCard,
    removeCard,
    getCard,
    dailyNewLimit,
    updateSettings,
  };
}

