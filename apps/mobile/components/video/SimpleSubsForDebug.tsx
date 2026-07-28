import React, { useRef, useEffect, useMemo } from 'react';
import { View, Text, FlatList, Pressable } from 'react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSubtitleTranslation } from '@/hooks/use-subtitle-translation';
import type { SubtitleLine } from '@langplayer/shared';

interface SyncedLine {
  starttime: number;
  l2Line: string;
  l1Line: string;
}

interface SimpleSubsForDebugProps {
  lines: SyncedLine[];
  activeLineIndex: number;
  onSeekToLine?: (time: number) => void;
}

export function SimpleSubsForDebug({ lines, activeLineIndex, onSeekToLine }: SimpleSubsForDebugProps) {
  const { l1Lang, l2Lang } = useLanguage();
  const flatListRef = useRef<FlatList>(null);

  // Convert SyncedLine[] → SubtitleLine[] for the translation hook
  const subtitleLines: SubtitleLine[] = useMemo(
    () => lines.map((l) => ({ line: l.l2Line, starttime: l.starttime })),
    [lines],
  );

  const { translatedLines, loading, progress } = useSubtitleTranslation(subtitleLines, l1Lang.code, l2Lang.code, true);

  // Merge translations into SyncedLine shape
  const displayLines = useMemo(
    () => lines.map((l, i) => ({
      ...l,
      l1Line: translatedLines[i]?.line ?? '',
    })),
    [lines, translatedLines],
  );

  useEffect(() => {
    console.log(`[SimpleSubsForDebug] activeLineIndex: ${activeLineIndex}`);
    if (activeLineIndex >= 0) {
      flatListRef.current?.scrollToIndex({ index: activeLineIndex, animated: true, viewPosition: 0.5 });
    }
  }, [activeLineIndex]);

  return (
    <View className="flex-1 bg-background">
      {loading ? (
        <Text className="px-4 py-1 text-xs text-muted-foreground">
          Translating... {progress} / {lines.length}
        </Text>
      ) : null}
      <FlatList
        ref={flatListRef}
        data={displayLines}
        keyExtractor={(_, i) => String(i)}
        onScrollToIndexFailed={(info) => {
          flatListRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: true });
        }}
        renderItem={({ item, index }) => (
          <Pressable
            onPress={() => onSeekToLine?.(item.starttime)}
            className={`px-4 py-2 ${
              index === activeLineIndex
                ? 'mx-2 rounded-xl border-2 border-primary'
                : 'mx-2 rounded-xl border border-border'
            }`}
          >
            <Text className="text-xs tabular-nums text-muted-foreground">{item.starttime}s</Text>
            <Text className="text-sm text-foreground">{item.l2Line}</Text>
            {item.l1Line ? (
              <Text className="mt-0.5 text-sm text-muted-foreground">{item.l1Line}</Text>
            ) : null}
          </Pressable>
        )}
      />
    </View>
  );
}
