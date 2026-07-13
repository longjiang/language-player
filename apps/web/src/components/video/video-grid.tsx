import type { YouTubeVideo } from '@langplayer/shared';
import type { QueueType } from '@/lib/queue-manager';
import { VideoCard } from './video-card';

interface VideoGridProps {
  videos: YouTubeVideo[];
  /** When provided, enables queue navigation when clicking cards */
  queueType?: QueueType;
}

export function VideoGrid({ videos, queueType }: VideoGridProps) {
  if (videos.length === 0) return null;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {videos.map((video) => (
        <VideoCard
          key={video.youtube_id}
          video={video}
          videos={videos}
          queueType={queueType}
        />
      ))}
    </div>
  );
}
