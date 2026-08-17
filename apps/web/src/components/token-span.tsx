'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { LemmatizedToken, DictionaryEntry } from '@langplayer/shared';
import { firstGloss } from '@langplayer/shared';
import { buildRuby, katakanaToHiragana, pickSavedEntry } from '@langplayer/utils';
import type { RubySegment } from '@langplayer/utils';
import { getCachedEntries, getCachedEntryById, getL1CachedEntry } from '@/lib/dictionary-cache';
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
  /** Entry id of the saved word this token belongs to (e.g. "cedict-0").
   *  When set, the quick gloss prefers this entry's definition over the
   *  first dictionary match — multiple entries can match one surface form,
   *  and the saved entry is the one the user actually chose. */
  savedWordId?: string;
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
  /** Flat ruby run (ADR-0039): emit ruby segments as bare inline siblings
   *  with no per-token wrapper box, so readings can overhang/distribute
   *  against neighboring glyphs. Interaction and styling ride on the segment
   *  elements themselves. Only used when interlinear definitions are off. */
  flat?: boolean;
  /** Markdown format for this token (from TokenizedText's format ranges).
   *  In flat mode the format styling is folded into the segment element
   *  classes instead of a <strong>/<em>/<mark>/<code> wrapper — the wrapper
   *  would re-create a per-token box. Ignored when flat is false. */
  format?: 'bold' | 'italic' | 'code' | 'link' | 'highlight' | null;
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
  savedWordId,
  isHighlighted,
  mode,
  byeonggi,
  onClick,
  cacheVersion,
  isKaraokeSpoken,
  nextTokenIsSeparator,
  flat = false,
  format,
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
    // Include the saved entry id in the key: two tokens with the same text
    // but different saved entries must not share a cached gloss.
    const cacheKey = `${l2Code}:${lookupText}:${savedWordId ?? ''}:${l1Code}`;

    // Already-translated entry for the exact saved word (cached by entry id
    // by the dictionary popup and review page)? Prefer it — the L1 definition
    // of the entry the user saved, fetched at most once per (l2, l1, entry).
    if (savedWordId) {
      const savedL1Entry =
        getL1CachedEntry(l2Code, l1Code, savedWordId) ??
        getL1CachedEntry(baseCode(l2Code), l1Code, savedWordId);
      if (savedL1Entry && savedL1Entry.definitions.length > 0) {
        setL1GlossDef(firstGloss(savedL1Entry.definitions));
        return;
      }
    }

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
        // Prefer the entry the user actually saved over the first match —
        // a lookup can return several entries for one surface form.
        const entry = pickSavedEntry(results, savedWordId, baseCode(l2Code)) ?? results[0];
        const gloss = entry?.definitions ? firstGloss(entry.definitions) : null;
        _l1DefCache.set(cacheKey, gloss ?? '');
        return gloss;
      })
      .catch(() => null)
      .finally(() => { _l1DefInflight.delete(cacheKey); });

    _l1DefInflight.set(cacheKey, promise);
    promise.then((def) => { if (!cancelled) setL1GlossDef(def); });

    return () => { cancelled = true; };
  }, [isSaved, quickGloss, isHighlighted, quickGlossOnHighlight, l1Code, l2Code, token.lemmas, token.text, savedWordId]);

  // ── Quiz blanking state — computed early since byeonggiNode, wrapperClass, etc. depend on it ──
  const isQuizBlanking = mode === 'quiz' && isSaved && !quizRevealed;

  const base = l2Code.split('-')[0]!;

  // ── Chinese script conversion: simplified ↔ traditional (ADR-0019) ──
  const { getL2 } = useSettingsContext();
  const l2Settings = getL2(l2Code);
  const isChinese = baseCode(l2Code) === 'zh';
  const useTraditional = isChinese && l2Settings.display.traditional;

  // Per-token OpenCC conversion (lazy-loaded once at module level).
  // Bidirectional per ADR-0019: cn→twp for traditional preference, twp→cn
  // for simplified. Both are idempotent on already-matching text and
  // preserve 1:1 character mapping, so ruby alignment with pinyin is safe.
  const [displayText, setDisplayText] = useState(token.text);
  const isHanToken = /[\u4E00-\u9FFF]/.test(token.text);
  useEffect(() => {
    // ADR-0019: convert whenever the user's script preference differs from
    // the token's script. cn→twp when traditional is preferred; twp→cn
    // when simplified is preferred (idempotent on already-matching text).
    // Only applies to Chinese L2s — Japanese kanji / Korean hanja must never
    // be converted (mobile parity).
    if (!isChinese || !isHanToken) { setDisplayText(token.text); return; }
    let cancelled = false;
    (async () => {
      const { toTraditional, toSimplified } = await import('@/lib/chinese-script');
      const convert = useTraditional ? toTraditional : toSimplified;
      const result = await convert(token.text);
      if (!cancelled) setDisplayText(result);
    })();
    return () => { cancelled = true; };
  }, [token.text, useTraditional, isChinese, isHanToken, l2Code]);

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

  // ── Saved-word definition — the entry the user actually saved, resolved
  //    by its id from the dictionary cache. Multiple dictionary entries can
  //    match one surface form; the saved entry is the one the user chose, so
  //    the quick gloss must prefer it over the first match. Re-runs when the
  //    cache version bumps (the bulk lookup usually fills the id cache after
  //    the first render). ──
  const savedFirstDef = useMemo(() => {
    if (!savedWordId) return null;
    const savedEntry =
      getCachedEntryById(l2Code, savedWordId) ??
      getCachedEntryById(baseCode(l2Code), savedWordId);
    if (savedEntry && savedEntry.definitions.length > 0) {
      return firstGloss(savedEntry.definitions);
    }
    return null;
  }, [l2Code, savedWordId, cacheVersion]);

  // ── Quick gloss: only for saved words with gloss enabled.
  //    Suppressed for highlighted words only when quickGlossOnHighlight is false
  //    (the review page hides the target word's gloss until the card is revealed).
  //    Prefer L1-translated definition (fetched per-word) over the saved entry's
  //    cached definition, then the first cached match. ──
  const quickGlossDef = (isSaved && quickGloss && (quickGlossOnHighlight || !isHighlighted)) ? (l1GlossDef ?? savedFirstDef ?? firstDef) : null;
  // ── Interlinear definition: for all words (when enabled). Saved words show
  //    the definition of the entry the user saved (same source as the quick
  //    gloss), matching mobile — unsaved words keep the first cached match. ──
  const interlinearDef = showDefinition ? (savedFirstDef ?? firstDef) : null;

  // ── Byeonggi: hanja (ko) / hán tự (vi) from first cached dictionary entry ──
  const byeonggiText = useMemo(() => {
    if (!byeonggi) return null;
    // Only for Korean and Vietnamese
    const isKo = base === 'ko';
    const isVi = base === 'vi';
    if (!isKo && !isVi) return null;
    for (const lemma of token.lemmas) {
      // The batch dictionary lookup is case-sensitive on the server, while
      // Vietnamese lemmatization keeps sentence-initial capitals (e.g. "Bạn").
      // Try the exact form first, then the lowercase form — dictionary heads
      // are stored lowercase, so both keys may be populated in the cache.
      const lookupTexts = lemma.lemma === lemma.lemma.toLowerCase()
        ? [lemma.lemma]
        : [lemma.lemma, lemma.lemma.toLowerCase()];
      for (const lookupText of lookupTexts) {
        const entries = getCachedEntries(base, lookupText);
        if (!entries) continue;
        for (const entry of entries) {
          if (!entry.han_script) continue;
          if (isKo && entry.han_script.hanja) return entry.han_script.hanja;
          if (isVi && entry.han_script.han) return entry.han_script.han;
        }
      }
    }
    // cacheVersion is a dependency (below) so this memo re-runs once the async
    // batch lookup populates the dictionary cache — otherwise the first
    // (cache-miss) render would lock in null.
    return null;
  }, [byeonggi, base, l2Code, token.lemmas, cacheVersion]);

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

  // ── Handle click: in quiz mode, reveal blank first; otherwise open popup ──
  const handleClick = (rect?: DOMRect) => {
    if (isQuizBlanking) {
      setQuizRevealed(true);
      return;
    }
    onClick(rect);
  };

  // ── Flat run (ADR-0039): format styling folded into element classes ──
  // The boxed path wraps tokens in <strong>/<em>/<mark>/<code>; the flat run
  // must not — a wrapper element would re-create the per-token box that the
  // flat run exists to remove. Padding is dropped (box-model property);
  // background/ring/color/decoration are layout-neutral.
  const formatClasses = flat
    ? format === 'bold' ? 'font-semibold'
      : format === 'italic' ? 'italic'
      : format === 'code' ? 'rounded bg-muted font-mono text-[0.9em]'
      : format === 'link' ? 'text-primary underline underline-offset-2 decoration-primary/40 hover:decoration-primary'
      : format === 'highlight' ? 'rounded-sm bg-primary/40 text-primary dark:bg-primary/60'
      : ''
    : '';

  // One merged class set per segment element — interaction, karaoke dimming,
  // selected/highlighted/quiz state, saved-word background, and format all
  // ride on the segment element itself, so no wrapper box sits between
  // adjacent <ruby> elements.
  const segmentClasses = `${wrapperClass} ${wordBgClass} ${formatClasses}`.trim();
  // Flat run: whole-token hover — segments use group-hover/token so hovering
  // anywhere in the token highlights ALL segments together. The display:contents
  // group wrapper (see flat return below) provides the hover scope without
  // creating the per-token box the flat run exists to remove.
  const flatSegmentClasses = flat
    ? segmentClasses.replace('hover:bg-muted/80', 'group-hover/token:bg-muted/80')
    : segmentClasses;
  const segmentClick = (e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    handleClick(e.currentTarget.getBoundingClientRect());
  };

  // ── Word content (reused by both layout variants) ──
  let wordContent: React.ReactNode;

  // ── Quiz blank: show placeholder instead of word ──
  if (isQuizBlanking) {
    wordContent = flat ? (
      <span
        className={`${flatSegmentClasses} px-1 text-muted-foreground/40 select-none`}
       
        onClick={segmentClick}
      >
        {'＿'.repeat(Math.max(1, token.text.length))}
      </span>
    ) : (
      <span className="px-1 text-muted-foreground/40 select-none">
        {'＿'.repeat(Math.max(1, token.text.length))}
      </span>
    );
  } else if (showPhonetics && phoneticsMode === 'word' && token.pronunciation && token.pronunciation !== token.text
      && (!isJapanese || hasKanji)) {
    const phoneticText = base === 'ja' ? katakanaToHiragana(token.pronunciation) : token.pronunciation;
    wordContent = flat
      ? <span className={flatSegmentClasses} onClick={segmentClick}>{phoneticText}</span>
      : <span className={wordBgClass}>{phoneticText}</span>;
  } else {
    // ── Ruby text ──
    const hasPhonetics = !isQuizBlanking && showPhonetics && phoneticsMode === 'ruby' && token.pronunciation && token.pronunciation !== token.text && (phoneticsOnHighlight || !isHighlighted);
    const rubySegments: RubySegment[] | null = hasPhonetics
      ? buildRuby(displayText, token.pronunciation!, l2Code)
      : null;

    if (flat) {
      // Flat ruby run: each segment is a direct inline sibling — bare <ruby>
      // elements (or minimal spans where plain text needs a click target) with
      // no per-token wrapper box between them, so the engine lays readings
      // out against neighboring glyphs (overhang, distribution).
      wordContent = rubySegments ? (
        <>
          {rubySegments.map((seg, j) =>
            seg.reading ? (
              <ruby key={j} className={flatSegmentClasses} onClick={segmentClick}>
                {seg.text}
                <rt className="select-none" dir="ltr">{seg.reading}</rt>
              </ruby>
            ) : (
              <span key={j} className={flatSegmentClasses} onClick={segmentClick}>
                {seg.text}
              </span>
            )
          )}
        </>
      ) : (
        <span className={flatSegmentClasses} onClick={segmentClick}>{displayText}</span>
      );
    } else {
      wordContent = (
        <span className={wordBgClass}>
          {rubySegments
            ? rubySegments.map((seg, j) =>
                seg.reading
                  ? <ruby key={j}>{seg.text}<rt className="select-none" dir="ltr">{seg.reading}</rt></ruby>
                  : <React.Fragment key={j}>{seg.text}</React.Fragment>
              )
            : displayText}
        </span>
      );
    }
  }

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
      <span onClick={(e) => { e.stopPropagation(); handleClick(e.currentTarget.getBoundingClientRect()); }} className={wrapperClass}>
        <span className="inline-flex flex-col items-center">
          {wordWithGloss}
          <span className="text-[0.55em] text-muted-foreground/60 font-normal select-none leading-none">
            {interlinearDef}
          </span>
        </span>
      </span>
    );
  }

  // ── Flat run: the segments are already bare inline siblings carrying all
  //    interaction + styling — no wrapper box around the token. ──
  if (flat) {
    return <span className="group/token contents">{wordWithGloss}</span>;
  }

  // ── Inline layout: word with optional quick gloss (no definition below) ──
  return (
    <span onClick={(e) => { e.stopPropagation(); handleClick(e.currentTarget.getBoundingClientRect()); }} className={wrapperClass}>
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
