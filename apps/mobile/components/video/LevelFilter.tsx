import React, { useMemo } from 'react';
import { View, Text, Pressable } from 'react-native';
import { formatNumericLevel, primaryScale } from '@langplayer/shared';
import { useT } from '@/hooks/use-t';

interface LevelFilterProps {
  level: number | undefined;
  onSelect: (level: number | undefined) => void;
  /** ISO 639-1 language code for language-specific level labels (HSK, JLPT, etc.) */
  l2Code: string;
}

const LEVELS = [1, 2, 3, 4, 5, 6, 7];

export function LevelFilter({ level, onSelect, l2Code }: LevelFilterProps) {
  const t = useT();
  const scale = primaryScale(l2Code);

  const labels = useMemo(
    () => LEVELS.map((l) => formatNumericLevel(l, scale).short),
    [scale],
  );

  return (
    <View className="flex-row gap-1.5 px-4 py-2">
      <Pressable
        onPress={() => onSelect(undefined)}
        className={`rounded-full px-3 py-1 ${level === undefined ? 'bg-primary' : 'bg-muted'}`}
      >
        <Text className={`text-xs font-bold ${level === undefined ? 'text-primary-foreground' : 'text-muted-foreground'}`}>
          {t('filter.all')}
        </Text>
      </Pressable>
      {LEVELS.map((l, i) => {
        const active = level === l;
        return (
          <Pressable
            key={l}
            onPress={() => onSelect(active ? undefined : l)}
            className={`rounded-full px-3 py-1 ${active ? 'bg-primary' : 'bg-muted'}`}
          >
            <Text className={`text-xs font-bold ${active ? 'text-primary-foreground' : 'text-muted-foreground'}`}>
              {labels[i]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
