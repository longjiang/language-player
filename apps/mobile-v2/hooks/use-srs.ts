import { useState, useCallback, useEffect, useRef } from 'react';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '@/contexts/AuthContext';
import { useUserData } from '@langplayer/api-client';
import { useCloudUserData } from '@/contexts/UserDataContext';
import { createSrsStore } from '@langplayer/utils';
import type { SrsFields, SrsProgressStore } from '@langplayer/shared';

const STORAGE_KEY = 'zthSrsProgress';
const SYNC_DEBOUNCE_MS = 3000;

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

export function useSrs() {
  const { user } = useAuth();
  const { getUserData } = useUserData();
  const { data: cloudData, loaded: cloudLoaded } = useCloudUserData();
  const [store, setStore] = useState<SrsProgressStore>(createSrsStore());
  const [loaded, setLoaded] = useState(false);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSyncing = useRef(false);

  useEffect(() => {
    if (loaded) return;
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          setStore({ settings: { ...createSrsStore().settings, ...(parsed.settings ?? {}) }, cards: parsed.cards ?? {} });
        }
      } catch {}
      setLoaded(true);
    })();
  }, [loaded]);

  useEffect(() => {
    if (!user || !loaded || !cloudLoaded || !cloudData?.srs_progress) return;
    try {
      const cloud = JSON.parse(cloudData.srs_progress) as SrsProgressStore;
      setStore((prev) => {
        const cards: Record<string, Record<string, SrsFields>> = { ...prev.cards };
        for (const [lang, cloudCards] of Object.entries(cloud.cards ?? {})) {
          cards[lang] = mergeSrsCards(prev.cards[lang] ?? {}, cloudCards);
        }
        const merged = { settings: { ...prev.settings, ...cloud.settings }, cards };
        SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(merged));
        return merged;
      });
    } catch {}
  }, [user, loaded, cloudLoaded, cloudData]);

  const scheduleSync = useCallback((s: SrsProgressStore) => {
    if (!user) return;
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(async () => {
      if (isSyncing.current) return;
      isSyncing.current = true;
      try {
        const { apiClient } = await import('@langplayer/api-client');
        await apiClient.post('/user-data/sync', { srs_progress: JSON.stringify(s) });
      } catch (err) {
        console.warn('[srs] Cloud sync failed:', err);
      } finally {
        isSyncing.current = false;
      }
    }, SYNC_DEBOUNCE_MS);
  }, [user]);

  const updateCard = useCallback((lang: string, wordId: string, fields: Partial<SrsFields>) => {
    setStore((prev) => {
      const langCards = { ...(prev.cards[lang] ?? {}) };
      langCards[wordId] = { ...(langCards[wordId] ?? { ease: 2.5, interval: 0, repetitions: 0, lastReview: '', nextReview: '' }), ...fields };
      const next = { ...prev, cards: { ...prev.cards, [lang]: langCards } };
      SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(next));
      scheduleSync(next);
      return next;
    });
  }, [scheduleSync]);

  const setDailyLimit = useCallback((limit: number) => {
    setStore((prev) => {
      const next = { ...prev, settings: { ...prev.settings, dailyNewLimit: limit } };
      SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(next));
      scheduleSync(next);
      return next;
    });
  }, [scheduleSync]);

  return { store, loaded, updateCard, setDailyLimit };
}
