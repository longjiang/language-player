'use client';

import React, { useMemo } from 'react';
import { splitRareGlyphRuns } from '@langplayer/shared';
import { useRareGlyphState } from '@/providers/rare-glyph-provider';

/**
 * Visible fallback for a codepoint no available font can render (SPEC-104).
 *
 * The original character stays in the DOM, transparent, under the chip so
 * selection/copy yields the real codepoint rather than "U+26030". The chip
 * label is decorative (`aria-hidden`) and select-none.
 */
export function RareGlyphChip({
  text,
  label,
  className = '',
}: {
  text: string;
  label: string;
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label={`Rare character ${label}`}
      title={`Rare character ${label}`}
      data-rare-glyph={label}
      className={`relative inline-block align-baseline rounded border border-dashed border-border bg-muted/30 px-0.5 text-center text-muted-foreground ${className}`.trim()}
      style={{ minWidth: '1.15em', lineHeight: 1.15 }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 flex select-none items-center justify-center text-[0.55em] font-medium leading-none"
      >
        {label}
      </span>
      <span className="select-text opacity-0">{text}</span>
    </span>
  );
}

function RareGlyphSpan({
  text,
  label,
  family,
}: {
  text: string;
  label: string;
  family?: string;
}) {
  if (family) {
    return (
      <span data-rare-glyph={label} style={{ fontFamily: family }}>
        {text}
      </span>
    );
  }
  return <RareGlyphChip text={text} label={label} />;
}

/**
 * Render L2 text with rare codepoints using a loaded subset, or a chip when
 * the subset is missing/not loaded. Ordinary text is returned unchanged.
 */
export function RareGlyphText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const { familyFor } = useRareGlyphState(text);
  const runs = useMemo(() => splitRareGlyphRuns(text), [text]);

  if (runs.length === 0) return null;
  if (runs.length === 1 && runs[0]!.kind === 'text') {
    return <>{runs[0]!.text}</>;
  }

  return (
    <span className={className}>
      {runs.map((run, index) => {
        if (run.kind === 'text') {
          return <React.Fragment key={`t-${index}`}>{run.text}</React.Fragment>;
        }
        return (
          <RareGlyphSpan
            key={`r-${run.codePoint}-${index}`}
            text={run.text}
            label={run.label}
            family={familyFor?.(run.codePoint)}
          />
        );
      })}
    </span>
  );
}
