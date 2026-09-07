'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { deleteSrsCard, deleteSrsCardsBatch, putSrsCard, reconcileSrsCards, useUserDataColumns } from '@langplayer/api-client';
import type { SrsCardMeta } from '@langplayer/api-client';
import {
  createSrsStore,
  fsrs,
  getCardState,
  getLanguageCards,
  mergeSrsCards,
  reconcileCardsToServer,
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
/** Bound the orphan-prune delete batch per run (see pruneOrphans). */
const MAX_ORPHAN_PRUNE_PER_RUN = 25;

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
  void flushAllPendingSrsOps({ putSrsCard, deleteSrsCard, deleteSrsCardsBatch });
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
        await flushAllPendingSrsOps({ putSrsCard, deleteSrsCard, deleteSrsCardsBatch });
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
          // Reconcile stale local-only cards against the authoritative server
          // deck (SPEC-066, mirrors the mobile pull-merge reconcile): a card is
          // kept only if the server has it OR there is unsynced local work (a
          // pending/error op for this l2::wordId). Local-only cards with
          // neither are phantoms (never persisted / stale session) and would
          // inflate this device's deck, making the new/again/review header
          // counts diverge from the server and other clients.
          const pendingKeys = new Set<string>();
          for (const op of loadPendingSrsOps()) {
            pendingKeys.add(`${op.l2}\u0000${op.wordId}`);
          }
          for (const lang of Object.keys(mergedCards)) {
            const serverLang = cloud.cards[lang];
            if (!serverLang) continue; // server deck not loaded for this lang
            const langCards = mergedCards[lang];
            if (!langCards) continue;
            mergedCards[lang] = reconcileCardsToServer(
              langCards,
              serverLang,
              (id) => pendingKeys.has(`${lang}\u0000${id}`),
            );
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
    void flushAllPendingSrsOps({ putSrsCard, deleteSrsCard, deleteSrsCardsBatch });
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

  /**
   * Local orphan prune (the offline / anonymous fallback). Deleting every card
   * whose id isn't in `savedWordIds` is only safe when that set is complete —
   * an empty-but-loading or partial view must never wipe a real deck. The
   * caller forces `allowWholeDeckPurge: false` for fallback paths so a partial
   * view can't take out genuinely good cards; the authoritative server
   * reconcile (`reconcileOrphans`) handles the genuinely-empty-deck case when
   * online.
   */
  const pruneOrphans = useCallback((l2Code: string, savedWordIds: Set<string>, opts?: { allowWholeDeckPurge?: boolean }) => {
    setStore((prev) => {
      const langCards = prev.cards[l2Code] ?? {};
      const orphans = Object.keys(langCards).filter((id) => !savedWordIds.has(id));
      if (orphans.length === 0) return prev;
      // Never purge the whole deck when the caller can't be sure the saved-word
      // view is complete (partial hydration, reconcile unreachable). The server
      // reconcile is authoritative for the genuinely-empty-deck case online.
      if (opts?.allowWholeDeckPurge === false && orphans.length === Object.keys(langCards).length) {
        logwarn('[SRS] pruneOrphans: l2=%s would purge the whole deck (%d cards); skipping (allowWholeDeckPurge=false)',
          l2Code, orphans.length);
        return prev;
      }
      // Bound the per-run delete batch: a huge orphan backlog (cards whose words
      // were unsaved across many sessions) must not enqueue hundreds of
      // DELETE /srs/cards at once. Drain it in small batches per page load.
      const toPrune = orphans.slice(0, MAX_ORPHAN_PRUNE_PER_RUN);
      if (orphans.length > toPrune.length) {
        logwarn('[SRS] pruneOrphans: l2=%s found %d orphaned card(s); pruning %d this run (bounding the delete stream)',
          l2Code, orphans.length, toPrune.length);
      }
      const prunedCards = { ...langCards };
      for (const id of toPrune) delete prunedCards[id];
      log('[SRS] pruneOrphans: l2=%s removed %d orphaned card(s)', l2Code, toPrune.length);
      let queue = loadPendingSrsOps();
      for (const id of toPrune) {
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
    void flushAllPendingSrsOps({ putSrsCard, deleteSrsCard, deleteSrsCardsBatch });
  }, []);

  /**
   * Authoritative server-side orphan reconciliation (replaces the fragile
   * client-side prune). The server owns both `user_srs_cards` and
   * `user_saved_words`, so it compares a given l2's cards against its saved
   * words and deletes orphans. `protectedWordIds` are words with a pending
   * (unsynced) local saved-word put — the server never deletes their cards.
   *
   * The server returns `deletedWordIds`; the client drops those cards from its
   * local store and must NOT enqueue its own delete ops (they're already gone
   * server-side — enqueuing would only emit redundant DELETEs).
   */
  const reconcileOrphans = useCallback(async (l2Code: string, protectedWordIds: string[] = []) => {
    const res = await reconcileSrsCards(l2Code, protectedWordIds);
    const deleted = res?.deletedWordIds ?? [];
    if (deleted.length > 0) {
      setStore((prev) => {
        const langCards = prev.cards[l2Code] ?? {};
        const nextLang = { ...langCards };
        for (const id of deleted) delete nextLang[id];
        return { cards: { ...prev.cards, [l2Code]: nextLang } };
      });
      log('[SRS] reconcileOrphans: l2=%s server reconciled %d orphaned card(s); dropped from local state',
        l2Code, deleted.length);
    } else {
      log('[SRS] reconcileOrphans: l2=%s no orphaned cards on server', l2Code);
    }
    return deleted.length;
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
    reconcileOrphans,
    getCard,
  };
}
