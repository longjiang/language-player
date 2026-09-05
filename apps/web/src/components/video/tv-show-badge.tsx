'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Tv } from 'lucide-react';
import { PYTHON_API_URL } from '@/lib/api-url';
import { useLanguage } from '@/providers/language-provider';
import { useT } from '@/hooks/use-t';

/**
 * TV-show badge for the watch page's video-meta row.
 *
 * Shows the show's title (fetched once per show id from `/tv-shows/:id`,
 * server-cached by Flask), falling back to a generic localized "TV Show"
 * label while loading or if the fetch fails. Tapping navigates to the
 * show's episode list (`/[l1]/[l2]/tv-shows/[id]`).
 */
export function TVShowBadge({ tvShowId }: { tvShowId: string }) {
  const { l1, l2 } = useLanguage();
  const t = useT();
  const [title, setTitle] = useState<string | null>(null);

  useEffect(() => {
    if (!tvShowId) return;
    let cancelled = false;
    fetch(`${PYTHON_API_URL}/tv-shows/${tvShowId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((show) => {
        if (!cancelled && show?.title) setTitle(String(show.title));
      })
      .catch(() => {
        /* keep generic fallback label */
      });
    return () => {
      cancelled = true;
    };
  }, [tvShowId]);

  return (
    <Link
      href={`/${l1.code}/${l2.code}/tv-shows/${tvShowId}`}
      className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      title={t('title.tv_show')}
    >
      <Tv className="h-3 w-3" />
      {title ?? t('title.tv_show')}
    </Link>
  );
}
