'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useUserData } from '@langplayer/api-client';
import { useCloudUserData } from '@/providers/user-data-provider';
import { createSrsStore, getLanguageCards } from '@langplayer/utils';
import type { SrsFields, SrsProgressStore } from '@langplayer/shared';

const STORAGE_KEY = 'zthSrsProgress';
const SYNC_DEBOUNCE_MS = 3000;

// ── Logging (gated by a single flag — per AGENTS.md) ──
const LOG_ENABLED = false; // Toggle to true for debugging SRS issues
function log(msg: string, ...args: unknown[]) {
  if (LOG_ENABLED) console.log('[LP Web] [SRS]', msg, ...args);
}
function logWarn(msg: string, ...args: unknown[]) {
  if (LOG_ENABLED) console.warn('[LP Web] [SRS]', msg, ...args);
}

/**
 * Merge two SRS card records (per-language: wordId → SrsFields).
 * Newer lastReview wins per card.
 */
function mergeSrsCards(
  local: Record<string, SrsFields>,
  cloud: Record<string, SrsFields>,
): Record<string, SrsFields> {
  const merged = { ...local };
  for (const [id, cloudCard] of Object.entries(cloud)) {
    const localCard = merged[id];
    if (!localCard || cloudCard.lastReview > localCard.lastReview) {
      merged[id] = cloudCard;
    }
  }
  return merged;
}

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
  const { getUserData, syncSrsProgress } = useUserData();
  const { data: cloudData, loaded: cloudLoaded } = useCloudUserData();
  const [store, setStore] = useState<SrsProgressStore>(createSrsStore());
  const [loaded, setLoaded] = useState(false);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSyncing = useRef(false);
  /** Ref to hold the latest store for the sync timer callback (avoids stale closure). */
  const storeRef = useRef<SrsProgressStore>(store);
  storeRef.current = store;

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
          const restored: SrsProgressStore = {
            settings: { ...createSrsStore().settings, ...(parsed.settings ?? {}) },
            cards: parsed.cards ?? {},
          };
          log('Loaded %d language(s) from localStorage', Object.keys(restored.cards).length);
          setStore(restored);
        }
      }
    } catch { /* corrupted localStorage — use defaults */ }

    setLoaded(true);
  }, [status, loaded]);

  // ── On cloud load, merge cloud data (newer lastReview wins per card) ──
  useEffect(() => {
    if (status !== 'authenticated' || !loaded || !cloudLoaded) return;
    if (!cloudData?.srs_progress) return;

    try {
      const cloud: SrsProgressStore = JSON.parse(cloudData.srs_progress);
      log('Cloud data arrived — merging with local (cloud has %d languages)',
        Object.keys(cloud.cards ?? {}).length);

      setStore((prev) => {
        const mergedCards: Record<string, Record<string, SrsFields>> = { ...prev.cards };
        for (const [l2, cloudLangCards] of Object.entries(cloud.cards ?? {})) {
          const before = Object.keys(prev.cards[l2] ?? {}).length;
          mergedCards[l2] = mergeSrsCards(prev.cards[l2] ?? {}, cloudLangCards);
          const after = Object.keys(mergedCards[l2] ?? {}).length;
          if (before !== after) {
            log('Cloud merge: l2=%s added %d card(s) from cloud', l2, after - before);
          }
        }
        const merged: SrsProgressStore = {
          settings: { ...prev.settings, ...(cloud.settings ?? {}) },
          cards: mergedCards,
        };
        return merged;
      });
    } catch (err) {
      logWarn('Could not parse cloud SRS data:', err);
    }
  }, [status, loaded, cloudLoaded, cloudData]);

  // ── Debounced cloud sync (read-merge-write) ──
  // Uses storeRef to always read the latest state, avoiding stale closures.
  const scheduleSync = useCallback(() => {
    if (!session) return;
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(async () => {
      if (isSyncing.current) return;
      isSyncing.current = true;
      try {
        // Read the latest store from the ref (not from the closure)
        const latest = storeRef.current;
        // Read-merge-write: avoid overwriting changes from other devices
        const cloudResp = await getUserData();
        let toSync = latest;
        if (cloudResp?.srs_progress) {
          const cloud = JSON.parse(cloudResp.srs_progress) as SrsProgressStore;
          const mergedCards: Record<string, Record<string, SrsFields>> = { ...latest.cards };
          for (const [l2, cloudLangCards] of Object.entries(cloud.cards ?? {})) {
            mergedCards[l2] = mergeSrsCards(latest.cards[l2] ?? {}, cloudLangCards);
          }
          toSync = { settings: latest.settings, cards: mergedCards };
        }
        log('Syncing SRS to cloud (%d languages, %d total cards)',
          Object.keys(toSync.cards).length,
          Object.values(toSync.cards).reduce((sum, c) => sum + Object.keys(c).length, 0));
        await syncSrsProgress(JSON.stringify(toSync));
      } catch (err) {
        logWarn('Cloud sync failed — will retry on next change:', err);
        // Retry after a delay in case of transient network error
        syncTimer.current = setTimeout(() => {
          isSyncing.current = false;
          scheduleSync();
        }, 10_000);
      } finally {
        isSyncing.current = false;
      }
    }, SYNC_DEBOUNCE_MS);
  }, [session, getUserData, syncSrsProgress]);

  // ── Persist to localStorage + schedule cloud sync ──
  // Called from useEffect, not from inside setStore updaters.
  const persist = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(storeRef.current));
    } catch { /* quota exceeded */ }
    scheduleSync();
  }, [scheduleSync]);

  // ── Persist store to localStorage + schedule cloud sync whenever it changes ──
  // This fires AFTER every state update is committed, ensuring localStorage &
  // cloud are always in sync with the latest React state.
  // Guard: skip the initial empty store (loaded=false).
  useEffect(() => {
    if (!loaded) return;
    persist();
  }, [store, loaded, persist]);

  // ── Card API (per-language) ──

  /** Get all cards for a language. */
  const getCards = useCallback((l2Code: string): Record<string, SrsFields> => {
    return getLanguageCards(store, l2Code);
  }, [store]);

  /** Update a single card for a language. */
  const updateCard = useCallback((l2Code: string, wordId: string, fields: SrsFields) => {
    log('updateCard: l2=%s wordId=%s reps=%d nextReview=%s',
      l2Code, wordId, fields.repetitions,
      new Date(fields.nextReview).toISOString().slice(0, 16));
    setStore((prev) => {
      const prevCard = prev.cards[l2Code]?.[wordId];
      const next: SrsProgressStore = {
        settings: { ...prev.settings },
        cards: {
          ...prev.cards,
          [l2Code]: { ...(prev.cards[l2Code] ?? {}), [wordId]: fields },
        },
      };
      // Detect potential data loss: a card going from reviewed → new
      if (prevCard && prevCard.repetitions > 0 && fields.repetitions === 0) {
        logWarn('Card %s/%s reset from reps=%d to 0 — possible data loss!',
          l2Code, wordId, prevCard.repetitions);
      }
      return next;
    });
  }, []);

  /** Remove a card for a language. */
  const removeCard = useCallback((l2Code: string, wordId: string) => {
    log('removeCard: l2=%s wordId=%s', l2Code, wordId);
    setStore((prev) => {
      const langCards = { ...(prev.cards[l2Code] ?? {}) };
      delete langCards[wordId];
      const next: SrsProgressStore = {
        settings: { ...prev.settings },
        cards: { ...prev.cards, [l2Code]: langCards },
      };
      return next;
    });
  }, []);

  /**
   * Remove SRS cards for words that are no longer saved.
   *
   * An SRS card is only meaningful for a word that's in the user's vocabulary
   * list. When a word is unsaved through any path, its card can linger in
   * srs_progress and "come back" later (reused as a stale, sometimes
   * repetitions:0 "new" card) if the word is re-encountered. This method
   * prunes orphaned cards so the SRS deck only ever contains saved words.
   *
   * Safe to call on every render/effect — it no-ops when there's nothing to prune.
   *
   * @param l2Code Language code (base).
   * @param savedWordIds Set of word ids currently saved for that language.
   */
  const pruneOrphans = useCallback((l2Code: string, savedWordIds: Set<string>) => {
    setStore((prev) => {
      const langCards = prev.cards[l2Code] ?? {};
      const hasOrphan = Object.keys(langCards).some((id) => !savedWordIds.has(id));
      if (!hasOrphan) return prev; // nothing to prune
      const prunedCards = { ...langCards };
      let removed = 0;
      for (const id of Object.keys(prunedCards)) {
        if (!savedWordIds.has(id)) {
          delete prunedCards[id];
          removed++;
        }
      }
      log('pruneOrphans: l2=%s removed %d orphaned card(s)', l2Code, removed);
      const next: SrsProgressStore = {
        settings: { ...prev.settings },
        cards: { ...prev.cards, [l2Code]: prunedCards },
      };
      return next;
    });
  }, []);

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
      return next;
    });
  }, []);

  return {
    store,
    loaded,
    getCards,
    updateCard,
    removeCard,
    pruneOrphans,
    getCard,
    dailyNewLimit,
    updateSettings,
  };
}

