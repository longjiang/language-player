import React from 'react';
import { View, Text } from 'react-native';
import { Video, BookOpen } from 'lucide-react-native';
import { ICON_MUTED } from '@/lib/theme-colors';
import type { SavedWordContext } from '@langplayer/shared';

interface SavedWordSourceProps {
  /** Context object describing where the word was saved from. */
  context?: SavedWordContext | null;
  /** Unix-ms timestamp when the word was saved. */
  date: number;
}

/**
 * Source attribution line for a saved word:
 *   🎬 Show Title · Jul 18
 *   📖 Book Title · Jul 18
 *   Jul 18                       (fallback — no context)
 */
export function SavedWordSource({ context, date }: SavedWordSourceProps) {
  const dateStr = date ? new Date(date).toLocaleDateString() : '';

  // No context at all (legacy/corrupt record)
  if (!context) {
    return <Text className="text-xs text-muted-foreground/70">{dateStr}</Text>;
  }

  const hasVideoContext = !!(context.youtube_id && context.videoTitle);
  const hasTextContext = !!context.textTitle;

  if (!hasVideoContext && !hasTextContext) {
    return <Text className="text-xs text-muted-foreground/70">{dateStr}</Text>;
  }

  return (
    <View className="mt-1 flex-row items-center gap-1">
      {hasVideoContext ? (
        <>
          <Video size={12} color={ICON_MUTED} />
          <Text className="flex-1 text-xs text-muted-foreground/70" numberOfLines={1}>
            {context.videoTitle}
          </Text>
        </>
      ) : (
        <>
          <BookOpen size={12} color={ICON_MUTED} />
          <Text className="flex-1 text-xs text-muted-foreground/70" numberOfLines={1}>
            {context.textTitle}
          </Text>
        </>
      )}
      <Text className="text-xs text-muted-foreground/70">· {dateStr}</Text>
    </View>
  );
}
