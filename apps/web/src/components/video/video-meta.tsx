import { Eye, ThumbsUp, MessageCircle, Calendar } from 'lucide-react';
import type { YouTubeVideo } from '@langplayer/shared';
import { useLanguage } from '@/providers/language-provider';
import { useT } from '@/hooks/use-t';

interface VideoMetaProps {
  video: YouTubeVideo;
}

function formatNumber(n: number | undefined, locale: string): string {
  if (!n) return '';
  return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

function formatDate(date: Date | string | undefined, locale: string): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
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

const CEFR_LABEL_KEYS: Record<number, string> = {
  1: 'filter.cefr_a1',
  2: 'filter.cefr_a2',
  3: 'filter.cefr_b1',
  4: 'filter.cefr_b2',
  5: 'filter.cefr_c1',
  6: 'filter.cefr_c2',
  7: 'label.native_level',
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
  const { l1 } = useLanguage();
  const t = useT();
  const level = getLevel(video.difficulty);

  return (
    <div>
      <h1 className="text-xl font-bold leading-tight sm:text-2xl">
        {video.title ?? t('label.untitled_video_full')}
      </h1>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        {video.views != null && (
          <span className="flex items-center gap-1">
            <Eye className="h-4 w-4" />
            {t('label.views_count', { count: formatNumber(video.views, l1.code) })}
          </span>
        )}
        {video.likes != null && (
          <span className="flex items-center gap-1">
            <ThumbsUp className="h-4 w-4" />
            {formatNumber(video.likes, l1.code)}
          </span>
        )}
        {video.comments != null && (
          <span className="flex items-center gap-1">
            <MessageCircle className="h-4 w-4" />
            {formatNumber(video.comments, l1.code)}
          </span>
        )}
        {video.date && (
          <span className="flex items-center gap-1">
            <Calendar className="h-4 w-4" />
            {formatDate(video.date, l1.code)}
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${LEVEL_COLORS[level] ?? ''}`}>
          {t(CEFR_LABEL_KEYS[level] ?? 'label.unknown')}
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
