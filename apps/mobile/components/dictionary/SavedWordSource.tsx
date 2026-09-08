import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import { Video, BookOpen, Play } from 'lucide-react-native';
import { ICON_MUTED } from '@/lib/theme-colors';
import { useT } from '@/hooks/use-t';
import { buildPlaybackVideoFromContext } from '@langplayer/shared';
import type { SavedWordContext } from '@langplayer/shared';
import { SubsSearchPlaybackModal } from '@/components/video/SubsSearchPlaybackModal';

interface SavedWordSourceProps {
  /** Context object describing where the word was saved from. */
  context?: SavedWordContext | null;
  /** Unix-ms timestamp when the word was saved. */
  date: number;
  /** BCP 47 locale for the date string (e.g. "zh-Hans" → localized). */
  locale?: string;
}

/**
 * Source attribution line for a saved word:
 *   🎬 Show Title · Jul 18
 *   📖 Book Title · Jul 18
 *   Jul 18                       (fallback — no context)
 *
 * When the context is from a YouTube video, the source line is tappable and
 * reopens the shared subs-search playback modal cued/paused at the saved
 * timestamp (SPEC-066 context playback). The tokenized context sentence itself
 * stays fully interactive (per-word dictionary lookups) — only this line
 * handles the play action.
 */
export function SavedWordSource({ context, date, locale = 'en' }: SavedWordSourceProps) {
  const t = useT();
  const [playing, setPlaying] = useState(false);
  // Build the replayable video only when the context is from a YouTube video.
  const playbackVideo = context ? buildPlaybackVideoFromContext(context) : null;

  const dateStr = date ? new Date(date).toLocaleDateString(locale) : '';

  // No context at all (legacy/corrupt record)
  if (!context) {
    return <Text className="text-xs text-muted-foreground/70">{dateStr}</Text>;
  }

  const hasVideoContext = !!(context.youtube_id && context.videoTitle);
  const hasTextContext = !!context.textTitle;

  if (!hasVideoContext && !hasTextContext) {
    if (playbackVideo) {
      // A video context with a youtube_id but no stored title — still replayable.
      return (
        <>
          <Pressable
            onPress={() => setPlaying(true)}
            accessibilityRole="button"
            accessibilityLabel={t('action.watch')}
            className="mt-1 flex-row items-center gap-1 active:opacity-70"
          >
            <Video size={12} color={ICON_MUTED} />
            <Text className="text-xs text-muted-foreground/70">{dateStr}</Text>
            <Play size={12} color={ICON_MUTED} />
          </Pressable>
          <SubsSearchPlaybackModal
            videos={[playbackVideo]}
            index={playing ? 0 : null}
            onIndexChange={(i) => setPlaying(i !== null)}
            highlightTerms={context.form ? [context.form] : []}
            autoplay={false}
          />
        </>
      );
    }
    return <Text className="text-xs text-muted-foreground/70">{dateStr}</Text>;
  }

  // ── Video context ──
  if (hasVideoContext && playbackVideo) {
    return (
      <>
        <Pressable
          onPress={() => setPlaying(true)}
          accessibilityRole="button"
          accessibilityLabel={t('action.watch')}
          className="mt-1 flex-row items-center gap-1 active:opacity-70"
        >
          <Video size={12} color={ICON_MUTED} />
          <Text className="flex-1 text-xs text-muted-foreground/70" numberOfLines={1}>
            {context.videoTitle}
          </Text>
          <Play size={12} color={ICON_MUTED} />
          <Text className="text-xs text-muted-foreground/70">· {dateStr}</Text>
        </Pressable>
        <SubsSearchPlaybackModal
          videos={[playbackVideo]}
          index={playing ? 0 : null}
          onIndexChange={(i) => setPlaying(i !== null)}
          highlightTerms={context.form ? [context.form] : []}
          autoplay={false}
        />
      </>
    );
  }

  // Text context (book/reader) — not replayable.
  return (
    <View className="mt-1 flex-row items-center gap-1">
      <BookOpen size={12} color={ICON_MUTED} />
      <Text className="flex-1 text-xs text-muted-foreground/70" numberOfLines={1}>
        {context.textTitle}
      </Text>
      <Text className="text-xs text-muted-foreground/70">· {dateStr}</Text>
    </View>
  );
}
