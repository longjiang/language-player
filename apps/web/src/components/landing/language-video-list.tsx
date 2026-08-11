'use client';

import { useLocale } from 'next-intl';
import { useT } from '@/hooks/use-t';
import { flagEmoji, languageName } from '@/lib/language-data';
import { LANGUAGE_VIDEO_COUNTS } from '@/data/language-video-counts';

/** Alphabetical list of languages with flags + measured video counts (ARCH-025). */
export function LanguageVideoList() {
  const locale = useLocale();
  const t = useT();
  const numberFormat = new Intl.NumberFormat(locale);

  const languages = Object.entries(LANGUAGE_VIDEO_COUNTS)
    .map(([code, videoCount]) => ({
      code,
      videoCount,
      name: languageName(code, locale),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));

  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {languages.map(({ code, videoCount, name }) => (
        <li
          key={code}
          className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 transition-shadow hover:shadow-md dark:bg-surface-dark-secondary"
        >
          <span className="text-xl leading-none" aria-hidden="true">
            {flagEmoji(code)}
          </span>
          <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {t('msg.playlist_video_count', { count: numberFormat.format(videoCount) })}
          </span>
        </li>
      ))}
    </ul>
  );
}
