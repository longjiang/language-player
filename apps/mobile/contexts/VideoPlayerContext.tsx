import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  type ReactNode,
} from 'react';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import type { YouTubeVideo } from '@langplayer/shared';
import {
  QueueManager,
  getGlobalQueueManager,
  type QueueType,
  type QueueState,
} from '@langplayer/utils';

const QUEUE_STORAGE_KEY = 'lp-video-queue';

interface VideoPlayerContextValue {
  queueState: QueueState;
  playVideo: (
    video: YouTubeVideo,
    queue: YouTubeVideo[],
    queueType?: QueueType,
    metadata?: { tvShow?: { id: number; title: string }; searchTerm?: string },
  ) => void;
  /** Set the queue WITHOUT navigating — used by the watch page to build a
   *  queue (tv-show episodes / recommendations) once the video metadata loads. */
  setQueue: (
    video: YouTubeVideo,
    queue: YouTubeVideo[],
    queueType?: QueueType,
    metadata?: { tvShow?: { id: number; title: string }; searchTerm?: string },
  ) => void;
  /** Restore a persisted queue whose current video matches `videoId` (i.e. the
   *  queue survives a page refresh / cold link). Resolves true if restored. */
  restoreQueueIfCurrent: (videoId: string) => Promise<boolean>;
  playNext: () => void;
  playPrevious: () => void;
  ensureQueue: (video: YouTubeVideo) => void;
  hasNext: boolean;
  hasPrevious: boolean;
}

const VideoPlayerContext = createContext<VideoPlayerContextValue | null>(null);

export function VideoPlayerProvider({ children }: { children: ReactNode }) {
  const [qm] = useState(() => getGlobalQueueManager());
  const [queueState, setQueueState] = useState<QueueState>(() => qm.getSnapshot());

  // ── Queue persistence (page refresh / cold link) ──
  const persistedQueueRef = useRef<QueueState | null>(null);
  const persistedQueueLoadRef = useRef<Promise<QueueState | null> | null>(null);

  const loadPersistedQueue = useCallback((): Promise<QueueState | null> => {
    if (persistedQueueLoadRef.current) return persistedQueueLoadRef.current;
    persistedQueueLoadRef.current = (async () => {
      try {
        const raw = await SecureStore.getItemAsync(QUEUE_STORAGE_KEY);
        if (raw) return JSON.parse(raw) as QueueState;
      } catch {
        /* SecureStore unavailable — queue won't persist */
      }
      return null;
    })();
    return persistedQueueLoadRef.current;
  }, []);

  useEffect(() => {
    loadPersistedQueue().then((q) => {
      persistedQueueRef.current = q;
    });
  }, [loadPersistedQueue]);

  const persist = useCallback(
    (videoYoutubeId?: string) => {
      const snapshot = qm.getSnapshot(videoYoutubeId ?? '');
      void SecureStore.setItemAsync(QUEUE_STORAGE_KEY, JSON.stringify(snapshot));
    },
    [qm],
  );

  const setQueue = useCallback(
    (
      video: YouTubeVideo,
      queue: YouTubeVideo[],
      queueType: QueueType = 'recommended',
      metadata?: { tvShow?: { id: number; title: string }; searchTerm?: string },
    ) => {
      qm.setVideoAndQueue(video, queue, queueType, metadata);
      setQueueState(qm.getSnapshot(video.youtube_id));
      persist(video.youtube_id);
    },
    [qm, persist],
  );

  const playVideo = useCallback(
    (
      video: YouTubeVideo,
      queue: YouTubeVideo[],
      queueType: QueueType = 'recommended',
      metadata?: { tvShow?: { id: number; title: string }; searchTerm?: string },
    ) => {
      qm.setVideoAndQueue(video, queue, queueType, metadata);
      setQueueState(qm.getSnapshot(video.youtube_id));
      persist(video.youtube_id);
      router.push(`/(tabs)/(media)/watch/${video.youtube_id}?queueType=${queueType}` as any);
    },
    [qm, persist],
  );

  const playNext = useCallback(() => {
    const next = qm.getNext(queueState.currentVideo?.youtube_id ?? '');
    if (next) {
      setQueueState(qm.getSnapshot(next.youtube_id));
      persist(next.youtube_id);
      router.push(`/(tabs)/(media)/watch/${next.youtube_id}?queueType=${qm.queueType}` as any);
    }
  }, [qm, queueState.currentVideo, persist]);

  const playPrevious = useCallback(() => {
    const prev = qm.getPrevious(queueState.currentVideo?.youtube_id ?? '');
    if (prev) {
      setQueueState(qm.getSnapshot(prev.youtube_id));
      persist(prev.youtube_id);
      router.push(`/(tabs)/(media)/watch/${prev.youtube_id}?queueType=${qm.queueType}` as any);
    }
  }, [qm, queueState.currentVideo, persist]);

  const restoreQueueIfCurrent = useCallback(
    async (videoId: string): Promise<boolean> => {
      const persisted = persistedQueueRef.current ?? (await loadPersistedQueue());
      if (!persisted?.currentVideo?.youtube_id) return false;
      if (persisted.currentVideo.youtube_id !== videoId) return false;
      qm.restore(persisted);
      setQueueState(qm.getSnapshot(videoId));
      return true;
    },
    [qm, loadPersistedQueue],
  );

  /** Seed the queue with a single video when navigating directly to it. */
  const ensureQueue = useCallback((video: YouTubeVideo) => {
    if (qm.findIndex(video.youtube_id) >= 0) return;
    qm.setVideoAndQueue(video, [video], 'recommended');
    setQueueState(qm.getSnapshot(video.youtube_id));
    persist(video.youtube_id);
  }, [qm, persist]);

  const hasNext = !!queueState.currentVideo && qm.getNext(queueState.currentVideo.youtube_id) !== null;
  const hasPrevious = !!queueState.currentVideo && qm.getPrevious(queueState.currentVideo.youtube_id) !== null;

  return (
    <VideoPlayerContext.Provider
      value={{ queueState, playVideo, setQueue, restoreQueueIfCurrent, playNext, playPrevious, ensureQueue, hasNext, hasPrevious }}
    >
      {children}
    </VideoPlayerContext.Provider>
  );
}

export function useVideoPlayer() {
  const ctx = useContext(VideoPlayerContext);
  if (!ctx) throw new Error('useVideoPlayer must be used within VideoPlayerProvider');
  return ctx;
}
