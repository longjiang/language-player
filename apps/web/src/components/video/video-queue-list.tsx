'use client';

import { useVideoPlayer } from '@/providers/video-player-provider';
import { VideoCard } from './video-card';
import { VideoQueuePanel } from './video-queue-panel';
import { useT } from '@/hooks/use-t';

interface VideoQueueListProps {
  currentYoutubeId: string;
}

/** Watch page's queue tab — a thin adapter over the shared VideoQueuePanel. */
export function VideoQueueList({ currentYoutubeId }: VideoQueueListProps) {
  const t = useT();
  const { queueState } = useVideoPlayer();
  const { queue, queueType, tvShow } = queueState;

  if (queue.length === 0) return null;
  // For TV shows, always show the full episode list even if only 1 episode
  if (queue.length <= 1 && queueType !== 'tvShow') return null;

  return (
    <VideoQueuePanel
      items={queue}
      keyFor={(v) => v.youtube_id}
      emptyText=""
      header={
        queueType === 'tvShow' && tvShow ? (
          <div className="mb-2 rounded-lg bg-muted/50 px-3 py-2">
            <p className="text-sm font-medium text-foreground">{tvShow.title}</p>
            <p className="text-xs text-muted-foreground">
              ({queue.length} {t('title.episodes')})
            </p>
          </div>
        ) : undefined
      }
      renderRow={(video) => (
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <VideoCard
              video={video}
              videos={queue}
              queueType={queueType}
              layout="list"
              isActive={video.youtube_id === currentYoutubeId}
              showActionsMenu={queueType !== 'tvShow'}
            />
          </div>
        </div>
      )}
    />
  );
}
