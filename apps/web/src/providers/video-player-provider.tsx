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
} from '@/lib/queue-manager';
import { useLanguage } from './language-provider';
import { baseCode } from '@/lib/language-data';

interface VideoPlayerContextValue {
  queueState: QueueState;
  /** Set the queue and navigate to the first video */
  playVideo: (
    video: YouTubeVideo,
    queue: YouTubeVideo[],
    queueType?: QueueType,
  ) => void;
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

  const playVideo = useCallback(
    (
      video: YouTubeVideo,
      queue: YouTubeVideo[],
      queueType: QueueType = 'recommended',
    ) => {
      qm.setVideoAndQueue(video, queue, queueType);
      setQueueState(qm.getSnapshot(video.youtube_id));
      router.push(
        `/${l1.code}/${l2.code}/watch/${video.youtube_id}?queueType=${queueType}`,
      );
    },
    [qm, router, l1.code, l2.code],
  );

  const playNext = useCallback(() => {
    const next = qm.getNext(queueState.currentVideo?.youtube_id ?? '');
    if (next) {
      setQueueState(qm.getSnapshot(next.youtube_id));
      router.push(
        `/${l1.code}/${l2.code}/watch/${next.youtube_id}?queueType=${qm.queueType}`,
      );
    }
  }, [qm, router, l1.code, l2.code, queueState.currentVideo]);

  const playPrevious = useCallback(() => {
    const prev = qm.getPrevious(queueState.currentVideo?.youtube_id ?? '');
    if (prev) {
      setQueueState(qm.getSnapshot(prev.youtube_id));
      router.push(
        `/${l1.code}/${l2.code}/watch/${prev.youtube_id}?queueType=${qm.queueType}`,
      );
    }
  }, [qm, router, l1.code, l2.code, queueState.currentVideo]);

  const hasNext =
    !!queueState.currentVideo &&
    qm.getNext(queueState.currentVideo.youtube_id) !== null;

  const hasPrevious =
    !!queueState.currentVideo &&
    qm.getPrevious(queueState.currentVideo.youtube_id) !== null;

  return (
    <VideoPlayerContext.Provider
      value={{ queueState, playVideo, playNext, playPrevious, hasNext, hasPrevious }}
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
