'use client';

import { useLocale } from 'next-intl';
import { Video } from 'lucide-react';
import { useT } from '@/hooks/use-t';
import { flagEmoji, languageName } from '@/lib/language-data';
import { EXPERIMENTAL_LANGUAGE_CODES, LANGUAGE_VIDEO_COUNTS } from '@/data/language-video-counts';
import { LANGUAGE_FAMILIES, LANGUAGE_FAMILY_KEYS } from '@/data/language-families';

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
      family: LANGUAGE_FAMILIES[code] ?? 'Other',
    }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));

  const families = new Map<string, typeof languages>();
  for (const language of languages) {
    const group = families.get(language.family) ?? [];
    group.push(language);
    families.set(language.family, group);
  }
  const sortedFamilies = [...families.entries()].sort((a, b) =>
    a[0].localeCompare(b[0], locale),
  );

  return (
    <div className="space-y-10">
      {sortedFamilies.map(([family, languages]) => (
        <section key={family}>
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {t(LANGUAGE_FAMILY_KEYS[family] ?? family)}
          </h3>
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
                {EXPERIMENTAL_LANGUAGE_CODES.includes(code) && (
                  <span className="shrink-0 rounded-full border border-warm-500/30 bg-warm-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warm-600 dark:text-warm-400">
                    {t('label.experimental')}
                  </span>
                )}
                <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                  <Video className="h-3.5 w-3.5" aria-hidden="true" />
                  {numberFormat.format(videoCount)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
