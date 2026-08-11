import { useState, useCallback, useEffect, useRef } from 'react';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '@/contexts/AuthContext';
import { useUserDataColumns } from '@langplayer/api-client';
import { createSrsStore } from '@langplayer/utils';
import type { SrsFields, SrsProgressStore } from '@langplayer/shared';
import { syncLogger } from '@/lib/logger';
import { enqueueSyncOp, subscribeEntity } from '@/lib/sync-engine';
import { getEntityCache } from '@/lib/sync-db';

const { log, logwarn } = syncLogger;

const STORAGE_KEY = 'zthSrsProgress';

function mergeSrsCards(local: Record<string, SrsFields>, cloud: Record<string, SrsFields>): Record<string, SrsFields> {
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
 * SRS hook (SPEC-039 5.2 row API).
 *
 * - SecureStore first (offline-capable)
 * - Authenticated: hydrate from GET /srs (newer lastReview wins per card)
 * - updateCard → PUT /srs/cards; removeCard → DELETE /srs/cards;
 *   setDailyLimit → PUT /srs/settings
 */
export function useSrs() {
  const { user } = useAuth();
  const { getSrs } = useUserDataColumns();
  const [store, setStore] = useState<SrsProgressStore>(createSrsStore());
  const [loaded, setLoaded] = useState(false);
  const cloudLoadedUserId = useRef<string | null>(null);
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (loaded) return;
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          setStore({
            settings: { ...createSrsStore().settings, ...(parsed.settings ?? {}) },
            cards: parsed.cards ?? {},
          });
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
      } catch (err) {
        logwarn('[srs] Could not load from server:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [user, loaded, getSrs]);

  // ── User change (logout/login): drop the previous user's in-memory state ──
  useEffect(() => {
    const prev = prevUserIdRef.current;
    const next = user?.id ?? null;
    prevUserIdRef.current = next;
    if (prev === undefined) return; // initial boot — keep locally loaded state
    if (prev !== next) {
      cloudLoadedUserId.current = null;
      setStore(createSrsStore());
    }
  }, [user?.id]);

  const updateCard = useCallback((lang: string, wordId: string, fields: Partial<SrsFields>) => {
    setStore((prev) => {
      const langCards = { ...(prev.cards[lang] ?? {}) };
      langCards[wordId] = {
        ...(langCards[wordId] ?? { ease: 2.5, interval: 0, repetitions: 0, lastReview: '', nextReview: '' }),
        ...fields,
      };
      const next = { ...prev, cards: { ...prev.cards, [lang]: langCards } };
      SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      log(`[srs] queued upsert card ${lang}::${wordId}`);
      enqueueSyncOp({
        entity: 'srs_card',
        entityId: `${lang}::${wordId}`,
        op: 'upsert',
        payload: { l2: lang, wordId, state: langCards[wordId] },
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

  const setDailyLimit = useCallback((limit: number) => {
    setStore((prev) => {
      const next = { ...prev, settings: { ...prev.settings, dailyNewLimit: limit } };
      SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      log(`[srs] queued settings dailyNewLimit=${limit}`);
      enqueueSyncOp({
        entity: 'srs_settings',
        entityId: 'default',
        op: 'upsert',
        payload: { dailyNewLimit: limit },
        updatedAt: Date.now(),
      }).catch((err) => {
        logwarn('[srs] Settings enqueue failed:', err);
      });
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
            state?: SrsFields;
          };
          if (!payload.l2 || !payload.wordId || !payload.state) continue;
          cards[payload.l2] = {
            ...(cards[payload.l2] ?? {}),
            [payload.wordId]: payload.state,
          };
        }
        const settingsRow = (await getEntityCache('srs_settings'))[0];
        let settings = createSrsStore().settings;
        if (settingsRow && settingsRow.deleted_at == null) {
          const payload = JSON.parse(settingsRow.payload) as { dailyNewLimit?: number };
          settings = { ...settings, dailyNewLimit: payload.dailyNewLimit ?? settings.dailyNewLimit };
        }
        setStore((prev) => {
          const next = { settings, cards };
          SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
          return next;
        });
      } catch (e) {
        logwarn('[srs] pull merge failed:', e);
      }
    };
    const unsubCard = subscribeEntity('srs_card', () => void refreshFromCache());
    const unsubSettings = subscribeEntity('srs_settings', () => void refreshFromCache());
    return () => {
      unsubCard();
      unsubSettings();
    };
  }, []);

  const dailyNewLimit = store.settings.dailyNewLimit;

  return { store, loaded, updateCard, removeCard, setDailyLimit, dailyNewLimit };
}
