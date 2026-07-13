'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { Play, Eye, Clock } from 'lucide-react';
import type { YouTubeVideo } from '@langplayer/shared';
import { youtubeThumbnail } from '@/lib/video-service';
import { useLanguage } from '@/providers/language-provider';
import { useVideoPlayer } from '@/providers/video-player-provider';
import type { QueueType } from '@/lib/queue-manager';

interface VideoCardProps {
  video: YouTubeVideo;
  /** When provided, clicking uses the player queue instead of plain navigation */
  videos?: YouTubeVideo[];
  queueType?: QueueType;
  /** Layout variant: 'card' (default, full thumbnail card) or 'list' (compact row) */
  layout?: 'card' | 'list';
  /** Highlight as current/active video in list */
  isActive?: boolean;
}

function formatDuration(seconds: number | undefined): string {
  if (!seconds) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatViews(views: number | undefined): string {
  if (!views) return '';
  if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1)}M`;
  if (views >= 1_000) return `${(views / 1_000).toFixed(1)}K`;
  return String(views);
}

const LEVEL_COLORS: Record<number, string> = {
  1: 'bg-emerald-500',
  2: 'bg-teal-500',
  3: 'bg-blue-500',
  4: 'bg-violet-500',
  5: 'bg-orange-500',
  6: 'bg-red-500',
  7: 'bg-rose-600',
};

const LEVEL_LABELS: Record<number, string> = {
  1: 'A1',
  2: 'A2',
  3: 'B1',
  4: 'B2',
  5: 'C1',
  6: 'C2',
  7: 'N',
};

function getLevel(difficulty: number | undefined): number {
  if (!difficulty) return 1;
  if (difficulty <= 0.003) return 1;
  if (difficulty <= 0.006) return 2;
  if (difficulty <= 0.01) return 3;
  if (difficulty <= 0.02) return 4;
  if (difficulty <= 0.04) return 5;
  if (difficulty <= 0.1) return 6;
  return 7;
}

export function VideoCard({ video, videos, queueType, layout = 'card', isActive }: VideoCardProps) {
  const { l1, l2 } = useLanguage();
  const { playVideo } = useVideoPlayer();
  const level = getLevel(video.difficulty);
  const duration = formatDuration(video.duration);
  const views = formatViews(video.views);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (videos && videos.length > 0) {
        e.preventDefault();
        playVideo(video, videos, queueType ?? 'recommended');
      }
    },
    [video, videos, queueType, playVideo],
  );

  const href = `/${l1.code}/${l2.code}/watch/${video.youtube_id}`;

  const content = layout === 'list' ? (
    <div
      className={`flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${
        isActive
          ? 'border-primary/50 bg-primary/5'
          : 'border-transparent hover:border-border hover:bg-muted/50'
      }`}
    >
      <div className="relative h-12 w-20 shrink-0 overflow-hidden rounded bg-muted">
        <img
          src={youtubeThumbnail(video.youtube_id)}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
        />
        <span
          className={`absolute left-1 top-1 rounded px-1 py-0 text-[10px] font-bold text-white ${LEVEL_COLORS[level] ?? 'bg-gray-500'}`}
        >
          {LEVEL_LABELS[level]}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className={`truncate text-xs font-medium ${isActive ? 'text-primary' : ''}`}>
          {video.title ?? 'Untitled'}
        </p>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
          {duration && <span>{duration}</span>}
          {views && <span>{views}</span>}
        </div>
      </div>
    </div>
  ) : (
    <div className="group relative overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-primary/30 hover:shadow-lg">
      {/* Thumbnail */}
      <div className="relative aspect-video overflow-hidden bg-muted">
        <img
          src={youtubeThumbnail(video.youtube_id)}
          alt={video.title ?? 'Video thumbnail'}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
        />
        {/* Play overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/20">
          <Play className="h-12 w-12 text-white opacity-0 transition-opacity group-hover:opacity-100" fill="white" />
        </div>
        {/* Duration badge */}
        {duration && (
          <span className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-xs font-medium text-white">
            {duration}
          </span>
        )}
        {/* Level badge */}
        <span
          className={`absolute left-2 top-2 rounded px-1.5 py-0.5 text-xs font-bold text-white ${LEVEL_COLORS[level] ?? 'bg-gray-500'}`}
        >
          {LEVEL_LABELS[level] ?? '?'}
        </span>
      </div>

      {/* Info */}
      <div className="p-3">
        <h3 className="line-clamp-2 text-sm font-medium leading-snug group-hover:text-primary">
          {video.title ?? 'Untitled'}
        </h3>
        <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
          {views && (
            <span className="flex items-center gap-1">
              <Eye className="h-3 w-3" />
              {views}
            </span>
          )}
          {duration && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {duration}
            </span>
          )}
        </div>
      </div>
    </div>
  );

  if (videos && videos.length > 0) {
    return (
      <a href={href} onClick={handleClick}>
        {content}
      </a>
    );
  }

  return <Link href={href}>{content}</Link>;
}
