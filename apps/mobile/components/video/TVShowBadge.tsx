import React, { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Tv } from 'lucide-react-native';
import { router } from 'expo-router';
import { useT } from '@/hooks/use-t';
import { ICON_MUTED } from '@/lib/theme-colors';
import { PYTHON_API_URL } from '@/lib/api-url';

/**
 * TV-show badge for the watch page's video-meta row.
 *
 * Shows the show's title (fetched once per show id from `/tv-shows/:id`),
 * falling back to a generic localized "TV Show" label while loading or if
 * the fetch fails. Tapping navigates to the show's episode list
 * (`/(tabs)/(media)/tv-shows/[id]`).
 */
export function TVShowBadge({ tvShowId }: { tvShowId: string }) {
  const t = useT();
  const [title, setTitle] = useState<string | null>(null);

  useEffect(() => {
    if (!tvShowId) return;
    let cancelled = false;
    fetch(`${PYTHON_API_URL}/tv-shows/${tvShowId}`, { signal: AbortSignal.timeout(10000) })
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
    <Pressable
      onPress={() => router.push(`/(tabs)/(media)/tv-shows/${tvShowId}` as any)}
      className="flex-row items-center gap-1 rounded-full bg-muted px-3 py-1 active:bg-accent"
      accessibilityRole="button"
      accessibilityLabel={t('title.tv_show')}
    >
      <Tv size={12} color={ICON_MUTED} />
      <Text className="text-xs text-muted-foreground" numberOfLines={1}>
        {title ?? t('title.tv_show')}
      </Text>
    </Pressable>
  );
}
