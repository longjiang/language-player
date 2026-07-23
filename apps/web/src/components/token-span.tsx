'use client';

import React, { useMemo } from 'react';
import type { LemmatizedToken } from '@langplayer/shared';
import { buildRuby, katakanaToHiragana } from '@langplayer/utils';
import type { RubySegment } from '@langplayer/utils';
import { getCachedEntries } from '@/lib/dictionary-cache';

export interface TokenSpanProps {
  token: LemmatizedToken;
  l2Code: string;
  /** Phonetics display mode: 'ruby' (above), 'word' (replace text), or false (hidden). */
  phoneticsMode: 'ruby' | 'word' | false;
  quickGloss: boolean;
  /** Show the first dictionary definition below every word (interlinear gloss). */
  showDefinition: boolean;
  isSelected: boolean;
  isSaved: boolean;
  isHighlighted: boolean;
  onClick: () => void;
}

/**
 * Individual clickable word token with ruby text, quick gloss, and interlinear definition.
 * Extracted from tokenized-text.tsx to keep the file manageable.
 */
export const TokenSpan: React.FC<TokenSpanProps> = ({
  token,
  l2Code,
  phoneticsMode,
  quickGloss,
  showDefinition,
  isSelected,
  isSaved,
  isHighlighted,
  onClick,
}) => {
  // ── First cached entry's first definition — shared by quick gloss and interlinear ──
  const firstDef = useMemo(() => {
    for (const lemma of token.lemmas) {
      const entries = getCachedEntries(l2Code, lemma.lemma);
      if (entries && entries.length > 0 && entries[0]!.definitions.length > 0) {
        return entries[0]!.definitions[0]!;
      }
    }
    const surfaceEntries = getCachedEntries(l2Code, token.text);
    if (surfaceEntries && surfaceEntries.length > 0 && surfaceEntries[0]!.definitions.length > 0) {
      return surfaceEntries[0]!.definitions[0]!;
    }
    return null;
  }, [l2Code, token.text, token.lemmas]);

  // ── Quick gloss: only for saved words with gloss enabled ──
  const quickGlossDef = (isSaved && quickGloss) ? firstDef : null;
  // ── Interlinear definition: for all words (when enabled) ──
  const interlinearDef = showDefinition ? firstDef : null;

  // ── Structural tokens: newlines → <br />, spaces/punctuation → raw text ──
  if (token.text === '\n' || token.text === '\r') {
    return <br />;
  }

  const isWord = token.lemmas.length > 0;
  if (!isWord) {
    return <>{token.text}</>;
  }

  const base = l2Code.split('-')[0]!;
  const isJapanese = base === 'ja';
  const hasKanji = isJapanese && /[一-龯]/.test(token.text);

  // ── Common class for the outer clickable wrapper ──
  const wrapperClass = `cursor-pointer rounded transition-colors ${
    isSelected
      ? 'bg-primary/20 text-primary'
      : isHighlighted
        ? 'bg-primary/15 text-primary font-semibold ring-1 ring-primary/30'
        : 'hover:bg-muted/80'
  }`;

  // ── Saved-word background — only on the word itself, never on the gloss ──
  const wordBgClass = (!isSelected && !isHighlighted && isSaved)
    ? 'bg-yellow-200/25 rounded'
    : '';

  const title = token.lemmas.map(l => l.lemma).join(', ');

  // ── Word content (reused by both layout variants) ──
  let wordContent: React.ReactNode;

  // ── Phonetics-only mode: show reading instead of surface text ──
  if (phoneticsMode === 'word' && token.pronunciation && token.pronunciation !== token.text
      && (!isJapanese || hasKanji)) {
    const displayText = base === 'ja' ? katakanaToHiragana(token.pronunciation) : token.pronunciation;
    wordContent = <span className={wordBgClass}>{displayText}</span>;
  } else {
    // ── Ruby text ──
    const hasPhonetics = !isHighlighted && phoneticsMode === 'ruby' && token.pronunciation && token.pronunciation !== token.text;
    const rubySegments: RubySegment[] | null = hasPhonetics
      ? buildRuby(token.text, token.pronunciation!, l2Code)
      : null;

    wordContent = (
      <span className={wordBgClass}>
        {rubySegments
          ? rubySegments.map((seg, j) =>
              seg.reading
                ? <ruby key={j}>{seg.text}<rt>{seg.reading}</rt></ruby>
                : <React.Fragment key={j}>{seg.text}</React.Fragment>
            )
          : token.text}
      </span>
    );
  }

  // ── Interlinear definition: word stacked above definition, centered ──
  if (interlinearDef) {
    return (
      <span onClick={(e) => { e.stopPropagation(); onClick(); }} className={wrapperClass} title={title}>
        <span className="inline-flex flex-col items-center">
          {wordContent}
          <span className="text-[0.55em] text-muted-foreground/60 font-normal select-none leading-none">
            {interlinearDef}
          </span>
        </span>
      </span>
    );
  }

  // ── Inline layout: word with optional quick gloss alongside ──
  return (
    <span onClick={(e) => { e.stopPropagation(); onClick(); }} className={wrapperClass} title={title}>
      {wordContent}
      {quickGlossDef && <QuickGloss def={quickGlossDef} />}
    </span>
  );
};

/** Inline quick gloss — first definition shown after a saved word. Bottom-aligned, not highlighted. */
const QuickGloss: React.FC<{ def: string }> = ({ def }) => (
  <span className="ml-0.5 text-[0.6em] text-muted-foreground/70 font-normal select-none align-text-bottom">
    '{def}'
  </span>
);
