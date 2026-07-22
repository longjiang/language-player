import React from 'react';
import { View, Text, Pressable } from 'react-native';
import type { ProficiencyLevel } from '@langplayer/shared';
import { formatLevel } from '@langplayer/shared';
import { useT } from '@/hooks/use-t';

interface LevelFilterProps {
  level: number | undefined;
  onSelect: (level: number | undefined) => void;
}

const LEVELS = [1, 2, 3, 4, 5, 6, 7];

export function LevelFilter({ level, onSelect }: LevelFilterProps) {
  const t = useT();

  return (
    <View className="flex-row gap-1.5 px-4 py-2">
      <Pressable
        onPress={() => onSelect(undefined)}
        className={`rounded-full px-3 py-1 ${level === undefined ? 'bg-primary' : 'bg-muted'}`}
      >
        <Text className={`text-xs font-bold ${level === undefined ? 'text-primary-foreground' : 'text-muted-foreground'}`}>
          All
        </Text>
      </Pressable>
      {LEVELS.map((l) => {
        const formatted = formatLevel({ scale: 'cefr', value: l } as ProficiencyLevel);
        const active = level === l;
        return (
          <Pressable
            key={l}
            onPress={() => onSelect(active ? undefined : l)}
            className={`rounded-full px-3 py-1 ${active ? 'bg-primary' : 'bg-muted'}`}
          >
            <Text className={`text-xs font-bold ${active ? 'text-primary-foreground' : 'text-muted-foreground'}`}>
              {formatted.short}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
