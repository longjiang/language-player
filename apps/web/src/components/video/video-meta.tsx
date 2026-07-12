import { Eye, ThumbsUp, MessageCircle, Calendar } from 'lucide-react';
import type { YouTubeVideo } from '@langplayer/shared';

interface VideoMetaProps {
  video: YouTubeVideo;
}

function formatNumber(n: number | undefined): string {
  if (!n) return '';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatDate(date: Date | string | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

const LEVEL_COLORS: Record<number, string> = {
  1: 'bg-emerald-500/10 text-emerald-400',
  2: 'bg-teal-500/10 text-teal-400',
  3: 'bg-blue-500/10 text-blue-400',
  4: 'bg-violet-500/10 text-violet-400',
  5: 'bg-orange-500/10 text-orange-400',
  6: 'bg-red-500/10 text-red-400',
  7: 'bg-rose-500/10 text-rose-400',
};

const LEVEL_LABELS: Record<number, string> = {
  1: 'CEFR A1',
  2: 'CEFR A2',
  3: 'CEFR B1',
  4: 'CEFR B2',
  5: 'CEFR C1',
  6: 'CEFR C2',
  7: 'Native',
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

export function VideoMeta({ video }: VideoMetaProps) {
  const level = getLevel(video.difficulty);

  return (
    <div>
      <h1 className="text-xl font-bold leading-tight sm:text-2xl">
        {video.title ?? 'Untitled Video'}
      </h1>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        {video.views != null && (
          <span className="flex items-center gap-1">
            <Eye className="h-4 w-4" />
            {formatNumber(video.views)} views
          </span>
        )}
        {video.likes != null && (
          <span className="flex items-center gap-1">
            <ThumbsUp className="h-4 w-4" />
            {formatNumber(video.likes)}
          </span>
        )}
        {video.comments != null && (
          <span className="flex items-center gap-1">
            <MessageCircle className="h-4 w-4" />
            {formatNumber(video.comments)}
          </span>
        )}
        {video.date && (
          <span className="flex items-center gap-1">
            <Calendar className="h-4 w-4" />
            {formatDate(video.date)}
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${LEVEL_COLORS[level] ?? ''}`}>
          {LEVEL_LABELS[level] ?? 'Unknown'}
        </span>
        {video.locale && (
          <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
            {video.locale}
          </span>
        )}
        {video.category && (
          <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
            {video.category}
          </span>
        )}
      </div>
    </div>
  );
}
