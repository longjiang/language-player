import React, { useMemo } from 'react';
import { Text } from 'react-native';
import { splitIntoMoras, applyPitchAccent } from '@langplayer/utils';

interface PitchAccentProps {
  /** The word in kana (hiragana/katakana). */
  kana: string;
  /** Pitch accent pattern(s). e.g., [0], [3], or [0, 3] for multiple readings. */
  patterns: number[];
  /** Optional className for the Text element. */
  className?: string;
}

/**
 * Renders a kana string with pitch accent arrows (↑↓) matching Classic's display.
 *
 * Uses the same arrow convention as Classic and the web:
 *   ↑ = pitch rises here (low → high)
 *   ↓ = pitch drops here (high → low)
 *
 * Multiple patterns are joined with ' / ' (e.g., は↑し / は↓し).
 *
 * Ported from web's PitchAccent component.
 * Requires `@langplayer/utils` which exports splitIntoMoras and applyPitchAccent.
 */
export function PitchAccent({ kana, patterns, className }: PitchAccentProps) {
  const display = useMemo(() => {
    if (!patterns.length || !kana) return '';
    const moras = splitIntoMoras(kana);
    return patterns
      .map((p) => applyPitchAccent(moras, p))
      .join(' / ');
  }, [kana, patterns]);

  if (!display) return null;

  return (
    <Text className={className ?? 'text-xs text-muted-foreground'} lang="ja">
      {display}
    </Text>
  );
}
