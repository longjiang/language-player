'use client';

import { useVideoPlayer } from '@/providers/video-player-provider';
import { VideoCard } from './video-card';
import { Tv } from 'lucide-react';
import type { YouTubeVideo } from '@langplayer/shared';

interface VideoQueueListProps {
  currentYoutubeId: string;
}

export function VideoQueueList({ currentYoutubeId }: VideoQueueListProps) {
  const { queueState, playVideo } = useVideoPlayer();
  const { queue, queueType, tvShow } = queueState;

  if (queue.length === 0) return null;
  // For TV shows, always show the full episode list even if only 1 episode
  if (queue.length <= 1 && queueType !== 'tvShow') return null;

  return (
    <div className="space-y-1">
      {/* TV show header */}
      {queueType === 'tvShow' && tvShow && (
        <div className="mb-2 flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
          <Tv className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">{tvShow.title}</span>
          <span className="text-xs text-muted-foreground">
            ({queue.length} episodes)
          </span>
        </div>
      )}

      {queue.map((video, idx) => (
        <div key={video.youtube_id} className="flex items-center gap-2">
          {/* Episode number for TV shows */}
          {queueType === 'tvShow' && (
            <span className="w-6 flex-shrink-0 text-center text-xs font-medium text-muted-foreground">
              {idx + 1}
            </span>
          )}
          <div className="flex-1 min-w-0">
            <VideoCard
              video={video}
              videos={queue}
              queueType={queueType}
              layout="list"
              isActive={video.youtube_id === currentYoutubeId}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
