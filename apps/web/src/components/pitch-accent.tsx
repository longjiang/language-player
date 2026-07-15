'use client';

import { useMemo } from 'react';
import { splitIntoMoras, applyPitchAccent } from '@langplayer/utils';

interface PitchAccentProps {
  /** The word in kana (hiragana/katakana). */
  kana: string;
  /** Pitch accent pattern(s). e.g., [0], [3], or [0, 3] for multiple readings. */
  patterns: number[];
  /** CSS class for the container span. */
  className?: string;
}

/**
 * Renders a kana string with pitch accent arrows (↑↓) matching Classic's display.
 *
 * Uses the same arrow convention as Classic:
 *   ↑ = pitch rises here (low → high)
 *   ↓ = pitch drops here (high → low)
 *
 * Multiple patterns are joined with ' / ' (e.g., は↑し / は↓し).
 */
export function PitchAccent({ kana, patterns, className }: PitchAccentProps) {
  const display = useMemo(() => {
    const moras = splitIntoMoras(kana);
    return patterns
      .map((p) => applyPitchAccent(moras, p))
      .join(' / ');
  }, [kana, patterns]);

  if (!patterns.length || !kana) return null;

  return (
    <span className={className} lang="ja">
      {display}
    </span>
  );
}
