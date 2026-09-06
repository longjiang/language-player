'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import type { YouTubeVideo } from '@langplayer/shared';
import {
  QueueManager,
  getGlobalQueueManager,
  type QueueType,
  type QueueState,
} from '@langplayer/utils';
import { useLanguage } from './language-provider';
import { baseCode } from '@/lib/language-data';

const QUEUE_STORAGE_KEY = 'lp-video-queue';

interface VideoPlayerContextValue {
  queueState: QueueState;
  /** Set the queue and navigate to the first video */
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
  /** Navigate to next video in queue */
  playNext: () => void;
  /** Navigate to previous video in queue */
  playPrevious: () => void;
  /** Whether there is a next/previous video */
  hasNext: boolean;
  hasPrevious: boolean;
}

const VideoPlayerContext = createContext<VideoPlayerContextValue | null>(null);

export function VideoPlayerProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { l1, l2 } = useLanguage();
  const [qm] = useState(() => getGlobalQueueManager());
  const [queueState, setQueueState] = useState<QueueState>(() =>
    qm.getSnapshot(),
  );

  // Persist the current queue so a page refresh / cold link can restore it.
  const persist = useCallback(
    (videoYoutubeId?: string) => {
      try {
        const snapshot = qm.getSnapshot(videoYoutubeId ?? '');
        localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(snapshot));
      } catch {
        /* localStorage unavailable / quota — queue simply won't persist */
      }
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
      router.push(
        `/${l1.code}/${l2.code}/watch/${video.youtube_id}?queueType=${queueType}`,
      );
    },
    [qm, router, l1.code, l2.code, persist],
  );

  const playNext = useCallback(() => {
    const next = qm.getNext(queueState.currentVideo?.youtube_id ?? '');
    if (next) {
      setQueueState(qm.getSnapshot(next.youtube_id));
      persist(next.youtube_id);
      router.push(
        `/${l1.code}/${l2.code}/watch/${next.youtube_id}?queueType=${qm.queueType}`,
      );
    }
  }, [qm, router, l1.code, l2.code, queueState.currentVideo, persist]);

  const playPrevious = useCallback(() => {
    const prev = qm.getPrevious(queueState.currentVideo?.youtube_id ?? '');
    if (prev) {
      setQueueState(qm.getSnapshot(prev.youtube_id));
      persist(prev.youtube_id);
      router.push(
        `/${l1.code}/${l2.code}/watch/${prev.youtube_id}?queueType=${qm.queueType}`,
      );
    }
  }, [qm, router, l1.code, l2.code, queueState.currentVideo, persist]);

  const restoreQueueIfCurrent = useCallback(
    async (videoId: string): Promise<boolean> => {
      try {
        const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
        if (!raw) return false;
        const persisted: QueueState = JSON.parse(raw);
        if (persisted?.currentVideo?.youtube_id !== videoId) return false;
        qm.restore(persisted);
        setQueueState(qm.getSnapshot(videoId));
        return true;
      } catch {
        return false;
      }
    },
    [qm],
  );

  const hasNext =
    !!queueState.currentVideo &&
    qm.getNext(queueState.currentVideo.youtube_id) !== null;

  const hasPrevious =
    !!queueState.currentVideo &&
    qm.getPrevious(queueState.currentVideo.youtube_id) !== null;

  return (
    <VideoPlayerContext.Provider
      value={{
        queueState,
        playVideo,
        setQueue,
        restoreQueueIfCurrent,
        playNext,
        playPrevious,
        hasNext,
        hasPrevious,
      }}
    >
      {children}
    </VideoPlayerContext.Provider>
  );
}

export function useVideoPlayer() {
  const ctx = useContext(VideoPlayerContext);
  if (!ctx) {
    throw new Error('useVideoPlayer must be used within VideoPlayerProvider');
  }
  return ctx;
}
