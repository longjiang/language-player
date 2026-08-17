'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { deleteSrsCard, putSrsCard, useUserDataColumns } from '@langplayer/api-client';
import type { SrsCardMeta } from '@langplayer/api-client';
import {
  createSrsStore,
  fsrs,
  getCardState,
  getLanguageCards,
  mergeSrsCards,
} from '@langplayer/utils';
import type { SrsFields, SrsProgressStore } from '@langplayer/shared';
import {
  enqueuePendingSrsOp,
  flushAllPendingSrsOps,
  loadPendingSrsOps,
  savePendingSrsOps,
} from '@/lib/srs-pending-queue';
import { log, logwarn } from '@/lib/logger';

const STORAGE_KEY = 'zthSrsProgress';

/**
 * Remove a single SRS card from localStorage AND the server (row API).
 * Safe to call from components without the full useSrs hook.
 *
 * Notifies mounted useSrs hooks via `lp:srs-card-removed` so their in-memory
 * store drops the card too — otherwise the next store change would persist
 * the ghost card back into localStorage (ADR-0040).
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
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('lp:srs-card-removed', {
      detail: { l2: l2Code, wordId },
    }));
  }
  savePendingSrsOps(enqueuePendingSrsOp(loadPendingSrsOps(), {
    type: 'delete',
    l2: l2Code,
    wordId,
    updatedAt: Date.now(),
  }));
  void flushAllPendingSrsOps({ putSrsCard, deleteSrsCard });
}

/**
 * SRS hook (SPEC-039 5.2 row API).
 *
 * - localStorage first (offline-capable)
 * - Authenticated: hydrate from GET /srs (newer lastReview wins per card)
 * - updateCard → PUT /srs/cards; removeCard/pruneOrphans → DELETE /srs/cards;
 *   dailyNewLimit lives in settings_v2 (SettingsContext); GET /srs returns
 *   cards only.
 */
export function useSrs() {
  const { data: session, status } = useSession();
  const { getSrs, putSrsCard } = useUserDataColumns();
  const [store, setStore] = useState<SrsProgressStore>(createSrsStore());
  const [loaded, setLoaded] = useState(false);
  const [cloudHydrated, setCloudHydrated] = useState(false);
  const [cloudRetry, setCloudRetry] = useState(0);
  const cloudAttemptInFlight = useRef(false);
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
    if (status !== 'authenticated' || !loaded || cloudHydrated) return;
    if (cloudAttemptInFlight.current) return;
    cloudAttemptInFlight.current = true;
    let cancelled = false;
    (async () => {
      try {
        await flushAllPendingSrsOps({ putSrsCard, deleteSrsCard });
        const res = await getSrs();
        if (cancelled) return;
        const cloud = { cards: res.cards ?? {} };
        const cloudDayStart = (() => {
          const d = new Date();
          return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
        })();
        let cloudCardsTotal = 0;
        let cloudMissingCreatedAt = 0;
        let cloudReviewedTodayNoCreatedAt = 0;
        for (const langCards of Object.values(cloud.cards)) {
          for (const state of Object.values(langCards)) {
            cloudCardsTotal++;
            if (typeof state?.createdAt !== 'number') {
              cloudMissingCreatedAt++;
              const lastReview =
                typeof state?.lastReview === 'number'
                  ? (state.lastReview as number)
                  : typeof state?.last_review === 'number'
                    ? (state.last_review as number)
                    : undefined;
              if (lastReview != null && lastReview >= cloudDayStart) {
                cloudReviewedTodayNoCreatedAt++;
              }
            }
          }
        }
        log('[SRS] cloud card stats', {
          totalCards: cloudCardsTotal,
          missingCreatedAt: cloudMissingCreatedAt,
          reviewedTodayNoCreatedAt: cloudReviewedTodayNoCreatedAt,
        });
        log('[SRS] Server data arrived — merging with local (server has %d languages)',
          Object.keys(cloud.cards).length);
        setStore((prev) => {
          const mergedCards: Record<string, Record<string, SrsFields>> = { ...prev.cards };
          for (const [l2, cloudLangCards] of Object.entries(cloud.cards)) {
            mergedCards[l2] = mergeSrsCards(prev.cards[l2] ?? {}, cloudLangCards);
          }
          return { cards: mergedCards };
        });
        if (!cancelled) setCloudHydrated(true);
      } catch (err) {
        logwarn('[SRS] Could not load from server:', err);
        if (!cancelled) {
          // Retry instead of letting auto-init mint "new" cards from stale
          // local state and overwrite rated server cards (SPEC-066).
          setTimeout(() => {
            cloudAttemptInFlight.current = false;
            setCloudRetry((n) => n + 1);
          }, 5000);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [status, loaded, getSrs, cloudHydrated, cloudRetry]);

  // ── Persist to localStorage whenever the store changes (no full-blob sync) ──
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(storeRef.current));
    } catch { /* quota exceeded */ }
  }, [store, loaded]);

  // ── External card removals (removeCardFromStorage from unsave buttons) ──
  // Components outside this hook delete cards directly from localStorage;
  // keep the in-memory store in sync so a later persist can't resurrect the
  // deleted card (ADR-0040).
  useEffect(() => {
    const onCardRemoved = (e: Event) => {
      const detail = (e as CustomEvent<{ l2?: string; wordId?: string }>).detail;
      const { l2, wordId } = detail ?? {};
      if (!l2 || !wordId) return;
      setStore((prev) => {
        const langCards = prev.cards[l2];
        if (!langCards || !langCards[wordId]) return prev;
        const nextLang = { ...langCards };
        delete nextLang[wordId];
        return { cards: { ...prev.cards, [l2]: nextLang } };
      });
    };
    window.addEventListener('lp:srs-card-removed', onCardRemoved);
    return () => window.removeEventListener('lp:srs-card-removed', onCardRemoved);
  }, []);

  // ── Card API (per-language) ──

  const getCards = useCallback((l2Code: string): Record<string, SrsFields> => {
    return getLanguageCards(store, l2Code);
  }, [store]);

  const updateCard = useCallback(
    (l2Code: string, wordId: string, fields: SrsFields, meta: SrsCardMeta = {}) => {
    log('[SRS] updateCard: l2=%s wordId=%s reps=%d nextReview=%s',
      l2Code, wordId, fields.repetitions,
      new Date(fields.nextReview).toISOString().slice(0, 16));
    const normalized = fsrs.normalizeFsrsCard(fields);
    setStore((prev) => {
      const prevCard = prev.cards[l2Code]?.[wordId];
      if (prevCard && getCardState(prevCard) === 'review' && fields.state === 0) {
        logwarn('[SRS] Card %s/%s reset from review to new — possible data loss!',
          l2Code, wordId);
      }
      return {
        cards: {
          ...prev.cards,
          [l2Code]: { ...(prev.cards[l2Code] ?? {}), [wordId]: normalized },
        },
      };
    });
    savePendingSrsOps(enqueuePendingSrsOp(loadPendingSrsOps(), {
      type: 'upsert',
      l2: l2Code,
      wordId,
      state: normalized,
      updatedAt: Date.now(),
      ...(meta.timezone ? { timezone: meta.timezone } : {}),
      ...(typeof meta.dayStartHour === 'number' ? { dayStartHour: meta.dayStartHour } : {}),
    }));
    void flushAllPendingSrsOps({ putSrsCard, deleteSrsCard });
    },
    [],
  );

  const removeCard = useCallback((l2Code: string, wordId: string) => {
    log('[SRS] removeCard: l2=%s wordId=%s', l2Code, wordId);
    removeCardFromStorage(l2Code, wordId);
    setStore((prev) => {
      const langCards = { ...(prev.cards[l2Code] ?? {}) };
      delete langCards[wordId];
      return {
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
      let queue = loadPendingSrsOps();
      for (const id of orphans) {
        queue = enqueuePendingSrsOp(queue, {
          type: 'delete',
          l2: l2Code,
          wordId: id,
          updatedAt: Date.now(),
        });
      }
      savePendingSrsOps(queue);
      return {
        cards: { ...prev.cards, [l2Code]: prunedCards },
      };
    });
    void flushAllPendingSrsOps({ putSrsCard, deleteSrsCard });
  }, []);

  const getCard = useCallback((l2Code: string, wordId: string): SrsFields | undefined => {
    return store.cards[l2Code]?.[wordId];
  }, [store]);

  return {
    store,
    loaded,
    cloudHydrated,
    getCards,
    updateCard,
    removeCard,
    pruneOrphans,
    getCard,
  };
}
