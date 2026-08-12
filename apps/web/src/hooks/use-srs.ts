'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { deleteSrsCard, useUserDataColumns } from '@langplayer/api-client';
import {
  createSrsStore,
  fsrs,
  getCardState,
  getLanguageCards,
  mergeSrsCards,
} from '@langplayer/utils';
import type { SrsFields, SrsProgressStore } from '@langplayer/shared';
import { log, logwarn } from '@/lib/logger';

const STORAGE_KEY = 'zthSrsProgress';

/**
 * Remove a single SRS card from localStorage AND the server (row API).
 * Safe to call from components without the full useSrs hook.
 */
export function removeCardFromStorage(l2Code: string, wordId: string): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const store = JSON.parse(raw);
      if (store?.cards?.[l2Code]?.[wordId]) {
        delete store.cards[l2Code][wordId];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
      }
    }
  } catch { /* ignore */ }
  deleteSrsCard(l2Code, wordId).catch((err) => {
    logwarn('[SRS] Card delete failed:', err);
  });
}

/**
 * SRS hook (SPEC-039 5.2 row API).
 *
 * - localStorage first (offline-capable)
 * - Authenticated: hydrate from GET /srs (newer lastReview wins per card)
 * - updateCard → PUT /srs/cards; removeCard/pruneOrphans → DELETE /srs/cards;
 *   dailyNewLimit now lives in settings_v2 (SettingsContext); the legacy
 *   /srs/settings row is deprecated (SPEC-066 Phase 6).
 */
export function useSrs() {
  const { data: session, status } = useSession();
  const { getSrs, putSrsCard } = useUserDataColumns();
  const [store, setStore] = useState<SrsProgressStore>(createSrsStore());
  const [loaded, setLoaded] = useState(false);
  const cloudLoaded = useRef(false);
  const storeRef = useRef<SrsProgressStore>(store);
  storeRef.current = store;

  // ── Load from localStorage (always, for both logged-in and anonymous users) ──
  useEffect(() => {
    if (loaded) return;
    if (status === 'loading') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          const restored = fsrs.migrateSrsStore(parsed);
          log('[SRS] Loaded %d language(s) from localStorage', Object.keys(restored.cards).length);
          setStore(restored);
        }
      }
    } catch { /* corrupted localStorage — defaults */ }
    setLoaded(true);
  }, [status, loaded]);

  // ── Authenticated: hydrate from the row API ──
  useEffect(() => {
    if (status !== 'authenticated' || !loaded || cloudLoaded.current) return;
    cloudLoaded.current = true;
    let cancelled = false;
    (async () => {
      try {
        const res = await getSrs();
        if (cancelled) return;
        const cloud = {
          settings: res.settings ?? { dailyNewLimit: 20 },
          cards: res.cards ?? {},
        };
        log('[SRS] Server data arrived — merging with local (server has %d languages)',
          Object.keys(cloud.cards).length);
        setStore((prev) => {
          const mergedCards: Record<string, Record<string, SrsFields>> = { ...prev.cards };
          for (const [l2, cloudLangCards] of Object.entries(cloud.cards)) {
            mergedCards[l2] = mergeSrsCards(prev.cards[l2] ?? {}, cloudLangCards);
          }
          return {
            settings: { ...prev.settings, ...cloud.settings },
            cards: mergedCards,
          };
        });
      } catch (err) {
        logwarn('[SRS] Could not load from server:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [status, loaded, getSrs]);

  // ── Persist to localStorage whenever the store changes (no full-blob sync) ──
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(storeRef.current));
    } catch { /* quota exceeded */ }
  }, [store, loaded]);

  // ── Card API (per-language) ──

  const getCards = useCallback((l2Code: string): Record<string, SrsFields> => {
    return getLanguageCards(store, l2Code);
  }, [store]);

  const updateCard = useCallback((l2Code: string, wordId: string, fields: SrsFields) => {
    log('[SRS] updateCard: l2=%s wordId=%s reps=%d nextReview=%s',
      l2Code, wordId, fields.repetitions,
      new Date(fields.nextReview).toISOString().slice(0, 16));
    setStore((prev) => {
      const prevCard = prev.cards[l2Code]?.[wordId];
      if (prevCard && getCardState(prevCard) === 'review' && fields.state === 0) {
        logwarn('[SRS] Card %s/%s reset from review to new — possible data loss!',
          l2Code, wordId);
      }
      return {
        settings: { ...prev.settings },
        cards: {
          ...prev.cards,
          [l2Code]: { ...(prev.cards[l2Code] ?? {}), [wordId]: fields },
        },
      };
    });
    putSrsCard(l2Code, wordId, fsrs.normalizeFsrsCard(fields)).catch((err) => {
      logwarn('[SRS] Card sync failed:', err);
      if ((err as { response?: { status?: number } })?.response?.status === 403) {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('lp:srs-cap-reached'));
        }
      }
    });
  }, [putSrsCard]);

  const removeCard = useCallback((l2Code: string, wordId: string) => {
    log('[SRS] removeCard: l2=%s wordId=%s', l2Code, wordId);
    removeCardFromStorage(l2Code, wordId);
    setStore((prev) => {
      const langCards = { ...(prev.cards[l2Code] ?? {}) };
      delete langCards[wordId];
      return {
        settings: { ...prev.settings },
        cards: { ...prev.cards, [l2Code]: langCards },
      };
    });
  }, []);

  const pruneOrphans = useCallback((l2Code: string, savedWordIds: Set<string>) => {
    setStore((prev) => {
      const langCards = prev.cards[l2Code] ?? {};
      const orphans = Object.keys(langCards).filter((id) => !savedWordIds.has(id));
      if (orphans.length === 0) return prev;
      const prunedCards = { ...langCards };
      for (const id of orphans) delete prunedCards[id];
      log('[SRS] pruneOrphans: l2=%s removed %d orphaned card(s)', l2Code, orphans.length);
      for (const id of orphans) {
        deleteSrsCard(l2Code, id).catch((err) => {
          logwarn('[SRS] Orphan card delete failed:', err);
        });
      }
      return {
        settings: { ...prev.settings },
        cards: { ...prev.cards, [l2Code]: prunedCards },
      };
    });
  }, []);

  const getCard = useCallback((l2Code: string, wordId: string): SrsFields | undefined => {
    return store.cards[l2Code]?.[wordId];
  }, [store]);

  return {
    store,
    loaded,
    getCards,
    updateCard,
    removeCard,
    pruneOrphans,
    getCard,
  };
}
