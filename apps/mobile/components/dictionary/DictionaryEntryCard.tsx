import React from 'react';
import { View, Text, Pressable } from 'react-native';
import type { DictionaryEntry } from '@langplayer/shared';
import { formatLevel } from '@langplayer/shared';
import { formatPronunciation } from '@langplayer/utils';
import { useT } from '@/hooks/use-t';
import { useScriptPreference } from '@/hooks/use-script-preference';
import { PitchAccent } from '@/components/PitchAccent';

interface DictionaryEntryCardProps {
  entry: DictionaryEntry;
  variant?: 'compact' | 'full';
  onPress?: (entry: DictionaryEntry) => void;
  /** ISO 639-1 code of the target language (for script preference + pitch accent). */
  l2Code?: string;
  /** Optional save button to render at the top-right of the card. */
  saveButton?: React.ReactNode;
}

export function DictionaryEntryCard({ entry, variant = 'compact', onPress, l2Code = '', saveButton }: DictionaryEntryCardProps) {
  const t = useT();
  const { apply, getAlternateScript } = useScriptPreference(l2Code);
  const { head, alternate } = apply(entry.head, entry.alternate);
  // Pass the post-swap values so getAlternateScript uses the correct
  // head↔alternate pairing (e.g., traditional head → simplified alternate).
  const displayAlternate = getAlternateScript({ ...entry, head, alternate });

  const formattedLevels = (entry.levels ?? []).map((l) => formatLevel({ scale: l.scale, value: l.value }));
  const definitions = entry.definitions?.slice(0, variant === 'compact' ? 2 : undefined) ?? [];
  const isFull = variant === 'full';

  // Pitch accent for Japanese: show next to pronunciation when data is available
  const hasPitchAccent = l2Code === 'ja'
    && entry.phonetic_detail?.kana
    && entry.phonetic_detail?.pitch_accent
    && entry.phonetic_detail.pitch_accent.length > 0;

  // NOTE: Do NOT use web-only pseudo-classes like `active:bg-muted` in React Native.
  // NativeWind in RN does not support `active:` — it silently blocks Pressable touch
  // propagation, causing taps to never reach the `onPress` handler. Use Pressable's
  // `style` callback with `pressed` state for press feedback instead (see below).

  const content = (
    <View className="rounded-xl border border-border bg-card px-4 pt-4 pb-2">
      {/* Head word + alternate script + pronunciation */}
      <View className="flex-row items-start">
        <View className="flex-1 flex-row items-baseline gap-2 flex-wrap">
          <Text className={`font-bold text-foreground ${isFull ? 'text-3xl' : 'text-lg'}`}>
            {head}
          </Text>
          {displayAlternate && displayAlternate !== head && (
            <Text className="text-xs text-muted-foreground" lang={l2Code}>
              {displayAlternate}
            </Text>
          )}
          {formatPronunciation(entry, l2Code) ? (
            <Text className="text-sm text-muted-foreground">{formatPronunciation(entry, l2Code)}</Text>
          ) : null}
        </View>
        {formattedLevels.length > 0 && (
          <View className="-mt-1 -mr-1 flex-row flex-wrap gap-1">
            {formattedLevels.map((level, i) => (
              <View key={i} className="rounded px-1.5 py-0.5" style={{ backgroundColor: level.hexColor + '1A' }}>
                <Text className="text-xs font-bold" style={{ color: level.hexColor }}>{level.short}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Part of speech + numbered definitions (e.g. "*adj.* **1** surrealistic **2** bizarre; fantastic") */}
      {(entry.part_of_speech || definitions.length > 0) && (
        <Text className="mt-2 text-sm leading-snug text-muted-foreground" numberOfLines={isFull ? undefined : 4}>
          {entry.part_of_speech && (
            <Text className="italic">{entry.part_of_speech}{'  '}</Text>
          )}
          {definitions.map((def, i) => (
            <Text key={i}>
              <Text className="font-bold">{i + 1}</Text>
              {' '}{def}{i < definitions.length - 1 ? '  ' : ''}
            </Text>
          ))}
        </Text>
      )}

      {/* Dictionary source (e.g. "EDICT 2019", "HSK CEDICT", "AI-Generated") */}
      {(() => {
        const sourceName = entry.dictionary?.name ?? entry.source;
        const displaySource = sourceName === 'AI-Generated' || sourceName === 'LLM'
          ? t('label.ai_generated')
          : entry.dictionary?.version
            ? `${sourceName} ${entry.dictionary.version}`
            : sourceName;
        if (!displaySource && !saveButton) return null;
        return (
          <View className="mt-2 flex-row items-center justify-between">
            {displaySource ? (
              <Text className="text-[10px] text-muted-foreground/50 flex-1">
                {displaySource}
              </Text>
            ) : <View className="flex-1" />}
            {saveButton && (
              <View className="-mr-1">
                {saveButton}
              </View>
            )}
          </View>
        );
      })()}


    </View>
  );

  // DEBUG: Logging helps trace the full tap → word detail chain:
  //   card onPressIn → card onPress → handleEntryPress → router.push → WordDetailScreen
  // onPressIn fires on touch-down (before onPress), confirming the Pressable receives touches.
  // style callback provides press feedback via opacity since NativeWind's active: pseudo-class is unsupported.
  if (onPress) {
    return (
      <Pressable
        onPress={() => { console.log('[Dict] card onPress fired — id:', entry.id, 'head:', entry.head); onPress(entry); }}
        onPressIn={() => console.log('[Dict] card onPressIn — id:', entry.id)}
        style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
      >
        {content}
      </Pressable>
    );
  }

  return content;
}
