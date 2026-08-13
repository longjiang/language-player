'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { deleteSrsCard, putSrsCard, useUserDataColumns } from '@langplayer/api-client';
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
const SRS_PENDING_OPS_KEY = 'zthSrsProgressPendingOps';

interface PendingSrsOp {
  type: 'upsert' | 'delete';
  l2: string;
  wordId: string;
  state?: SrsFields;
  updatedAt: number;
}

interface SrsRowApi {
  putSrsCard: (l2: string, wordId: string, state: SrsFields) => Promise<unknown>;
  deleteSrsCard: (l2: string, wordId: string) => Promise<unknown>;
}

let srsFlushInFlight: Promise<void> | null = null;
let srsRetryTimer: ReturnType<typeof setTimeout> | null = null;

function pendingSrsOpKey(op: PendingSrsOp): string {
  return `${op.l2}\u0000${op.wordId}`;
}

function loadPendingSrsOps(): PendingSrsOp[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SRS_PENDING_OPS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (op): op is PendingSrsOp =>
        !!op && (op.type === 'upsert' || op.type === 'delete')
        && typeof op.l2 === 'string' && typeof op.wordId === 'string',
    );
  } catch { /* corrupted queue — start fresh */ }
  return [];
}

function savePendingSrsOps(ops: PendingSrsOp[]): void {
  try {
    localStorage.setItem(SRS_PENDING_OPS_KEY, JSON.stringify(ops));
  } catch { /* quota exceeded — queue stays in memory only */ }
}

function enqueuePendingSrsOp(queue: PendingSrsOp[], op: PendingSrsOp): PendingSrsOp[] {
  const key = pendingSrsOpKey(op);
  return [...queue.filter((q) => pendingSrsOpKey(q) !== key), op];
}

function reducePendingSrsOps(queue: PendingSrsOp[]): PendingSrsOp[] {
  const latest = new Map<string, PendingSrsOp>();
  for (const op of queue) latest.set(pendingSrsOpKey(op), op);
  return [...latest.values()].sort((a, b) => a.updatedAt - b.updatedAt);
}

async function flushPendingSrsOps(
  queue: PendingSrsOp[],
  api: SrsRowApi,
): Promise<PendingSrsOp[]> {
  const ops = reducePendingSrsOps(queue);
  const remaining: PendingSrsOp[] = [];
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]!;
    try {
      if (op.type === 'upsert' && op.state) {
        await api.putSrsCard(op.l2, op.wordId, op.state);
      } else {
        await api.deleteSrsCard(op.l2, op.wordId);
      }
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 403 && typeof window !== 'undefined') {
        window.dispatchEvent(new Event('lp:srs-cap-reached'));
      }
      remaining.push(...ops.slice(i));
      break;
    }
  }
  return remaining;
}

/** Serialize flushes so concurrent callers share one attempt and never
 *  clobber each other's remaining-op lists. */
async function flushAllPendingSrsOps(api: SrsRowApi): Promise<void> {
  const ops = loadPendingSrsOps();
  if (ops.length === 0) return;
  if (srsFlushInFlight) return srsFlushInFlight;
  const run = (async () => {
    const remaining = await flushPendingSrsOps(ops, api);
    savePendingSrsOps(remaining);
    if (remaining.length > 0 && !srsRetryTimer) {
      srsRetryTimer = setTimeout(() => {
        srsRetryTimer = null;
        void flushAllPendingSrsOps(api);
      }, 10_000);
    }
  })();
  srsFlushInFlight = run;
  try {
    await run;
  } finally {
    srsFlushInFlight = null;
  }
}

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
 *   dailyNewLimit now lives in settings_v2 (SettingsContext); the legacy
 *   /srs/settings row is deprecated (SPEC-066 Phase 6).
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

  // ── Card API (per-language) ──

  const getCards = useCallback((l2Code: string): Record<string, SrsFields> => {
    return getLanguageCards(store, l2Code);
  }, [store]);

  const updateCard = useCallback((l2Code: string, wordId: string, fields: SrsFields) => {
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
        settings: { ...prev.settings },
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
    }));
    void flushAllPendingSrsOps({ putSrsCard, deleteSrsCard });
  }, []);

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
        settings: { ...prev.settings },
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
