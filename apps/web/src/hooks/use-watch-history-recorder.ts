'use client';

import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/providers/language-provider';
import { baseCode } from '@/lib/language-data';
import { PYTHON_API_URL } from '@/lib/api-url';

const SAVE_INTERVAL_MS = 15_000; // every 15 seconds

interface SessionInfo {
  userId: string | null;
  token: string | null;
  loaded: boolean;
}

/**
 * Periodically saves the user's current playback position to watch history
 * via POST /save-watch-history.
 *
 * Usage: call useWatchHistoryRecorder(videoId, currentTime) on the watch page.
 * Pass 0 or undefined for videoId to pause recording (e.g., when no video loaded).
 *
 * Session is fetched via /api/auth/session (NextAuth endpoint) rather than
 * useSession() to avoid hydration/suspense issues with the YouTube iframe.
 */
export function useWatchHistoryRecorder(
  videoId: string | undefined,
  currentTime: number,
) {
  const { l2 } = useLanguage();
  const [session, setSession] = useState<SessionInfo>({ userId: null, token: null, loaded: false });
  const lastSavedRef = useRef<{ time: number; videoId: string } | null>(null);
  const currentTimeRef = useRef(currentTime);

  // Keep ref in sync without re-triggering the effect
  currentTimeRef.current = currentTime;

  // Fetch session on mount — fetch() is more reliable than useSession() inside
  // pages with heavy third-party embeds (YouTube iframe)
  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/session')
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const userId = data?.user?.id ?? null;
        const token = data?.user?.directusToken ?? null;
        setSession({ userId, token, loaded: true });
        console.log('[watch-history] session loaded', { hasUserId: !!userId, hasToken: !!token });
      })
      .catch(() => {
        if (!cancelled) setSession({ userId: null, token: null, loaded: true });
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const { userId, token, loaded } = session;
    if (!videoId || !userId || !token) {
      // Only log when session is loaded to avoid noise during initial fetch
      if (loaded || videoId) {
        console.log('[watch-history] recorder inactive', { hasVideoId: !!videoId, hasUserId: !!userId, hasToken: !!token });
      }
      return;
    }

    console.log('[watch-history] recorder active — will save every 15s', { videoId, userId });

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

      console.log('[watch-history] sending save', { videoId, position: Math.round(time) });

      fetch(`${PYTHON_API_URL}/save-watch-history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: userId,
          l2: baseCode(l2.code),
          video_id: parseInt(videoId, 10),
          last_position: Math.round(time),
          token,
        }),
      }).catch(() => {
        // Silently ignore save failures — not critical
      });
    }, SAVE_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [videoId, session, l2.code]); // currentTime NOT in deps — uses ref instead
}
