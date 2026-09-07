import React, { useMemo } from 'react';
import { Text, ScrollView } from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import { formatNumericLevel, primaryScale } from '@langplayer/shared';
import { useT } from '@/hooks/use-t';
import { e2e } from '@/lib/e2e';
import { levelBadgeStyle } from '@/lib/level-colors';

interface LevelFilterProps {
  level: number | undefined;
  onSelect: (level: number | undefined) => void;
  /** When the Kids pill is active, level is cleared (kids shows all levels).
   *  Kids and level pills are mutually exclusive. */
  kidsSelected?: boolean;
  onKidsChange?: (kids: boolean) => void;
  /** ISO 639-1 language code for language-specific level labels (HSK, JLPT, etc.) */
  l2Code: string;
}

const LEVELS = [1, 2, 3, 4, 5, 6, 7];

export function LevelFilter({ level, onSelect, l2Code, kidsSelected = false, onKidsChange }: LevelFilterProps) {
  const t = useT();
  const scale = primaryScale(l2Code);

  const labels = useMemo(
    () => LEVELS.map((l) => formatNumericLevel(l, scale).short),
    [scale],
  );

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className="h-12 flex-grow-0"
      contentContainerStyle={{ paddingHorizontal: 16, gap: 6, alignItems: 'center' }}
    >
      <Pressable
        onPress={() => { onKidsChange?.(false); onSelect(undefined); }}
        className={`rounded-full px-3 py-1 ${!kidsSelected && level === undefined ? 'bg-primary' : 'bg-muted'}`}
        {...e2e('level-filter-all')}
      >
        <Text className={`text-sm font-bold ${!kidsSelected && level === undefined ? 'text-primary-foreground' : 'text-muted-foreground'}`}>
          {t('filter.all')}
        </Text>
      </Pressable>
      {LEVELS.map((l, i) => {
        const active = !kidsSelected && level === l;
        return (
          <Pressable
            key={l}
            onPress={() => { onKidsChange?.(false); onSelect(active ? undefined : l); }}
            className={`rounded-full px-3 py-1 ${active ? '' : 'bg-muted'}`}
            style={active ? levelBadgeStyle(l) : undefined}
            {...e2e(`level-filter-${l}`)}
          >
            <Text className={`text-sm font-bold ${active ? 'text-white' : 'text-muted-foreground'}`}>
              {labels[i]}
            </Text>
          </Pressable>
        );
      })}
      {onKidsChange && (
        <Pressable
          onPress={() => { onKidsChange(true); onSelect(undefined); }}
          className={`rounded-full px-3 py-1 ${kidsSelected ? '' : 'bg-muted'}`}
          style={kidsSelected ? levelBadgeStyle(1) : undefined}
          {...e2e('level-filter-kids')}
        >
          <Text className={`text-sm font-bold ${kidsSelected ? 'text-white' : 'text-muted-foreground'}`}>
            {t('filter.kids')}
          </Text>
        </Pressable>
      )}
    </ScrollView>
  );
}
