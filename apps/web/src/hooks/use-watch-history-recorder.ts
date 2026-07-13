'use client';

import { useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useLanguage } from '@/providers/language-provider';
import { baseCode } from '@/lib/language-data';
import { PYTHON_API_URL } from '@/lib/api-url';

const SAVE_INTERVAL_MS = 15_000; // every 15 seconds

/**
 * Periodically saves the user's current playback position to watch history
 * via POST /save-watch-history.
 *
 * Usage: call useWatchHistoryRecorder(videoId, currentTime) on the watch page.
 * Pass 0 or undefined for videoId to pause recording (e.g., when no video loaded).
 */
export function useWatchHistoryRecorder(
  videoId: string | undefined,
  currentTime: number,
) {
  const { data: session } = useSession();
  const { l2 } = useLanguage();
  const userId = session?.user?.id;
  const token = (session?.user as any)?.directusToken as string | undefined;
  const lastSavedRef = useRef<{ time: number; videoId: string } | null>(null);

  useEffect(() => {
    if (!videoId || !userId || !token) return;

    const interval = setInterval(() => {
      if (currentTime <= 0) return;

      if (
        lastSavedRef.current &&
        lastSavedRef.current.videoId === videoId &&
        Math.abs(lastSavedRef.current.time - currentTime) < 2
      ) {
        return;
      }

      lastSavedRef.current = { time: currentTime, videoId };

      fetch(`${PYTHON_API_URL}/save-watch-history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: userId,
          l2: baseCode(l2.code),
          video_id: parseInt(videoId, 10),
          last_position: Math.round(currentTime),
          token,
        }),
      }).catch(() => {
        // Silently ignore save failures — not critical
      });
    }, SAVE_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [videoId, currentTime, userId, token, l2.code]);
}
