'use client';

import React, { useMemo, useState } from 'react';
import type { LemmatizedToken } from '@langplayer/shared';
import { buildRuby, katakanaToHiragana } from '@langplayer/utils';
import type { RubySegment } from '@langplayer/utils';
import { getCachedEntries } from '@/lib/dictionary-cache';

/**
 * Get the lowest difficulty value for a word from its cached dictionary entries.
 * Checks both `levels[].numeric` and `frequencyLevel`, returns the minimum.
 * Returns null if no difficulty data is available in any cached entry.
 */
function getWordDifficulty(l2Code: string, lemmas: LemmatizedToken['lemmas']): number | null {
  let lowest: number | null = null;
  for (const lemma of lemmas) {
    const entries = getCachedEntries(l2Code, lemma.lemma);
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.levels) {
        for (const l of entry.levels) {
          if (typeof l.numeric === 'number' && l.numeric >= 1 && l.numeric <= 7) {
            if (lowest === null || l.numeric < lowest) lowest = l.numeric;
          }
        }
      }
      if (typeof entry.frequencyLevel === 'number' && entry.frequencyLevel >= 1 && entry.frequencyLevel <= 7) {
        if (lowest === null || entry.frequencyLevel < lowest) lowest = entry.frequencyLevel;
      }
    }
  }
  return lowest;
}

export interface TokenSpanProps {
  token: LemmatizedToken;
  l2Code: string;
  /** Phonetics display mode: 'ruby' (above), 'word' (replace text), or false (hidden). */
  phoneticsMode: 'ruby' | 'word' | false;
  /** Phonetics filter: 'always' or 'hardWords' (only words above user level). */
  phoneticsConditions: 'always' | 'hardWords';
  /** User's proficiency level (1–7). Used when conditions === 'hardWords'. */
  userLevel?: number;
  quickGloss: boolean;
  /** Show the first dictionary definition below every word (interlinear gloss). */
  showDefinition: boolean;
  isSelected: boolean;
  isSaved: boolean;
  isHighlighted: boolean;
  /** `normal` = show all words; `quiz` = blank out saved words for self-testing. */
  mode: 'normal' | 'quiz';
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
  phoneticsConditions,
  userLevel,
  quickGloss,
  showDefinition,
  isSelected,
  isSaved,
  isHighlighted,
  mode,
  onClick,
}) => {
  // ── Quiz mode: toggle blank reveal per-word ──
  const [quizRevealed, setQuizRevealed] = useState(false);

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

  // ── "Hard words only" filter: suppress phonetics for easy words ──
  const showPhonetics = useMemo(() => {
    if (phoneticsMode === false) return false;
    if (phoneticsConditions === 'always') return true;
    // hardWords: show only if word difficulty >= user level
    if (!userLevel || userLevel < 1) return true; // no level set → show all
    const diff = getWordDifficulty(l2Code, token.lemmas);
    if (diff === null) return true; // no difficulty data → err on side of helping
    return diff >= userLevel;
  }, [phoneticsMode, phoneticsConditions, userLevel, l2Code, token.lemmas]);

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

  // ── Quiz mode: blank out saved words for self-testing ──
  const isQuizBlanking = mode === 'quiz' && isSaved && !quizRevealed;

  // ── Common class for the outer clickable wrapper ──
  const wrapperClass = `cursor-pointer rounded transition-colors ${
    isSelected
      ? 'bg-primary/20 text-primary'
      : isHighlighted
        ? 'bg-primary/15 text-primary font-semibold ring-1 ring-primary/30'
        : isQuizBlanking
          ? 'hover:bg-muted/80 border-b-2 border-dashed border-muted-foreground/40'
          : 'hover:bg-muted/80'
  }`;

  // ── Saved-word background — only on the word itself, never on the gloss ──
  const wordBgClass = (!isSelected && !isHighlighted && isSaved && !isQuizBlanking)
    ? 'bg-yellow-200/25 rounded'
    : '';

  const title = isQuizBlanking ? 'Click to reveal' : token.lemmas.map(l => l.lemma).join(', ');

  // ── Word content (reused by both layout variants) ──
  let wordContent: React.ReactNode;

  // ── Quiz blank: show placeholder instead of word ──
  if (isQuizBlanking) {
    wordContent = (
      <span className="px-1 text-muted-foreground/40 select-none">
        {'＿'.repeat(Math.max(1, token.text.length))}
      </span>
    );
  } else if (showPhonetics && phoneticsMode === 'word' && token.pronunciation && token.pronunciation !== token.text
      && (!isJapanese || hasKanji)) {
    const displayText = base === 'ja' ? katakanaToHiragana(token.pronunciation) : token.pronunciation;
    wordContent = <span className={wordBgClass}>{displayText}</span>;
  } else {
    // ── Ruby text ──
    const hasPhonetics = !isHighlighted && !isQuizBlanking && showPhonetics && phoneticsMode === 'ruby' && token.pronunciation && token.pronunciation !== token.text;
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

  // ── Handle click: in quiz mode, reveal blank first; otherwise open popup ──
  const handleClick = () => {
    if (isQuizBlanking) {
      setQuizRevealed(true);
      return;
    }
    onClick();
  };

  // ── Interlinear definition: word stacked above definition, centered ──
  if (interlinearDef && !isQuizBlanking) {
    return (
      <span onClick={(e) => { e.stopPropagation(); handleClick(); }} className={wrapperClass} title={title}>
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
    <span onClick={(e) => { e.stopPropagation(); handleClick(); }} className={wrapperClass} title={title}>
      {wordContent}
      {quickGlossDef && !isQuizBlanking && <QuickGloss def={quickGlossDef} />}
    </span>
  );
};

/** Inline quick gloss — first definition shown after a saved word. Bottom-aligned, not highlighted. */
const QuickGloss: React.FC<{ def: string }> = ({ def }) => (
  <span className="ml-0.5 text-[0.6em] text-muted-foreground/70 font-normal select-none align-text-bottom">
    '{def}'
  </span>
);
