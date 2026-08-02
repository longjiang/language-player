'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { LemmatizedToken, DictionaryEntry } from '@langplayer/shared';
import { firstGloss } from '@langplayer/shared';
import { buildRuby, katakanaToHiragana } from '@langplayer/utils';
import type { RubySegment } from '@langplayer/utils';
import { getCachedEntries } from '@/lib/dictionary-cache';
import { useSettingsContext } from '@/providers/settings-provider';
import { baseCode } from '@/lib/language-data';
import { PYTHON_API_URL } from '@/lib/api-url';

// ── Module-level L1 definition cache ──
// Key: `${l2Code}:${text}:${l1Code}` → first definition in the user's L1.
// Populated by per-word /dictionary/lookup calls when L1 ≠ English.
// Avoids duplicate fetches when the same word appears multiple times on screen.
const _l1DefCache = new Map<string, string>();
/** In-flight per-word L1 lookup promises (dedup). */
const _l1DefInflight = new Map<string, Promise<string | null>>();

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
  /** User's native language code. Used for per-word L1 definition lookup
   *  when L1 ≠ English (batch lookup returns English-only definitions). */
  l1Code: string;
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
  /** Called when the token is clicked; passes the clicked span's bounding
   *  rect so callers can anchor popups to the word (e.g. spawn animations). */
  onClick: (rect?: DOMRect) => void;
  /** Monotonically incremented by TokenizedText when bulk dictionary lookup completes.
   *  TokenSpan reads this to know when cached entries may have updated. */
  cacheVersion: number;
  /** In karaoke mode: true = this word has been spoken (full brightness), false = not yet spoken (dimmed). */
  isKaraokeSpoken?: boolean;
  /** True when the following token is whitespace or punctuation — suppress the
   *  trailing space after the quick gloss so it stays attached to the next word. */
  nextTokenIsSeparator?: boolean;
  /** When false, phonetics (ruby) are suppressed on highlighted tokens. Used by
   *  the SRS review page so the target word's reading stays hidden until the
   *  card is revealed. Defaults to true — highlighting alone does not hide a
   *  word's reading. */
  phoneticsOnHighlight?: boolean;
  /** When false, the quick gloss is suppressed on highlighted tokens. Used by
   *  the SRS review page so the target word's gloss stays hidden until the
   *  card is revealed. Defaults to true — highlighting alone does not hide a
   *  saved word's gloss. */
  quickGlossOnHighlight?: boolean;
}

/**
 * Individual clickable word token with ruby text, quick gloss, and interlinear definition.
 * Extracted from tokenized-text.tsx to keep the file manageable.
 */
export const TokenSpan: React.FC<TokenSpanProps> = ({
  token,
  l2Code,
  l1Code,
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
  nextTokenIsSeparator,
  phoneticsOnHighlight = true,
  quickGlossOnHighlight = true,
}) => {
  // ── Quiz mode: toggle blank reveal per-word ──
  const [quizRevealed, setQuizRevealed] = useState(false);

  // ── L1-translated quick gloss (fetched per-word for non-English L1 users) ──
  // Batch lookup returns English-only definitions for speed. For saved words
  // with quick gloss enabled, fetch the L1-translated definition individually.
  const [l1GlossDef, setL1GlossDef] = useState<string | null>(null);

  useEffect(() => {
    // Only fetch when all conditions are met:
    //   - Word is saved + quick gloss is on
    //   - L1 is not English (English defs are already in cache from batch lookup)
    //   - Word is not highlighted, or highlighting is allowed to show the gloss
    //     (the review page hides the target word's gloss until the card is revealed)
    if (!isSaved || !quickGloss || (isHighlighted && !quickGlossOnHighlight) || l1Code === 'en') {
      setL1GlossDef(null);
      return;
    }

    // Try each lemma and surface form to find the best cache key
    const lookupText = token.lemmas[0]?.lemma || token.text;
    const cacheKey = `${l2Code}:${lookupText}:${l1Code}`;

    // Already cached at module level?
    const cached = _l1DefCache.get(cacheKey);
    if (cached !== undefined) {
      setL1GlossDef(cached);
      return;
    }

    // Already in flight?
    const inflight = _l1DefInflight.get(cacheKey);
    if (inflight) {
      let cancelled = false;
      inflight.then((def) => { if (!cancelled) setL1GlossDef(def); });
      return () => { cancelled = true; };
    }

    // Fetch from server
    let cancelled = false;
    const promise = fetch(`${PYTHON_API_URL}/dictionary/lookup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: lookupText, l2: l2Code, l1: l1Code }),
    })
      .then((r) => r.json())
      .then((data) => {
        const results = (data.results ?? []) as DictionaryEntry[];
        const gloss = results[0]?.definitions ? firstGloss(results[0].definitions) : null;
        _l1DefCache.set(cacheKey, gloss ?? '');
        return gloss;
      })
      .catch(() => null)
      .finally(() => { _l1DefInflight.delete(cacheKey); });

    _l1DefInflight.set(cacheKey, promise);
    promise.then((def) => { if (!cancelled) setL1GlossDef(def); });

    return () => { cancelled = true; };
  }, [isSaved, quickGloss, isHighlighted, quickGlossOnHighlight, l1Code, l2Code, token.lemmas, token.text]);

  // ── Quiz blanking state — computed early since byeonggiNode, wrapperClass, etc. depend on it ──
  const isQuizBlanking = mode === 'quiz' && isSaved && !quizRevealed;

  const base = l2Code.split('-')[0]!;

  // ── Chinese script conversion: simplified ↔ traditional (ADR-0019) ──
  const { getL2 } = useSettingsContext();
  const l2Settings = getL2(l2Code);
  const isChinese = baseCode(l2Code) === 'zh';
  const useTraditional = isChinese && l2Settings.display.traditional;

  // Per-token OpenCC conversion (lazy-loaded once at module level).
  // cn→twp is idempotent on already-traditional text and preserves
  // 1:1 character mapping, so ruby alignment with pinyin is safe.
  const [displayText, setDisplayText] = useState(token.text);
  useEffect(() => {
    if (!useTraditional) { setDisplayText(token.text); return; }
    let cancelled = false;
    (async () => {
      const { toTraditional } = await import('@/lib/chinese-script');
      const result = await toTraditional(token.text);
      if (!cancelled) setDisplayText(result);
    })();
    return () => { cancelled = true; };
  }, [token.text, useTraditional]);

  // ── First gloss segment — shared by quick gloss and interlinear ──
  const firstDef = useMemo(() => {
    for (const lemma of token.lemmas) {
      const entries = getCachedEntries(l2Code, lemma.lemma);
      if (entries && entries.length > 0 && entries[0]!.definitions.length > 0) {
        return firstGloss(entries[0]!.definitions);
      }
    }
    const surfaceEntries = getCachedEntries(l2Code, token.text);
    if (surfaceEntries && surfaceEntries.length > 0 && surfaceEntries[0]!.definitions.length > 0) {
      return firstGloss(surfaceEntries[0]!.definitions);
    }
    return null;
  }, [l2Code, token.text, token.lemmas]);

  // ── Quick gloss: only for saved words with gloss enabled.
  //    Suppressed for highlighted words only when quickGlossOnHighlight is false
  //    (the review page hides the target word's gloss until the card is revealed).
  //    Prefer L1-translated definition (fetched per-word) over cached English def. ──
  const quickGlossDef = (isSaved && quickGloss && (quickGlossOnHighlight || !isHighlighted)) ? (l1GlossDef ?? firstDef) : null;
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
    ? 'opacity-40'
    : '';
  const wrapperClass = `cursor-pointer rounded transition-opacity ${karaokeClass} ${
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
    const hasPhonetics = !isQuizBlanking && showPhonetics && phoneticsMode === 'ruby' && token.pronunciation && token.pronunciation !== token.text && (phoneticsOnHighlight || !isHighlighted);
    const rubySegments: RubySegment[] | null = hasPhonetics
      ? buildRuby(displayText, token.pronunciation!, l2Code)
      : null;

    wordContent = (
      <span className={wordBgClass}>
        {rubySegments
          ? rubySegments.map((seg, j) =>
              seg.reading
                ? <ruby key={j}>{seg.text}<rt>{seg.reading}</rt></ruby>
                : <React.Fragment key={j}>{seg.text}</React.Fragment>
            )
          : displayText}
      </span>
    );
  }

  // ── Handle click: in quiz mode, reveal blank first; otherwise open popup ──
  const handleClick = (rect?: DOMRect) => {
    if (isQuizBlanking) {
      setQuizRevealed(true);
      return;
    }
    onClick(rect);
  };

  // ── Wrapper that combines wordContent + byeonggi + optional quick gloss for both layout variants ──
  const annotatedWord = (
    <>
      {wordContent}
      {byeonggiNode}
    </>
  );

  // Quick gloss and interlinear definition coexist — quick gloss shows the 'def'
  // marker for saved words, while interlinear shows the definition below every word.
  const wordWithGloss = (
    <>
      {annotatedWord}
      {quickGlossDef && !isQuizBlanking && (
        <QuickGloss def={quickGlossDef} needsTrailingSpace={nextTokenIsSeparator !== true} />
      )}
    </>
  );

  // ── Interlinear definition: word (with optional quick gloss) stacked above definition, centered ──
  if (interlinearDef && !isQuizBlanking) {
    return (
      <span onClick={(e) => { e.stopPropagation(); handleClick(e.currentTarget.getBoundingClientRect()); }} className={wrapperClass} title={title}>
        <span className="inline-flex flex-col items-center">
          {wordWithGloss}
          <span className="text-[0.55em] text-muted-foreground/60 font-normal select-none leading-none">
            {interlinearDef}
          </span>
        </span>
      </span>
    );
  }

  // ── Inline layout: word with optional quick gloss (no definition below) ──
  return (
    <span onClick={(e) => { e.stopPropagation(); handleClick(e.currentTarget.getBoundingClientRect()); }} className={wrapperClass} title={title}>
      {wordWithGloss}
    </span>
  );
};

/** Inline quick gloss — first definition shown after a saved word, wrapped in
 *  parentheses and typographic single quotes at the same size and color as normal text.
 *  A leading space separates it from the word; a trailing space separates it from the
 *  next word unless the next token is whitespace or punctuation. */
const QuickGloss: React.FC<{ def: string; needsTrailingSpace: boolean }> = ({ def, needsTrailingSpace }) => (
  <span className="font-normal select-none">
    {' (‘'}
    {def}
    {'’)'}
    {needsTrailingSpace ? ' ' : null}
  </span>
);
