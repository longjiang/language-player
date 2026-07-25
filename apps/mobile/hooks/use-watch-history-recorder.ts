import { useEffect, useRef } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { PYTHON_API_URL } from '@/lib/api-url';

const SAVE_INTERVAL_MS = 15_000;

/**
 * Periodically saves the user's current playback position to watch history
 * via POST /save-watch-history.
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
    const l2 = l2Lang.code;

    const interval = setInterval(() => {
      const time = currentTimeRef.current;
      if (time <= 0) return;

      if (
        lastSavedRef.current &&
        lastSavedRef.current.videoId === videoId &&
        Math.abs(lastSavedRef.current.time - time) < 2
      ) {
        return;
      }

      lastSavedRef.current = { time, videoId };

      fetch(`${PYTHON_API_URL}/save-watch-history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: userId,
          l2,
          video_id: parseInt(videoId, 10),
          last_position: Math.round(time),
          token,
        }),
      }).catch(() => {
        // Silently ignore save failures
      });
    }, SAVE_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [videoId, user?.id, token, l2Lang.code]);
}
