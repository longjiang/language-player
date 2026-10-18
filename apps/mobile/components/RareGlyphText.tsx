'use client';

import React, { useMemo } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import { rareGlyphLabel, splitRareGlyphRuns } from '@langplayer/shared';
import { useRareGlyphState } from '@/contexts/RareGlyphContext';

/**
 * Visible fallback for a rare Han codepoint no font can render (SPEC-104).
 *
 * The original character is kept in the Text so copy/lookup still see it; the
 * `U+XXXX` label is the visible, select-none presentation.
 */
export function RareGlyphChip({
  text,
  label,
  style,
}: {
  text: string;
  label: string;
  style?: StyleProp<TextStyle>;
}) {
  return (
    <Text
      accessibilityRole="image"
      accessibilityLabel={`Rare character ${label}`}
      className="rounded border border-dashed border-border bg-muted/30 px-0.5 text-center text-muted-foreground"
      style={style}
    >
      <Text style={{ fontSize: 9, lineHeight: 9, fontWeight: '600' }}>?</Text>
      <Text style={{ opacity: 0 }}>{text}</Text>
    </Text>
  );
}

/** Render rare runs with the loaded subset family, or a chip when missing. */
export function RareGlyphText({
  text,
  style,
}: {
  text: string;
  style?: StyleProp<TextStyle>;
}) {
  const { familyFor } = useRareGlyphState(text);
  const runs = useMemo(() => splitRareGlyphRuns(text), [text]);

  if (runs.length === 0) return null;
  if (runs.length === 1 && runs[0]!.kind === 'text') return text;

  return (
    <>
      {runs.map((run, index) => {
        if (run.kind === 'text') {
          return <Text key={`t-${index}`} style={style}>{run.text}</Text>;
        }
        const family = familyFor?.(run.codePoint);
        if (family) {
          return (
            <Text
              key={`r-${run.codePoint}-${index}`}
              style={[style, { fontFamily: family }]}
            >
              {run.text}
            </Text>
          );
        }
        return (
          <RareGlyphChip
            key={`r-${run.codePoint}-${index}`}
            text={run.text}
            label={rareGlyphLabel(run.codePoint)}
            style={style}
          />
        );
      })}
    </>
  );
}
