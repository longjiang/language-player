import { useState, useCallback, useEffect, useRef } from 'react';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '@/contexts/AuthContext';
import { deleteSrsCard, useUserDataColumns } from '@langplayer/api-client';
import { createSrsStore } from '@langplayer/utils';
import type { SrsFields, SrsProgressStore } from '@langplayer/shared';
import { logwarn } from '@/lib/logger';

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
  const { getSrs, putSrsCard, putSrsSettings } = useUserDataColumns();
  const [store, setStore] = useState<SrsProgressStore>(createSrsStore());
  const [loaded, setLoaded] = useState(false);
  const cloudLoaded = useRef(false);

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
    if (!user || !loaded || cloudLoaded.current) return;
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

  const updateCard = useCallback((lang: string, wordId: string, fields: Partial<SrsFields>) => {
    setStore((prev) => {
      const langCards = { ...(prev.cards[lang] ?? {}) };
      langCards[wordId] = {
        ...(langCards[wordId] ?? { ease: 2.5, interval: 0, repetitions: 0, lastReview: '', nextReview: '' }),
        ...fields,
      };
      const next = { ...prev, cards: { ...prev.cards, [lang]: langCards } };
      SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      putSrsCard(lang, wordId, langCards[wordId]).catch((err) => {
        logwarn('[srs] Card sync failed:', err);
      });
      return next;
    });
  }, [putSrsCard]);

  const removeCard = useCallback((lang: string, wordId: string) => {
    setStore((prev) => {
      const langCards = { ...(prev.cards[lang] ?? {}) };
      delete langCards[wordId];
      const next = { ...prev, cards: { ...prev.cards, [lang]: langCards } };
      SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      deleteSrsCard(lang, wordId).catch((err) => {
        logwarn('[srs] Card delete failed:', err);
      });
      return next;
    });
  }, []);

  const setDailyLimit = useCallback((limit: number) => {
    setStore((prev) => {
      const next = { ...prev, settings: { ...prev.settings, dailyNewLimit: limit } };
      SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      putSrsSettings(limit).catch((err) => {
        logwarn('[srs] Settings sync failed:', err);
      });
      return next;
    });
  }, [putSrsSettings]);

  const dailyNewLimit = store.settings.dailyNewLimit;

  return { store, loaded, updateCard, removeCard, setDailyLimit, dailyNewLimit };
}
