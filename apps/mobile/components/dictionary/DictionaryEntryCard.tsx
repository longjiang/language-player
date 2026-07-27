import React from 'react';
import { View, Text, Pressable } from 'react-native';
import type { DictionaryEntry } from '@langplayer/shared';
import { formatLevel } from '@langplayer/shared';
import { useT } from '@/hooks/use-t';
import { useScriptPreference } from '@/hooks/use-script-preference';
import { PitchAccent } from '@/components/PitchAccent';

interface DictionaryEntryCardProps {
  entry: DictionaryEntry;
  variant?: 'compact' | 'full';
  onPress?: (entry: DictionaryEntry) => void;
  /** ISO 639-1 code of the target language (for script preference + pitch accent). */
  l2Code?: string;
}

export function DictionaryEntryCard({ entry, variant = 'compact', onPress, l2Code = '' }: DictionaryEntryCardProps) {
  const t = useT();
  const { apply, getAlternateScript } = useScriptPreference(l2Code);
  const { head, alternate } = apply(entry.head, entry.alternate);
  // Pass the post-swap values so getAlternateScript uses the correct
  // head↔alternate pairing (e.g., traditional head → simplified alternate).
  const displayAlternate = getAlternateScript({ ...entry, head, alternate });

  const levelTexts = (entry.levels ?? []).map((l) => formatLevel({ scale: l.scale, value: l.value }).short);
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
    <View className="rounded-xl border border-border bg-card p-4">
      {/* Head word + alternate script + pronunciation */}
      <View className="flex-row items-baseline gap-2 flex-wrap">
        <Text className={`font-bold text-foreground ${isFull ? 'text-3xl' : 'text-lg'}`}>
          {head}
        </Text>
        {displayAlternate && displayAlternate !== head && (
          <Text className="text-xs text-muted-foreground" lang={l2Code}>
            {displayAlternate}
          </Text>
        )}
        {entry.pronunciation ? (
          <Text className="text-sm text-muted-foreground">{entry.pronunciation}</Text>
        ) : null}
      </View>

      {/* Pitch accent (Japanese) */}
      {hasPitchAccent && (
        <View className="mt-1">
          <PitchAccent
            kana={entry.phonetic_detail!.kana!}
            patterns={entry.phonetic_detail!.pitch_accent!}
          />
        </View>
      )}

      {/* Level badges */}
      {levelTexts.length > 0 && (
        <View className="mt-1.5 flex-row flex-wrap gap-1">
          {levelTexts.map((lt, i) => (
            <View key={i} className="rounded bg-primary/10 px-1.5 py-0.5">
              <Text className="text-xs font-bold text-primary">{lt}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Definitions */}
      {definitions.length > 0 && (
        <View className="mt-2">
          {definitions.map((def, i) => (
            <Text key={i} className="text-sm text-muted-foreground" numberOfLines={isFull ? undefined : 2}>
              {isFull ? `${i + 1}. ${def}` : def}
            </Text>
          ))}
        </View>
      )}

      {/* Part of speech */}
      {entry.part_of_speech && (
        <Text className="mt-1 text-xs italic text-muted-foreground">{entry.part_of_speech}</Text>
      )}

      {/* "See details" link (compact only) */}
      {variant === 'compact' && (entry.definitions?.length ?? 0) > 2 && (
        <Text className="mt-1 text-xs text-primary">{t('action.more')}</Text>
      )}
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
