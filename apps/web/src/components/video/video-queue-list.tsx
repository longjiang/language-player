'use client';

import { useVideoPlayer } from '@/providers/video-player-provider';
import { VideoCard } from './video-card';
import type { YouTubeVideo } from '@langplayer/shared';

interface VideoQueueListProps {
  currentYoutubeId: string;
}

export function VideoQueueList({ currentYoutubeId }: VideoQueueListProps) {
  const { queueState, playVideo } = useVideoPlayer();
  const { queue, queueType } = queueState;

  if (queue.length <= 1) return null;

  return (
    <div className="space-y-1">
      {queue.map((video) => (
        <VideoCard
          key={video.youtube_id}
          video={video}
          videos={queue}
          queueType={queueType}
          layout="list"
          isActive={video.youtube_id === currentYoutubeId}
        />
      ))}
    </div>
  );
}
