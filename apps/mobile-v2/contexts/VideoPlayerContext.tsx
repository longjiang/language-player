import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { router } from 'expo-router';
import type { YouTubeVideo } from '@langplayer/shared';
import {
  QueueManager,
  getGlobalQueueManager,
  type QueueType,
  type QueueState,
} from '@/lib/queue-manager';

interface VideoPlayerContextValue {
  queueState: QueueState;
  playVideo: (
    video: YouTubeVideo,
    queue: YouTubeVideo[],
    queueType?: QueueType,
    metadata?: { tvShow?: { id: number; title: string }; searchTerm?: string },
  ) => void;
  playNext: () => void;
  playPrevious: () => void;
  hasNext: boolean;
  hasPrevious: boolean;
}

const VideoPlayerContext = createContext<VideoPlayerContextValue | null>(null);

export function VideoPlayerProvider({ children }: { children: ReactNode }) {
  const [qm] = useState(() => getGlobalQueueManager());
  const [queueState, setQueueState] = useState<QueueState>(() => qm.getSnapshot());

  const playVideo = useCallback(
    (
      video: YouTubeVideo,
      queue: YouTubeVideo[],
      queueType: QueueType = 'recommended',
      metadata?: { tvShow?: { id: number; title: string }; searchTerm?: string },
    ) => {
      qm.setVideoAndQueue(video, queue, queueType, metadata);
      setQueueState(qm.getSnapshot(video.youtube_id));
      router.push(`/(tabs)/(media)/watch/${video.youtube_id}?queueType=${queueType}` as any);
    },
    [qm],
  );

  const playNext = useCallback(() => {
    const next = qm.getNext(queueState.currentVideo?.youtube_id ?? '');
    if (next) {
      setQueueState(qm.getSnapshot(next.youtube_id));
      router.push(`/(tabs)/(media)/watch/${next.youtube_id}?queueType=${qm.queueType}` as any);
    }
  }, [qm, queueState.currentVideo]);

  const playPrevious = useCallback(() => {
    const prev = qm.getPrevious(queueState.currentVideo?.youtube_id ?? '');
    if (prev) {
      setQueueState(qm.getSnapshot(prev.youtube_id));
      router.push(`/(tabs)/(media)/watch/${prev.youtube_id}?queueType=${qm.queueType}` as any);
    }
  }, [qm, queueState.currentVideo]);

  const hasNext = !!queueState.currentVideo && qm.getNext(queueState.currentVideo.youtube_id) !== null;
  const hasPrevious = !!queueState.currentVideo && qm.getPrevious(queueState.currentVideo.youtube_id) !== null;

  return (
    <VideoPlayerContext.Provider value={{ queueState, playVideo, playNext, playPrevious, hasNext, hasPrevious }}>
      {children}
    </VideoPlayerContext.Provider>
  );
}

export function useVideoPlayer() {
  const ctx = useContext(VideoPlayerContext);
  if (!ctx) throw new Error('useVideoPlayer must be used within VideoPlayerProvider');
  return ctx;
}
