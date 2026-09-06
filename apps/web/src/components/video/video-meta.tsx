import { Eye, ThumbsUp, MessageCircle, Calendar } from 'lucide-react';
import type { YouTubeVideo } from '@langplayer/shared';
import { getLevelFromDifficulty, formatNumericLevel, primaryScale, youTubeCategoryLabel } from '@langplayer/shared';
import { levelSubtleClass } from '@/lib/level-colors';
import { displayLanguageName } from '@/lib/language-data';
import { TVShowBadge } from '@/components/video/tv-show-badge';
import { useLanguage } from '@/providers/language-provider';
import { useT } from '@/hooks/use-t';
import { useDifficultyProfile } from '@/hooks/use-difficulty-profile';

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

export function VideoMeta({ video }: VideoMetaProps) {
  const { l1, l2 } = useLanguage();
  const t = useT();
  const profiles = useDifficultyProfile();
  const level = getLevelFromDifficulty(video.difficulty, profiles?.[l2.code]);

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
        {level != null && (
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${levelSubtleClass(level)}`}>
            {formatNumericLevel(level, primaryScale(l2.code)).short}
          </span>
        )}
        {video.locale && (
          <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
            {displayLanguageName(video.locale, l1.code)}
          </span>
        )}
        {video.category && (
          <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
            {youTubeCategoryLabel(Number(video.category), t, (id) => t('label.category_n', { n: id }))}
          </span>
        )}
        {video.tv_show && <TVShowBadge tvShowId={video.tv_show} />}
      </div>
    </div>
  );
}
