import { useState, useCallback, useEffect, useRef } from 'react';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '@/contexts/AuthContext';
import { useUserDataColumns } from '@langplayer/api-client';
import { createSrsStore, fsrs, mergeSrsCards } from '@langplayer/utils';
import type { SrsFields, SrsProgressStore } from '@langplayer/shared';
import { syncLogger } from '@/lib/logger';
import { enqueueSyncOp, subscribeEntity } from '@/lib/sync-engine';
import { getEntityCache } from '@/lib/sync-db';
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
 *   dailyNewLimit now lives in settings_v2 (SettingsContext); the legacy
 *   /srs/settings row is deprecated (SPEC-066 Phase 6).
 */
export function useSrs() {
  const { user } = useAuth();
  const { getSrs } = useUserDataColumns();
  const [store, setStore] = useState<SrsProgressStore>(createSrsStore());
  const [loaded, setLoaded] = useState(false);
  const [cloudHydrated, setCloudHydrated] = useState(false);
  const [cloudRetry, setCloudRetry] = useState(0);
  const cloudLoadedUserId = useRef<string | null>(null);
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

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
        const cloud = {
          settings: res.settings ?? { dailyNewLimit: 20 },
          cards: res.cards ?? {},
        };
        setStore((prev) => {
          const cards: Record<string, Record<string, SrsFields>> = { ...prev.cards };
          for (const [lang, cloudCards] of Object.entries(cloud.cards)) {
            cards[lang] = mergeSrsCards(prev.cards[lang] ?? {}, cloudCards);
          }
          const merged = { settings: { ...prev.settings, ...cloud.settings }, cards };
          SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(merged)).catch(() => {});
          return merged;
        });
        if (!cancelled) setCloudHydrated(true);
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
  }, [user, loaded, getSrs, cloudRetry]);

  // ── User change (logout/login): drop the previous user's in-memory state ──
  useEffect(() => {
    const prev = prevUserIdRef.current;
    const next = user?.id ?? null;
    prevUserIdRef.current = next;
    if (prev === undefined) return; // initial boot — keep locally loaded state
    if (prev !== next) {
      cloudLoadedUserId.current = null;
      setCloudHydrated(false);
      setStore(createSrsStore());
    }
  }, [user?.id]);

  const updateCard = useCallback((lang: string, wordId: string, fields: Partial<SrsFields>) => {
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
        payload: { l2: lang, wordId, state },
        updatedAt: Date.now(),
      }).catch((err) => {
        logwarn('[srs] Card enqueue failed:', err);
      });
      return next;
    });
  }, []);

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
        payload: { l2: lang, wordId },
        updatedAt: Date.now(),
      }).catch((err) => {
        logwarn('[srs] Card delete enqueue failed:', err);
      });
      return next;
    });
  }, []);

  const pruneOrphans = useCallback((lang: string, savedWordIds: Set<string>) => {
    setStore((prev) => {
      const langCards = prev.cards[lang] ?? {};
      const orphans = Object.keys(langCards).filter((id) => !savedWordIds.has(id));
      if (orphans.length === 0) return prev;
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
          payload: { l2: lang, wordId: id },
          updatedAt: Date.now(),
        }).catch((err) => {
          logwarn('[srs] Orphan card delete enqueue failed:', err);
        });
      }
      return next;
    });
  }, []);

  // ── Pull-merge bridge: apply remote SRS changes from another device ──
  useEffect(() => {
    const refreshFromCache = async () => {
      try {
        const cardRows = await getEntityCache('srs_card');
        const cards: Record<string, Record<string, SrsFields>> = {};
        for (const row of cardRows) {
          if (row.deleted_at != null) continue;
          const payload = JSON.parse(row.payload) as {
            l2?: string;
            wordId?: string;
            state?: unknown;
          };
          if (!payload.l2 || !payload.wordId || !payload.state) continue;
          const state = fsrs.normalizeFsrsCard(payload.state);
          cards[payload.l2] = {
            ...(cards[payload.l2] ?? {}),
            [payload.wordId]: state,
          };
        }
        setStore((prev) => {
          const next = { settings: prev.settings, cards };
          SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
          return next;
        });
      } catch (e) {
        logwarn('[srs] pull merge failed:', e);
      }
    };
    const unsubCard = subscribeEntity('srs_card', () => void refreshFromCache());
    return () => {
      unsubCard();
    };
  }, []);

  return { store, loaded, cloudHydrated, updateCard, removeCard, pruneOrphans };
}
