import { useState, useCallback, useEffect, useRef } from 'react';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '@/contexts/AuthContext';
import type { SrsCardMeta } from '@langplayer/api-client';
import { reconcileSrsCards, useUserDataColumns } from '@langplayer/api-client';
import { createSrsStore, fsrs, mergeSrsCards } from '@langplayer/utils';
import type { SrsFields, SrsProgressStore } from '@langplayer/shared';
import { syncLogger } from '@/lib/logger';
import { enqueueSyncOp, subscribeEntity, subscribeSrsCapRejection } from '@/lib/sync-engine';
import { getEntityCache, listOutbox, upsertEntityCache } from '@/lib/sync-db';
import { isOfflineModeEnabled } from '@/lib/offline-mode';
import { getConnectivity } from '@/lib/connectivity';

const { log, logwarn } = syncLogger;

const STORAGE_KEY = 'zthSrsProgress';

/**
 * SRS hook (SPEC-039 5.2 row API).
 *
 * - SecureStore first (offline-capable)
 * - Authenticated: hydrate from GET /srs (newer lastReview wins per card)
 * - updateCard → PUT /srs/cards; removeCard → DELETE /srs/cards;
 *   dailyNewLimit lives in settings_v2 (SettingsContext); GET /srs returns
 *   cards only.
 */
export function useSrs() {
  const { user, loading } = useAuth();
  const { getSrs } = useUserDataColumns();
  const [store, setStore] = useState<SrsProgressStore>(createSrsStore());
  const [loaded, setLoaded] = useState(false);
  const [cloudHydrated, setCloudHydrated] = useState(false);
  const [cloudRetry, setCloudRetry] = useState(0);
  const [capReached, setCapReached] = useState(false);
  const cloudLoadedUserId = useRef<string | null>(null);
  const prevUserIdRef = useRef<string | null | undefined>(undefined);
  const storeRef = useRef(store);
  storeRef.current = store;
  const pendingSrsPreviousRef = useRef(new Map<string, SrsFields>());
  /** Latest authoritative server deck by language (set during row-API
   *  hydration). Used by the pull-merge bridge to drop stale server-absent
   *  local cards. */
  const serverDeckRef = useRef<Record<string, Record<string, SrsFields>>>({});

  /**
   * Pull-merge bridge: apply remote SRS changes from another device by merging
   * the offline entity-cache rows back into the deck. Merge, don't replace — a
   * reviewed local card must not be clobbered by a stale "new" cache card, and
   * vice versa.
   *
   * Reconciliation (SPEC-066 parity): entity-cache rows that are neither on the
   * authoritative server deck NOR backed by unsynced local work (a pending/error
   * outbox op) are stale local-only cards. They were never persisted to the
   * server (so web, which is server-authoritative, doesn't show them) and have
   * no pending op, so nothing is waiting to push them. Keeping them inflates the
   * mobile deck vs web. Drop them here so the two decks converge after hydration.
   */
  const refreshFromCache = useCallback(async () => {
    try {
      const cardRows = await getEntityCache('srs_card');
      const outboxRows = (await listOutbox()).filter((r) => r.entity === 'srs_card');
      const outboxKeys = new Set(outboxRows.map((r) => r.entity_id));
      const cardStates: Record<string, Record<string, SrsFields>> = {};
      const deletedIds = new Set<string>();
      for (const row of cardRows) {
        if (row.deleted_at != null) {
          deletedIds.add(row.entity_id);
          continue;
        }
        const payload = JSON.parse(row.payload) as {
          l2?: string;
          wordId?: string;
          state?: unknown;
        };
        if (!payload.l2 || !payload.wordId || !payload.state) continue;
        const state = fsrs.normalizeFsrsCard(payload.state);
        cardStates[payload.l2] = {
          ...(cardStates[payload.l2] ?? {}),
          [payload.wordId]: state,
        };
      }
      const serverDeck = serverDeckRef.current;
      setStore((prev) => {
        const mergedCards: Record<string, Record<string, SrsFields>> = { ...prev.cards };
        for (const [lang, cacheCards] of Object.entries(cardStates)) {
          mergedCards[lang] = mergeSrsCards(prev.cards[lang] ?? {}, cacheCards);
        }
        // Reconcile stale local-only cards (bugfix): keep a card only if the
        // server has it or there is unsynced local work. Skip languages whose
        // server deck we haven't loaded, so we never drop legitimate offline
        // cards before cloud hydration.
        for (const [lang, langCards] of Object.entries(mergedCards)) {
          const serverLang = serverDeck[lang];
          if (!serverLang) continue;
          const cleaned: Record<string, SrsFields> = {};
          for (const [id, card] of Object.entries(langCards)) {
            const onServer = !!serverLang[id];
            const localWork = outboxKeys.has(`${lang}::${id}`);
            if (onServer || localWork) cleaned[id] = card;
          }
          mergedCards[lang] = cleaned;
        }
        for (const entityId of deletedIds) {
          const sep = entityId.indexOf('::');
          if (sep < 0) continue;
          const lang = entityId.slice(0, sep);
          const wordId = entityId.slice(sep + 2);
          delete mergedCards[lang]?.[wordId];
        }
        const next = { cards: mergedCards };
        SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
    } catch (e) {
      logwarn('[srs] pull merge failed:', e);
    }
  }, []);

  useEffect(() => {
    if (loaded) return;
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          setStore(fsrs.migrateSrsStore(parsed));
        }
      } catch {}
      setLoaded(true);
    })();
  }, [loaded]);

  // ── Authenticated: hydrate from the row API ──
  useEffect(() => {
    if (!user || !loaded || cloudLoadedUserId.current === user.id) return;
    cloudLoadedUserId.current = user.id;
    let cancelled = false;
    (async () => {
      try {
        const res = await getSrs();
        if (cancelled) return;
        const cloud = { cards: res.cards ?? {} };
        // Capture the authoritative server deck for pull-merge reconciliation.
        serverDeckRef.current = cloud.cards;
        setStore((prev) => {
          const cards: Record<string, Record<string, SrsFields>> = { ...prev.cards };
          for (const [lang, cloudCards] of Object.entries(cloud.cards)) {
            cards[lang] = mergeSrsCards(prev.cards[lang] ?? {}, cloudCards);
          }
          const merged = { cards };
          SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(merged)).catch(() => {});
          return merged;
        });
        if (!cancelled) setCloudHydrated(true);
        // Reconcile stale server-absent local cards against the fresh server deck.
        if (!cancelled) void refreshFromCache();
      } catch (err) {
        logwarn('[srs] Could not load from server:', err);
        if (!cancelled && !isOfflineModeEnabled() && getConnectivity() !== 'offline') {
          setTimeout(() => {
            if (cancelled) return;
            cloudLoadedUserId.current = null;
            setCloudRetry((n) => n + 1);
          }, 5000);
        } else if (!cancelled) {
          // Offline / local-first: proceed with the local store rather than
          // blocking the review screen on a server fetch.
          setCloudHydrated(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [user, loaded, getSrs, cloudRetry, refreshFromCache]);

  // ── User change (logout/login): drop the previous user's in-memory state ──
  useEffect(() => {
    if (loading) return; // auth still restoring — don't treat boot as a user change
    const prev = prevUserIdRef.current;
    const next = user?.id ?? null;
    prevUserIdRef.current = next;
    if (prev === undefined) return; // initial boot — keep locally loaded state
    if (prev !== next) {
      cloudLoadedUserId.current = null;
      setCloudHydrated(false);
      setStore(createSrsStore());
    }
  }, [user?.id, loading]);

  // ── Backend cap rejection: revert the unsynced card and tell the UI ──
  useEffect(() => {
    return subscribeSrsCapRejection((entityId) => {
      const sep = entityId.indexOf('::');
      if (sep < 0) return;
      const lang = entityId.slice(0, sep);
      const wordId = entityId.slice(sep + 2);
      const prev = pendingSrsPreviousRef.current.get(wordId);
      pendingSrsPreviousRef.current.delete(wordId);
      setStore((cur) => {
        const cards: Record<string, Record<string, SrsFields>> = {
          ...cur.cards,
          [lang]: { ...(cur.cards[lang] ?? {}) },
        };
        if (prev) {
          cards[lang][wordId] = prev;
          const payload = { l2: lang, wordId, state: prev };
          upsertEntityCache(
            'srs_card',
            entityId,
            JSON.stringify(payload),
            prev.lastReview ?? Date.now(),
            null,
          ).catch(() => {});
        } else {
          delete cards[lang][wordId];
        }
        const next = { cards };
        SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
      setCapReached(true);
    });
  }, []);

  const updateCard = useCallback(
    (lang: string, wordId: string, fields: Partial<SrsFields>, meta: SrsCardMeta = {}) => {
    const prev = storeRef.current.cards[lang]?.[wordId];
    if (prev) pendingSrsPreviousRef.current.set(wordId, prev);
    setStore((prev) => {
      const langCards = { ...(prev.cards[lang] ?? {}) };
      langCards[wordId] = {
        ...(langCards[wordId] ?? fsrs.newCard()),
        ...fields,
      };
      const next = { ...prev, cards: { ...prev.cards, [lang]: langCards } };
      SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      log(`[srs] queued upsert card ${lang}::${wordId}`);
      const state = fsrs.normalizeFsrsCard(langCards[wordId]);
      enqueueSyncOp({
        entity: 'srs_card',
        entityId: `${lang}::${wordId}`,
        op: 'upsert',
        payload: {
          l2: lang,
          wordId,
          state,
          ...(meta.timezone ? { timezone: meta.timezone } : {}),
          ...(typeof meta.dayStartHour === 'number' ? { dayStartHour: meta.dayStartHour } : {}),
        },
        updatedAt: Date.now(),
      }).catch((err) => {
        logwarn('[srs] Card enqueue failed:', err);
      });
      return next;
    });
    },
    [],
  );

  const removeCard = useCallback((lang: string, wordId: string) => {
    setStore((prev) => {
      const langCards = { ...(prev.cards[lang] ?? {}) };
      delete langCards[wordId];
      const next = { ...prev, cards: { ...prev.cards, [lang]: langCards } };
      SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      log(`[srs] queued delete card ${lang}::${wordId}`);
      enqueueSyncOp({
        entity: 'srs_card',
        entityId: `${lang}::${wordId}`,
        op: 'delete',
        payload: { l2: lang, wordId, updatedAt: Date.now() },
        updatedAt: Date.now(),
      }).catch((err) => {
        logwarn('[srs] Card delete enqueue failed:', err);
      });
      return next;
    });
  }, []);

  /**
   * Local orphan prune (the offline / anonymous fallback). Deleting every card
   * whose id isn't in `savedWordIds` is only safe when that set is complete —
   * a partial view must never wipe a real deck. Callers force
   * `allowWholeDeckPurge: false` for fallback paths; the authoritative server
   * reconcile (`reconcileOrphans`) handles the genuinely-empty-deck case when
   * online.
   */
  const pruneOrphans = useCallback((lang: string, savedWordIds: Set<string>, opts?: { allowWholeDeckPurge?: boolean }) => {
    setStore((prev) => {
      const langCards = prev.cards[lang] ?? {};
      const orphans = Object.keys(langCards).filter((id) => !savedWordIds.has(id));
      if (orphans.length === 0) return prev;
      if (opts?.allowWholeDeckPurge === false && orphans.length === Object.keys(langCards).length) {
        logwarn(`[srs] pruneOrphans ${lang}: would purge the whole deck (${orphans.length} cards); skipping (allowWholeDeckPurge=false)`);
        return prev;
      }
      const prunedCards = { ...langCards };
      for (const id of orphans) delete prunedCards[id];
      const next = { ...prev, cards: { ...prev.cards, [lang]: prunedCards } };
      SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      for (const id of orphans) {
        log(`[srs] queued delete orphan card ${lang}::${id}`);
        enqueueSyncOp({
          entity: 'srs_card',
          entityId: `${lang}::${id}`,
          op: 'delete',
          payload: { l2: lang, wordId: id, updatedAt: Date.now() },
          updatedAt: Date.now(),
        }).catch((err) => {
          logwarn('[srs] Orphan card delete enqueue failed:', err);
        });
      }
      return next;
    });
  }, []);

  /**
   * Authoritative server-side orphan reconciliation (replaces the fragile
   * client-side prune). The server compares a given l2's cards against its
   * saved words and deletes orphans; `protectedWordIds` (words with a pending
   * unsynced saved-word put) are never deleted. The server returns
   * `deletedWordIds`; the client drops those cards locally and must NOT enqueue
   * its own delete ops (they're already gone server-side).
   */
  const reconcileOrphans = useCallback(async (lang: string, protectedWordIds: string[] = []) => {
    const res = await reconcileSrsCards(lang, protectedWordIds);
    const deleted = res?.deletedWordIds ?? [];
    if (deleted.length > 0) {
      setStore((prev) => {
        const langCards = prev.cards[lang] ?? {};
        const nextLang = { ...langCards };
        for (const id of deleted) delete nextLang[id];
        const next = { cards: { ...prev.cards, [lang]: nextLang } };
        SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
      log(`[srs] reconcileOrphans ${lang}: server reconciled ${deleted.length} orphaned card(s); dropped from local state`);
    } else {
      log(`[srs] reconcileOrphans ${lang}: no orphaned cards on server`);
    }
    return deleted.length;
  }, []);

  const resetCapReached = useCallback(() => setCapReached(false), []);

  // Get one card's SRS state (parity with the web useSrs.getCard — used by the
  // dictionary entry card to render the review-status dot).
  const getCard = useCallback((l2Code: string, wordId: string): SrsFields | undefined => {
    return store.cards[l2Code]?.[wordId];
  }, [store]);

  // ── Pull-merge bridge: apply remote SRS changes from another device ──
  // (refreshFromCache is hoisted as a useCallback above so hydration can also
  // trigger a reconcile right after the server deck arrives.)
  useEffect(() => {
    const unsubCard = subscribeEntity('srs_card', () => void refreshFromCache());
    return () => {
      unsubCard();
    };
  }, [refreshFromCache]);

  return {
    store,
    loaded,
    cloudHydrated,
    capReached,
    resetCapReached,
    updateCard,
    removeCard,
    pruneOrphans,
    reconcileOrphans,
    getCard,
  };
}
