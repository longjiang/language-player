'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, ThumbsUp, MessageCircle, Calendar, Tag as TagIcon, MoreHorizontal, ChevronUp } from 'lucide-react';
import type { YouTubeVideo } from '@langplayer/shared';
import {
  getLevelFromDifficulty,
  formatNumericLevel,
  primaryScale,
  youTubeCategoryLabel,
  parseVideoTags,
  formatTagSearchQuery,
} from '@langplayer/shared';
import { levelSubtleClass } from '@/lib/level-colors';
import { displayLanguageName } from '@/lib/language-data';
import { TVShowBadge } from '@/components/video/tv-show-badge';
import { useLanguage } from '@/providers/language-provider';
import { useT } from '@/hooks/use-t';
import { useDifficultyProfile } from '@/hooks/use-difficulty-profile';

interface VideoMetaProps {
  video: YouTubeVideo;
}

/** Tags shown before the row collapses behind the "…" button. */
const MAX_VISIBLE_TAGS = 3;

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
  const router = useRouter();
  const profiles = useDifficultyProfile();
  const level = getLevelFromDifficulty(video.difficulty, profiles?.[l2.code]);
  const [tagsExpanded, setTagsExpanded] = useState(false);

  const tags = parseVideoTags(video.tags);
  const visibleTags = tagsExpanded ? tags : tags.slice(0, MAX_VISIBLE_TAGS);

  // A tag pill opens the search page with a tag query (`?q=%23news`), which
  // the search page auto-runs as a tag search.
  const openTagSearch = (tag: string) => {
    router.push(
      `/${l1.code}/${l2.code}/search?q=${encodeURIComponent(formatTagSearchQuery(tag))}`,
    );
  };

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
        {visibleTags.map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => openTagSearch(tag)}
            aria-label={`${t('title.tags')}: ${tag}`}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-foreground"
          >
            <TagIcon className="h-3 w-3" />
            {tag}
          </button>
        ))}
        {tags.length > MAX_VISIBLE_TAGS && (
          <button
            type="button"
            onClick={() => setTagsExpanded((expanded) => !expanded)}
            aria-label={tagsExpanded ? t('action.show_less') : t('action.show_more')}
            aria-expanded={tagsExpanded}
            className="inline-flex items-center rounded-full border border-border bg-muted/50 px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-foreground"
          >
            {tagsExpanded ? <ChevronUp className="h-3 w-3" /> : <MoreHorizontal className="h-3 w-3" />}
          </button>
        )}
        {video.tv_show && <TVShowBadge tvShowId={video.tv_show} />}
      </div>
    </div>
  );
}
