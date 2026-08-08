import { useEffect, useRef } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { baseCode } from '@langplayer/utils';
import { enqueueSyncOp } from '@/lib/sync-engine';

const SAVE_INTERVAL_MS = 15_000;

/**
 * Periodically saves the user's current playback position to watch history
 * via POST /watch-history (SPEC-039 5.5).
 *
 * Ported from apps/web/src/hooks/use-watch-history-recorder.ts.
 */
export function useWatchHistoryRecorder(
  videoId: string | undefined,
  currentTime: number,
) {
  const { l2Lang } = useLanguage();
  const { user, token } = useAuth();
  const lastSavedRef = useRef<{ time: number; videoId: string } | null>(null);
  const currentTimeRef = useRef(currentTime);

  currentTimeRef.current = currentTime;

  useEffect(() => {
    if (!videoId || !user?.id || !token) return;

    const userId = user.id;
    const l2 = baseCode(l2Lang.code);

    const interval = setInterval(() => {
      const time = currentTimeRef.current;
      if (time <= 0) return;
      const numericVideoId = Number(videoId);
      if (!Number.isFinite(numericVideoId)) return;

      if (
        lastSavedRef.current &&
        lastSavedRef.current.videoId === videoId &&
        Math.abs(lastSavedRef.current.time - time) < 2
      ) {
        return;
      }

      lastSavedRef.current = { time, videoId };

      enqueueSyncOp({
        entity: 'watch_history',
        entityId: String(numericVideoId),
        op: 'upsert',
        payload: {
          videoId: numericVideoId,
          l2,
          lastPosition: Math.round(time),
          date: new Date().toISOString(),
        },
        updatedAt: Date.now(),
      }).catch(() => {
        // Silently ignore save failures
      });
    }, SAVE_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [videoId, user?.id, token, l2Lang.code]);
}
