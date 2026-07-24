'use client';

import React, { useMemo, useState } from 'react';
import type { LemmatizedToken } from '@langplayer/shared';
import { buildRuby, katakanaToHiragana } from '@langplayer/utils';
import type { RubySegment } from '@langplayer/utils';
import { getCachedEntries } from '@/lib/dictionary-cache';

/** Word difficulty result from the local dictionary cache.
 *
 *  `not_cached`  — no entry in cache yet (bulk lookup still pending).
 *  `unclassified` — cached entry exists but has no `levels[].numeric` and no
 *                    `frequencyLevel`. Unknown → treat as "hard" (show phonetics).
 *  `classified`   — at least one `levels[].numeric` or `frequencyLevel` value
 *                    found; `value` is the lowest (easiest) on a 1–7 scale. */
type WordDifficulty =
  | { kind: 'not_cached' }
  | { kind: 'unclassified' }
  | { kind: 'classified'; value: number };

/** Get the lowest difficulty value for a word from its cached dictionary entries.
 *  Checks both `levels[].numeric` and `frequencyLevel`, returns the minimum. */
function getWordDifficulty(l2Code: string, lemmas: LemmatizedToken['lemmas']): WordDifficulty {
  let hasEntry = false;
  let lowest: number | null = null;
  for (const lemma of lemmas) {
    const entries = getCachedEntries(l2Code, lemma.lemma);
    if (!entries) continue;
    hasEntry = true;
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
  if (!hasEntry) return { kind: 'not_cached' };
  if (lowest === null) return { kind: 'unclassified' };
  return { kind: 'classified', value: lowest };
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
  /** ko: show hanja alongside hangul. vi: show hán tự alongside quốc ngữ. Ignored otherwise. */
  byeonggi: boolean;
  onClick: () => void;
  /** Monotonically incremented by TokenizedText when bulk dictionary lookup completes.
   *  TokenSpan reads this to know when cached entries may have updated. */
  cacheVersion: number;
  /** In karaoke mode: true = this word has been spoken (full brightness), false = not yet spoken (dimmed). */
  isKaraokeSpoken?: boolean;
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
  byeonggi,
  onClick,
  cacheVersion,
  isKaraokeSpoken,
}) => {
  // ── Quiz mode: toggle blank reveal per-word ──
  const [quizRevealed, setQuizRevealed] = useState(false);

  // ── Quiz blanking state — computed early since byeonggiNode, wrapperClass, etc. depend on it ──
  const isQuizBlanking = mode === 'quiz' && isSaved && !quizRevealed;

  const base = l2Code.split('-')[0]!;

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

  // ── Quick gloss: only for saved words with gloss enabled.
  //    Suppressed for highlighted words (e.g. the term being tested on the review page). ──
  const quickGlossDef = (isSaved && quickGloss && !isHighlighted) ? firstDef : null;
  // ── Interlinear definition: for all words (when enabled) ──
  const interlinearDef = showDefinition ? firstDef : null;

  // ── Byeonggi: hanja (ko) / hán tự (vi) from first cached dictionary entry ──
  const byeonggiText = useMemo(() => {
    if (!byeonggi) return null;
    // Only for Korean and Vietnamese
    const isKo = base === 'ko';
    const isVi = base === 'vi';
    if (!isKo && !isVi) return null;
    for (const lemma of token.lemmas) {
      const entries = getCachedEntries(l2Code, lemma.lemma);
      if (!entries) continue;
      for (const entry of entries) {
        if (!entry.han_script) continue;
        if (isKo && entry.han_script.hanja) return entry.han_script.hanja;
        if (isVi && entry.han_script.han) return entry.han_script.han;
      }
    }
    return null;
  }, [byeonggi, base, l2Code, token.lemmas]);

  // ── Byeonggi node: small muted text, same size as furigana <rt>, no brackets ──
  const byeonggiNode = (byeonggiText && !isQuizBlanking) ? (
    <span className="text-[0.55em] text-muted-foreground/70 font-normal select-none">
      {byeonggiText}
    </span>
  ) : null;

  // ── "Hard words only" filter: suppress phonetics for easy words ──
  //
  // NOT memoized: the dictionary cache is populated asynchronously.
  // memoizing would lock in the initial (cache-miss) result and never
  // recompute when entries arrive.
  const showPhonetics = (() => {
    if (phoneticsMode === false) return false;
    if (phoneticsConditions === 'always') return true;

    // hardWords — only show if we have dictionary data confirming the
    // word is at or above the user's proficiency level.
    if (!userLevel || userLevel < 1) return true; // no level set → show all
    const diff = getWordDifficulty(l2Code, token.lemmas);
    // No cached entry yet → don't show. Once the async bulk lookup
    // completes and re-renders, this will re-evaluate.
    if (diff.kind === 'not_cached') return false;
    // Entry exists but no levels or frequency data → unknown word,
    // likely uncommon; treat as hard so the learner gets help.
    if (diff.kind === 'unclassified') return true;
    return diff.value >= userLevel;
  })();

  // ── Structural tokens: newlines → <br />, spaces/punctuation → raw text ──
  if (token.text === '\n' || token.text === '\r') {
    return <br />;
  }

  const isWord = token.lemmas.length > 0;
  if (!isWord) {
    return <>{token.text}</>;
  }

  const isJapanese = base === 'ja';
  const hasKanji = isJapanese && /[一-龯]/.test(token.text);

  // ── Common class for the outer clickable wrapper ──
  const karaokeClass = isKaraokeSpoken === false && !isSelected && !isHighlighted && !isQuizBlanking
    ? 'text-muted-foreground/50'
    : '';
  const wrapperClass = `cursor-pointer rounded transition-colors ${karaokeClass} ${
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

  // ── Wrapper that combines wordContent + byeonggi for both layout variants ──
  const annotatedWord = (
    <>
      {wordContent}
      {byeonggiNode}
    </>
  );

  // ── Interlinear definition: word stacked above definition, centered ──
  if (interlinearDef && !isQuizBlanking) {
    return (
      <span onClick={(e) => { e.stopPropagation(); handleClick(); }} className={wrapperClass} title={title}>
        <span className="inline-flex flex-col items-center">
          {annotatedWord}
          <span className="text-[0.55em] text-muted-foreground/60 font-normal select-none leading-none">
            {interlinearDef}
          </span>
        </span>
      </span>
    );
  }

  // ── Inline layout: word with optional byeonggi + quick gloss alongside ──
  return (
    <span onClick={(e) => { e.stopPropagation(); handleClick(); }} className={wrapperClass} title={title}>
      {annotatedWord}
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
