'use client';

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  isSameEntryId,
  type DictionaryEntry,
  type LemmatizedToken,
  type SavedWordContext,
} from '@langplayer/shared';
import { DictionaryPopup } from './dictionary-popup';
import { useLanguage } from '@/providers/language-provider';
import { useSavedWordsContext } from '@/providers/saved-words-provider';
import { baseCode, isRTL } from '@/lib/language-data';
import { useGlyphLang } from '@/hooks/use-glyph-lang';
import { PYTHON_API_URL } from '@/lib/api-url';
import { log } from '@/lib/logger';
import { useSettingsContext } from '@/providers/settings-provider';
import { useSavedPhraseCandidates, useHighlightKanaForms } from '@/hooks/use-highlight-forms';
import { useProgressLevel } from '@/hooks/use-progress';
import type { TokenCache } from '@langplayer/shared';
import { enqueueLookupWords, getCachedEntries } from '@/lib/dictionary-cache';
import { enqueueLemmatize, lemmatizeCache, lemmatizeInflight } from '@/lib/lemmatize-queue';
import { isSeparatorToken, karaokeWordWeight } from '@/lib/tokenized-text-helpers';
import { addExtraForm } from '@/hooks/use-inflected-search-terms';
import {
  isPhoneticsEligible,
  kanaFormsForEntries,
  mergePhraseTokens,
  sentenceContaining,
  sentenceForToken,
  splitPhraseTokens,
  tokenMatchesAnyForm,
  tokenMatchesAnyTerm,
} from '@langplayer/utils';
import { TokenSpan } from './token-span';
import type { FormatRange } from '@/lib/parse-markdown';
import { useSelectionPopup } from '@/hooks/use-selection-popup';
import { ZOOM_TO_REM } from '@/lib/text-scale';

// Re-exported for callers that imported the constant from this component
// before it moved to lib/text-scale.
export { ZOOM_TO_REM };

/**
 * Plain-text fallback with search-highlight ranges applied. The tokenized
 * render only shows once lemmatization resolves, but a search match must be
 * visible immediately — whether or not the text was previously seen, loaded,
 * or tokenized (EPUB search). Other format types (bold/italic/code/…) are
 * left for the tokenized render, matching pre-tokenization behavior.
 */
function highlightPlainText(text: string, formats: FormatRange[] | undefined): React.ReactNode {
  const ranges = (formats ?? []).filter((f) => f.type === 'highlight' && f.end > f.start);
  if (ranges.length === 0) return text;
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const out: React.ReactNode[] = [];
  let pos = 0;
  for (const f of sorted) {
    const start = Math.max(0, Math.min(f.start, text.length));
    const end = Math.max(start, Math.min(f.end, text.length));
    if (start > pos) out.push(text.slice(pos, start));
    if (end > start) {
      out.push(
        <mark key={start} className="rounded-sm bg-primary/40 px-0.5 text-primary dark:bg-primary/60">
          {text.slice(start, end)}
        </mark>,
      );
    }
    pos = Math.max(pos, end);
  }
  if (pos < text.length) out.push(text.slice(pos));
  return out;
}

export interface TokenizedTextProps {
  text: string;
  l2Code: string;
  /**
   * Extra multiplier on top of the user's zoom setting from SettingsContext
   * (tokenizedText.zoom). Defaults to 1 (user zoom alone). Only single-line
   * subtitles pass 1.33. SPEC-051: this is the only allowed non-default value.
   */
  textScale?: number;
  /**
   * Inline tokenized text (e.g. AI explanation spans inside a markdown
   * paragraph): no user-zoom scaling and no leading — inherit from parent.
   * SPEC-051 §Target behavior.
   */
  inline?: boolean;
  /**
   * Block-level text whose size must come from the parent (reader headings).
   * Keeps the parent's font-size (so heading classes still apply) without
   * dropping leading. SPEC-051: headings scale via the parent container's
   * zoom instead of an inline rem size.
   */
  inheritSize?: boolean;
  /** Font family override: 'default' (inherit), 'serif', or 'sans-serif'. */
  typeFace?: 'default' | 'serif' | 'sans-serif';
  /**
   * Line-height (leading) multiplier for tokenized text (1–2). Defaults to
   * the display-settings value (1.625×). Ignored when `inline` is set.
   */
  leading?: number;
  /** Extra contextual info for word saving (video title, timestamp, book title, etc.).
   *  `text` and `form` cannot be overridden — `form` is the clicked surface
   *  form, and `text` is the sentence (Intl.Segmenter) the clicked token
   *  appears in, derived from this component's own text. */
  context?: Partial<SavedWordContext>;
  /** Pre-populated token cache from /lemmatize-video-normalized */
  tokenCache?: TokenCache;
  /** Whether the token cache has finished loading. When false and tokenCache
   *  is provided, the component shows plain text without calling the API. */
  tokenCacheLoaded?: boolean;
  /** When true, skip the lazy batch-lemmatize pipeline entirely — the parent
   *  (e.g. ReaderPanel) is the lemmatization authority and supplies tokens via
   *  the `tokens` prop. Prevents duplicate lemmatization of the same lines. */
  deferTokenization?: boolean;
  /** Pre-loaded tokens — when set, skips the API call entirely. */
  tokens?: LemmatizedToken[];
  /**
   * Markdown formatting ranges (bold/italic/code) from parseMarkdown, used to
   * style individual tokens without breaking their interactivity.
   */
  formats?: FormatRange[];
  /**
   * When set (http/https only), the token dictionary popup offers an
   * "Open in Reader" action that navigates to this URL.
   */
  href?: string;
  /** Custom handler for the popup's link action. When set, `href` may be any
   *  scheme (e.g. an internal EPUB chapter/anchor link). */
  onOpenLink?: (href: string) => void;
  /** A specific word form to highlight (e.g. the inflected form that was saved in this context). */
  highlightForm?: string;
  /** Multiple word forms to highlight (e.g. search terms in subs-search). Any token
   *  whose text matches one of these forms gets the highlight ring. */
  highlightForms?: string[];
  /** Dictionary entry ids to highlight by identity (e.g. the entry being
   *  viewed). After the batch dictionary lookup resolves, any token whose
   *  lemma resolves to one of these entries (same id) gets the highlight
   *  ring — more precise than surface-form matching, and immune to
   *  homograph false positives. */
  highlightEntryIds?: string[];
  /** Karaoke progress for the active subtitle line: 0 (start) to 1 (end). When undefined, karaoke is off. */
  karaokeProgress?: number;
  /** Opacity for words not reached yet by karaoke. Band mode uses a higher
   *  value so unspoken words remain readable over the dark overlay. */
  karaokeDimOpacity?: number;
  /** Semantic text color for contexts such as the dark subtitle band. */
  textColor?: string;
  /** When false, phonetics are suppressed on highlighted tokens. Used by the SRS
   *  review page so the target word's reading stays hidden until the card is
   *  revealed. Defaults to true — highlighting alone does not hide readings. */
  phoneticsOnHighlight?: boolean;
  /** When false, the quick gloss is suppressed on highlighted tokens. Used by the
   *  SRS review page so the target word's gloss stays hidden until the card is
   *  revealed. Defaults to true — highlighting alone does not hide a saved word's
   *  gloss. */
  quickGlossOnHighlight?: boolean;
  /** When false, phonetics/furigana are suppressed entirely. Used by AI
   *  explanations so L2 spans render plain. Defaults to true — the user's
   *  setting applies. */
  phonetics?: boolean;
  /** Overrides the tokenized-text mode. AI explanations pass 'normal' so
   *  saved-word quiz blanking never appears. */
  mode?: 'normal' | 'quiz';
  /** When false, saved words are not highlighted (no yellow background).
   *  Defaults to true — saved words highlight as usual. Used by AI explanations. */
  highlightSaved?: boolean;
  /** Overrides the user's quick-gloss setting when provided. */
  quickGloss?: boolean;
  /** Overrides the user's interlinear-definition setting when provided. */
  showDefinition?: boolean;
  /** Overrides the user's byeonggi (hanja/hán tự) setting when provided. */
  byeonggi?: boolean;
  /** When true, selecting text inside the tokenized text opens the dictionary
   *  popup with the selected substring fed in as the lookup term (no lemma). */
  selectionDictionary?: boolean;
  /** When true, token taps do NOT open the dictionary popup. Used for
   *  tokenized text rendered inside the popup itself (the context-sentence
   *  card) where a nested dialog would stack on top of the popup. */
  disablePopup?: boolean;
  /** Called when the pointer enters/leaves a token: the token's char range in
   *  `text` on enter (null when ranges can't be reconstructed), null on leave.
   *  Used by the readers to highlight the matching translation sentence. */
  onTokenHover?: (range: { start: number; end: number } | null) => void;
}

/**
 * Displays text with each word tokenized and lemmatized.
 * Tokens are clickable — clicking shows lemma info and enables dictionary lookup.
 * Passes context through for word saving (video title, subtitle line, etc.).
 */
export const TokenizedText: React.FC<TokenizedTextProps> = ({
  text,
  l2Code,
  textScale,
  inline = false,
  inheritSize = false,
  leading,
  context: externalContext,
  tokenCache,
  tokenCacheLoaded,
  deferTokenization = false,
  tokens: preloadedTokens,
  formats,
  href,
  onOpenLink,
  highlightForm,
  highlightForms,
  highlightEntryIds,
  karaokeProgress,
  karaokeDimOpacity = 0.4,
  textColor,
  phoneticsOnHighlight = true,
  quickGlossOnHighlight = true,
  phonetics,
  mode: modeOverride,
  highlightSaved,
  quickGloss,
  showDefinition,
  byeonggi,
  selectionDictionary = false,
  onTokenHover,
  typeFace,
  disablePopup = false,
}) => {
  const { l1 } = useLanguage();
  const { savedWords } = useSavedWordsContext();
  // SPEC-080: tag L2 content with a glyph-safe `lang` and its matching `dir`
  // so CJK renders with the correct regional glyph variants.
  const glyphLang = useGlyphLang(l2Code);
  const contentDir = isRTL(l2Code) ? 'rtl' : 'ltr';
  // Each Chinese token is rendered as a sequence of inline ruby bases so its
  // pinyin stays attached to the matching character. Chromium/WebKit do not
  // consistently expose the normal Han line-break opportunities across that
  // ruby boundary, which can leave a long tokenized line clipped at the right
  // edge. CJK text has no whitespace-based word boundary to preserve, so allow
  // character-level breaks only for Chinese-family L2s. Other languages keep
  // their normal word-wrapping behavior.
  const cjkWrapClass = ['zh', 'yue'].includes(baseCode(l2Code)) ? 'break-all' : '';
  const { getL2, tokenizedText: settingsTokenizedText } = useSettingsContext();
  const userLevel = useProgressLevel(l2Code);

  // Serif/sans-serif preference from display settings applies everywhere a
  // call site doesn't pass an explicit typeFace override (mobile parity).
  const effectiveTypeFace = typeFace ?? settingsTokenizedText.typeFace ?? 'default';
  const fontClass =
    effectiveTypeFace === 'serif' ? 'font-serif' :
    effectiveTypeFace === 'sans-serif' ? 'font-sans' : '';

  // Resolve effective font size (rem). The user's zoom setting from
  // SettingsContext always applies to block-level TokenizedText:
  //   - textScale provided → textScale × user zoom (1.33 only for subtitles)
  //   - textScale omitted  → user zoom alone
  //   - inline / inheritSize → no inline font-size; parent controls size
  // Inline text also skips leading; inheritSize keeps leading.
  const zoomRem = ZOOM_TO_REM[settingsTokenizedText.zoom] ?? 1;
  const effectiveScale = inline || inheritSize ? 0 : (textScale ?? 1) * zoomRem;
  const effectiveLeading = leading ?? settingsTokenizedText.leading ?? 1.625;
  // Unitless line-height so it scales with whatever font size applies
  // (inline rem size, or the parent's size for inheritSize).
  const textStyle = inline
    ? undefined
    : {
        ...(effectiveScale ? { fontSize: `${effectiveScale}rem` } : {}),
        lineHeight: String(effectiveLeading),
      };
  const [tokens, setTokens] = useState<LemmatizedToken[]>(preloadedTokens ?? []);
  const [loading, setLoading] = useState(!preloadedTokens);
  const [error, setError] = useState<string | null>(null);
  const [selectedToken, setSelectedToken] = useState<LemmatizedToken | null>(null);
  const [popupPosition, setPopupPosition] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [hasBeenVisible, setHasBeenVisible] = useState(false);
  const [cacheVersion, setCacheVersion] = useState(0);
  const { containerRef, selection: textSelection, clear: clearTextSelection } = useSelectionPopup<HTMLSpanElement>();
  const abortRef = useRef<AbortController | null>(null);
  const loadingRef = useRef(false); // prevent concurrent fetches
  const lastTextRef = useRef(text); // avoid redundant tokenize re-triggers
  const tokenCacheRef = useRef(tokenCache); // stable access without deps churn
  tokenCacheRef.current = tokenCache;

  // Saved phrase candidates — every saved form (head + inflections) that could
  // span multiple tokens. The merge below collapses exact token-boundary
  // matches into one atomic token so multi-token phrases highlight as saved.
  const savedPhraseCandidates = useSavedPhraseCandidates(savedWords, l2Code);
  const highlightKanaForms = useHighlightKanaForms(highlightForm, highlightForms, l2Code, cacheVersion);

  // Tokens with saved multi-token phrases merged into single atomic tokens
  // (pure client-side retokenization — total length is preserved, so format
  // offsets, karaoke pacing, and sentence context stay aligned).
  //
  // SPEC-033 cross-boundary retokenization runs first: saved/search forms
  // that cross a token boundary (掘藏 inside 想掘|藏) or sit inside one token
  // (革命 inside 抓革命促) split their tokens into an atomic phrase token plus
  // placeholder fragments; mergePhraseTokens then collapses boundary-aligned
  // phrases as before. Fragments carry `lemmas: []` (non-interactive until
  // re-lemmatized) and are spliced back once their own lemmatization
  // resolves — the splice only applies when the results tile the fragment
  // exactly, so reconstruction can never break.
  const splitForms = useMemo(
    () => [...savedPhraseCandidates, ...highlightKanaForms, ...(highlightForm ? [highlightForm] : []), ...(highlightForms ?? [])],
    [savedPhraseCandidates, highlightKanaForms, highlightForm, highlightForms],
  );
  const splitResult = useMemo(
    () => splitPhraseTokens(text, tokens, splitForms),
    [text, tokens, splitForms],
  );
  const splitPlaceholders = splitResult.placeholders;

  // Re-lemmatize the placeholder fragments (e.g. 想 from 想掘) so they regain
  // their own lemma + pronunciation and become interactive again. Queued
  // through the shared batch queue; results land in a keyed map that the
  // splice memo reads. Cache-first: the fragment key is the same
  // `${l2Code}:${text}` key the line tokenizer uses. `attemptedRef` keeps
  // fragments that already resolved (successfully or empty) from being
  // re-requested when the effect re-runs for a sibling fragment.
  const [fragmentLemmas, setFragmentLemmas] = useState<Map<string, LemmatizedToken[]>>(new Map());
  const attemptedFragmentsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (splitPlaceholders.length === 0) return;
    let cancelled = false;
    for (const p of splitPlaceholders) {
      const key = `${l2Code}:${p.text}`;
      if (fragmentLemmas.has(key) || attemptedFragmentsRef.current.has(key)) continue;
      const cached = lemmatizeCache.get(key);
      if (cached && cached.length > 0) {
        attemptedFragmentsRef.current.add(key);
        setFragmentLemmas((prev) => new Map(prev).set(key, cached));
        continue;
      }
      attemptedFragmentsRef.current.add(key);
      enqueueLemmatize(p.text, l2Code)
        .then((result) => {
          if (cancelled || result.length === 0) return;
          setFragmentLemmas((prev) => new Map(prev).set(key, result));
        })
        .catch(() => { /* fragment stays non-interactive — same as before */ });
    }
    return () => { cancelled = true; };
  }, [splitPlaceholders, l2Code, fragmentLemmas]);

  const displayTokens = useMemo(() => {
    const { tokens: splitTokens } = splitResult;
    if (splitTokens === tokens) return mergePhraseTokens(text, tokens, splitForms);
    // Splice re-lemmatized fragments back in place of the placeholders. Each
    // splice clones the replacement tokens so identical fragments (想 twice)
    // never share object identity — TokenSpan's `selectedToken === token`
    // check and the isSaved/highlight memos key off object identity.
    let spliced = splitTokens;
    for (const p of splitPlaceholders) {
      const replacement = fragmentLemmas.get(`${l2Code}:${p.text}`);
      // Only splice when the re-lemmatized tokens tile the fragment exactly —
      // otherwise the fragment stays a non-interactive placeholder.
      if (!replacement) continue;
      const total = replacement.reduce((sum, t) => sum + t.text.length, 0);
      if (total !== p.text.length) continue;
      const cloned = replacement.map((t) => ({ ...t }));
      spliced = spliced.flatMap((t) => (t === p ? cloned : [t]));
    }
    return mergePhraseTokens(text, spliced, splitForms);
  }, [splitResult, splitPlaceholders, fragmentLemmas, l2Code, text, splitForms, tokens]);

  // Map markdown format ranges onto token indices by reconstructing character
  // offsets from the surface tokens (they concatenate back to `text`). Bails
  // out entirely when the reconstruction doesn't match, so formatting can
  // never corrupt token alignment.
  const tokenFormatStyles = useMemo(() => {
    if (!formats?.length) return null;
    const total = displayTokens.reduce((sum, t) => sum + t.text.length, 0);
    if (total !== text.length) return null;
    let pos = 0;
    const out: Array<'bold' | 'italic' | 'code' | 'link' | 'highlight' | 'strikethrough' | 'image' | null> = [];
    for (const token of displayTokens) {
      let fmt: 'bold' | 'italic' | 'code' | 'link' | 'highlight' | 'strikethrough' | 'image' | null = null;
      for (const f of formats) {
        if (pos < f.end && pos + token.text.length > f.start) {
          // Link styling wins over bold/italic/code so linked tokens always
          // read as links (their action lives in the dictionary popup).
          if (f.type === 'link') { fmt = 'link'; break; }
          // Search matches outrank bold/italic/code, but not links.
          if (f.type === 'highlight' || fmt === null) fmt = f.type;
        }
      }
      out.push(fmt);
      pos += token.text.length;
    }
    return out;
  }, [displayTokens, formats, text]);

  // Token index → inline-image URI for tokens inside an `image` format range.
  // The image replaces its alt text in the flow, so only the first token of a
  // contiguous image run actually draws the image (the rest collapse to it).
  const imageTokenMap = useMemo(() => {
    if (!formats?.some((f) => f.type === 'image')) return null;
    const total = displayTokens.reduce((sum, t) => sum + t.text.length, 0);
    if (total !== text.length) return null;
    let pos = 0;
    const map: Record<number, string> = {};
    for (let i = 0; i < displayTokens.length; i++) {
      const token = displayTokens[i];
      if (!token) continue;
      const start = pos;
      const end = pos + token.text.length;
      const imgFmt = formats.find((f) => f.type === 'image' && f.start < end && f.end > start);
      if (imgFmt?.url) map[i] = imgFmt.url;
      pos = end;
    }
    return map;
  }, [displayTokens, formats, text]);

  // Char ranges of each display token in `text` (same reconstruction guard as
  // tokenFormatStyles — tokens concatenate back to `text` or we bail). Only
  // computed when a hover listener is attached.
  const tokenRanges = useMemo(() => {
    if (!onTokenHover) return null;
    const total = displayTokens.reduce((sum, t) => sum + t.text.length, 0);
    if (total !== text.length) return null;
    let pos = 0;
    return displayTokens.map(t => {
      const range = { start: pos, end: pos + t.text.length };
      pos = range.end;
      return range;
    });
  }, [displayTokens, text, onTokenHover]);

  // ── Lazy tokenization: only tokenize when visible, then stay tokenized ──
  useEffect(() => {
    if (hasBeenVisible) return; // already visible, no need to observe

    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setHasBeenVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' }, // start tokenizing 200px before it enters viewport
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasBeenVisible]);

  // ── Tokenization: fetch lemmatized tokens when visible ──
  // Chinese script conversion (simplified ↔ traditional) is handled
  // per-token by TokenSpan — TokenizedText always sends original text
  // to the lemmatizer for best Jieba quality (per ADR-0019).
  useEffect(() => {
    // Skip API call if tokens were pre-loaded
    if (preloadedTokens) {
      setTokens(preloadedTokens);
      setLoading(false);
      return;
    }

    // Lazy tokenization: don't fetch until visible
    if (!hasBeenVisible) return;

    const effectiveText = text;

    // If a video-level token cache is provided but hasn't finished loading yet,
    // keep the pulsing state — don't fall back to per-line API calls yet.
    // When tokenCacheLoaded flips to true, this effect re-fires and tries the
    // now-populated cache (or the queued-lemmatization path for imported videos).
    if (tokenCache && tokenCacheLoaded === false) {
      setLoading(true);
      return;
    }

    // Parent-driven lemmatization (reader pagination): don't start our own
    // queue request — the parent's onLemmatize covers every line on the page
    // and hands tokens back through the `tokens` prop.
    if (deferTokenization) {
      setLoading(true);
      return;
    }

    // Skip if we already have tokens for this text in cache AND state
    const cacheKey = `${l2Code}:${effectiveText}`;
    const cached = lemmatizeCache.get(cacheKey);
    if (cached && cached.length > 0) {
      setTokens(cached);
      setLoading(false);
      return;
    }

    // Prevent concurrent fetches for the same text
    if (loadingRef.current) return;
    loadingRef.current = true;

    // Cancel previous request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (!effectiveText.trim()) {
      setTokens([]);
      setLoading(false);
      loadingRef.current = false;
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setSelectedToken(null);

    const tokenize = async () => {
      try {
        // 2. Video token cache (from /lemmatize-video-normalized)
        const tc = tokenCacheRef.current;
        if (tc) {
          const videoCached = tc.get(effectiveText);
          if (videoCached) {
            lemmatizeCache.set(cacheKey, videoCached);
            if (!cancelled) { setTokens(videoCached); setLoading(false); loadingRef.current = false; }
            return;
          }
        }

        // 3. Fall back to queued lemmatization — visible lines flush together
        // through /lemmatize-normalized/batch, with in-flight deduplication so
        // concurrent instances for the same text share a single request.
        let inflight = lemmatizeInflight.get(cacheKey);
        if (!inflight) {
          inflight = enqueueLemmatize(effectiveText, l2Code).finally(() => {
            lemmatizeInflight.delete(cacheKey);
          });
          lemmatizeInflight.set(cacheKey, inflight);
        }

        const resultTokens = await inflight;
        if (!cancelled) {
          setTokens(resultTokens);
          setLoading(false);
          loadingRef.current = false;
        }
      } catch (err: any) {
        if (err.name === 'AbortError') { loadingRef.current = false; return; }
        if (!cancelled) {
          setError(err?.message ?? 'Tokenization failed');
          setTokens([{ text: effectiveText, lemmas: [] }]);
          setLoading(false);
          loadingRef.current = false;
        }
      }
    };

    tokenize();
    return () => {
      cancelled = true;
      controller.abort();
      loadingRef.current = false;
    };
  }, [text, l2Code, preloadedTokens, tokenCacheLoaded, deferTokenization, hasBeenVisible]);

  // ── Bulk dictionary lookup: pre-fetch entries for all unique lemmas ──
  useEffect(() => {
    if (loading || error || displayTokens.length === 0) return;

    const uniqueLemmas = new Map<string, string>(); // text → part_of_speech
    for (const token of displayTokens) {
      for (const lemma of token.lemmas) {
        const t = lemma.lemma.trim();
        // Skip whitespace, punctuation, and single-char non-word tokens
        if (!t || t.length === 0 || /^[\s\p{P}]+$/u.test(t)) continue;
        if (!uniqueLemmas.has(t)) {
          uniqueLemmas.set(t, lemma.part_of_speech ?? '');
        }
        // Batch lookup is case-sensitive, but Vietnamese (and other Latin
        // script) lemmatization keeps sentence-initial capitals. Enqueue the
        // lowercase form too so dictionary entries populate for "Bạn"/"bạn".
        const lower = t.toLowerCase();
        if (lower !== t && !uniqueLemmas.has(lower)) {
          uniqueLemmas.set(lower, lemma.part_of_speech ?? '');
        }
      }
      // Also include the surface form if it differs from all lemmas
      const surface = token.text.trim();
      if (surface && surface.length > 0 && !/^[\s\p{P}]+$/u.test(surface) && !uniqueLemmas.has(surface)) {
        uniqueLemmas.set(surface, '');
      }
      const surfaceLower = surface.toLowerCase();
      if (surfaceLower !== surface && !uniqueLemmas.has(surfaceLower)) {
        uniqueLemmas.set(surfaceLower, '');
      }
    }

    if (uniqueLemmas.size === 0) return;

    const words = Array.from(uniqueLemmas.keys()).map((text) => ({
      text,
      l2Code: baseCode(l2Code),
    }));

    // Queue with other visible lines' lemmas so one flush covers many lines
    // (still lazy — only lemmatized, i.e. visible, lines enqueue anything).
    enqueueLookupWords(words, PYTHON_API_URL).then((queued) => { if (queued) setCacheVersion(v => v + 1); });
  }, [displayTokens, loading, error, l2Code]);

  // Enqueue lookups for the highlight terms themselves, so their dictionary
  // entries (alternate / phonetic_detail.kana — e.g. しかるべき for 然るべき)
  // land in the cache and highlightKanaForms can bridge kanji-head ↔ kana-
  // surface matching in the context sentence.
  useEffect(() => {
    const terms = [
      ...(highlightForm ? [highlightForm] : []),
      ...(highlightForms ?? []),
    ];
    if (terms.length === 0) return;
    enqueueLookupWords(
      terms.map((text) => ({ text, l2Code: baseCode(l2Code) })),
      PYTHON_API_URL,
    ).then((queued) => { if (queued) setCacheVersion(v => v + 1); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightForm, highlightForms, l2Code]);

  const handleTokenClick = useCallback((token: LemmatizedToken, rect?: DOMRect, el?: Element) => {
    // SPEC-033 (substring selection): when the user drag-selects a substring
    // inside one token (e.g. 革命 inside 抓革命促), the mouseup that ends the
    // drag also fires a click on that token — and click runs BEFORE the
    // deferred selection capture in useSelectionPopup. Without this guard the
    // click clears the selection (`clearTextSelection`) and opens the
    // whole-token popup, so the substring popup never appears. Read the LIVE
    // browser selection (not the hook's state): when a non-collapsed
    // selection intersects this token's DOM node, defer to it — the selection
    // popup (selected substring as the lookup term) opens and the click is
    // swallowed. Multi-token selections never fire a token click at all
    // (click targets the mousedown/mouseup common ancestor), so this only
    // arbitrates the same-token case. Only in selectionDictionary contexts —
    // per SPEC-033 §Where Enabled the SRS review card stays tap-only.
    if (selectionDictionary && el) {
      const sel = typeof window !== 'undefined' ? window.getSelection() : null;
      if (sel && !sel.isCollapsed && sel.rangeCount > 0 && sel.toString().trim()) {
        if (sel.getRangeAt(0).intersectsNode(el)) {
          // Diagnostic (gated by LOG_LEVEL): confirms the click was
          // suppressed in favor of the selection popup.
          log('TokenizedText: token click suppressed — active selection intersects token:', JSON.stringify(token.text));
          return;
        }
      }
    }
    setSelectedToken(prev => prev === token ? null : token);
    if (rect) {
      setPopupPosition({ x: rect.left, y: rect.top, width: rect.width, height: rect.height });
    }
    // A token popup supersedes the selection popup.
    clearTextSelection();
  }, [selectionDictionary, clearTextSelection]);

  // A new text selection supersedes the token dictionary popup.
  useEffect(() => {
    if (textSelection) setSelectedToken(null);
  }, [textSelection]);

  // Sentence containing the selected token — limits the saved context (and the
  // AI/image-search context) to the sentence the word was clicked in.
  const selectedContextText = useMemo(() => {
    if (!selectedToken) return null;
    return sentenceForToken(text, displayTokens, selectedToken, baseCode(l2Code));
  }, [selectedToken, text, displayTokens, l2Code]);

  // Sentence containing the selection — mirrors the token path so arbitrary
  // text selections get the same immediate-sentence context (Intl.Segmenter)
  // instead of the whole block.
  const selectedTextContext = useMemo(() => {
    if (!textSelection) return null;
    const offset = textSelection.startOffset;
    if (offset !== null && text.slice(offset, offset + textSelection.text.length) === textSelection.text) {
      return sentenceContaining(text, offset, baseCode(l2Code));
    }
    // Offset mapping fell through (e.g. converted script or phonetics-replaced
    // display) — locate the selection by substring search, like sentenceForToken.
    const hit = text.indexOf(textSelection.text);
    if (hit !== -1) return sentenceContaining(text, hit, baseCode(l2Code));
    return text;
  }, [textSelection, text, l2Code]);

  // Build a set of saved word forms for quick lookup
  const savedFormSet = useMemo(() => {
    const words = savedWords[l2Code] ?? [];
    const forms = new Set<string>();
    for (const w of words) {
      for (const f of w.forms) {
        forms.add(f.toLowerCase());
      }
      // Also include the inflected surface form the user actually encountered
      if (w.context?.form) {
        forms.add(w.context.form.toLowerCase());
      }
      // Multi-instance records keep their real surface forms per occurrence
      // (e.g. a selected phrase like "got even with me" saved under the
      // canonical "to get even with someone").
      for (const inst of w.instances ?? []) {
        if (inst.form) forms.add(inst.form.toLowerCase());
      }
    }
    return forms;
  }, [savedWords, l2Code]);

  // Map each saved word form to the entry id the user actually saved. A form
  // can match several saved entries (homographs, multiple senses) — when that
  // happens the most recently saved entry wins, so the quick gloss reflects
  // the user's latest intent. TokenSpan uses this to show the saved entry's
  // definition instead of the first dictionary match.
  const savedWordIdByForm = useMemo(() => {
    const words = [...(savedWords[l2Code] ?? [])].sort(
      (a, b) => (b.date ?? 0) - (a.date ?? 0),
    );
    const map = new Map<string, string>();
    const add = (form: string, id: string) => {
      const key = form.toLowerCase();
      if (!form.trim() || map.has(key)) return;
      map.set(key, id);
    };
    for (const w of words) {
      for (const f of w.forms) add(f, w.id);
      if (w.context?.form) add(w.context.form, w.id);
      for (const inst of w.instances ?? []) if (inst.form) add(inst.form, w.id);
    }
    return map;
  }, [savedWords, l2Code]);

  // Entry id of the saved word this token belongs to (undefined when the
  // token isn't saved, or the saved record can't be matched). Mirrors
  // tokenMatchesAnyForm: surface form first, then lemma forms.
  const savedWordIdForToken = (token: LemmatizedToken): string | undefined => {
    const surfaceId = savedWordIdByForm.get(token.text.toLowerCase());
    if (surfaceId) return surfaceId;
    for (const l of token.lemmas) {
      const id = savedWordIdByForm.get(l.lemma.toLowerCase());
      if (id) return id;
    }
    return undefined;
  };

  // Entry-id matching: once the batch dictionary lookup populates the cache,
  // highlight any token whose lemma resolves to one of the requested entries
  // (compared by id — e.g. the dictionary entry currently being viewed). The
  // cache is keyed by baseCode(l2Code), matching enqueueLookupWords, so reads
  // use the base code too. Re-evaluates whenever cacheVersion bumps.
  const highlightEntryIdSet = useMemo(
    () => new Set(highlightEntryIds ?? []),
    [highlightEntryIds],
  );
  const tokenHasTargetEntry = (token: LemmatizedToken): boolean => {
    if (highlightEntryIdSet.size === 0) return false;
    const base = baseCode(l2Code);
    const matches = (entries: DictionaryEntry[] | undefined): boolean =>
      !!entries?.some((e) =>
        [...highlightEntryIdSet].some((id) => isSameEntryId(id, e.id, base)),
      );
    for (const lemma of token.lemmas) {
      if (matches(getCachedEntries(base, lemma.lemma))) return true;
    }
    return matches(getCachedEntries(base, token.text));
  };

  // Highlight the target word even when the tokenizer splits an inflected
  // surface form (e.g. 押し切られ → 押し切ら + れ): any token whose lemma
  // equals the saved head/form is the target.
  const tokenMatchesHighlight = (token: LemmatizedToken): boolean => {
    if (highlightForm && tokenMatchesAnyTerm(token, [highlightForm])) return true;
    if (highlightForms && highlightForms.length > 0) {
      // Effective forms: the requested forms + their entries' kana/alternate
      // surfaces (e.g. しかるべき for 然るべき) so a kana surface in the
      // context sentence matches its kanji headword.
      const effectiveForms = [...highlightForms, ...highlightKanaForms];
      if (tokenMatchesAnyTerm(token, effectiveForms)) return true;
      // Search terms can appear inside compound tokens (e.g. 武侠 in 武侠片) —
      // highlight the whole token so the L2 matches the translation bold.
      const surface = token.text.toLowerCase();
      return effectiveForms.some((f) => {
        const form = f.toLowerCase();
        return form.length > 0 && surface.includes(form);
      });
    }
    return tokenHasTargetEntry(token);
  };

  // Report surface forms of tokens that matched a dictionary entry back to
  // the inflection store ("other" category) — anywhere TokenizedText renders.
  // Once the batch lookup resolves (cacheVersion bumps), every token whose
  // lemma (or surface) has cached entries contributes its surface form to
  // each matched entry id. useInflectedSearchTerms subscribes and folds these
  // into the word's inflection list. addExtraForm dedupes, so this converges.
  useEffect(() => {
    if (displayTokens.length === 0) return;
    const base = baseCode(l2Code);
    for (const token of displayTokens) {
      const surface = token.text.trim();
      if (!surface || /^[\s\p{P}]+$/u.test(surface)) continue;
      const reported = new Set<string>();
      const reportEntry = (id: string) => {
        if (!id || reported.has(id)) return;
        reported.add(id);
        addExtraForm(base, id, surface);
      };
      for (const lemma of token.lemmas) {
        const entries = getCachedEntries(base, lemma.lemma);
        for (const e of entries ?? []) reportEntry(e.id);
      }
      const surfaceEntries = getCachedEntries(base, surface);
      for (const e of surfaceEntries ?? []) reportEntry(e.id);
    }
    // Re-run when the batch lookup resolves (cacheVersion) and when the
    // token set changes. Cache reads are live.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayTokens, cacheVersion, l2Code]);

  // ── Pre-visible: plain text, no tokenization yet ──
  if (!hasBeenVisible && !preloadedTokens) {
    return (
      <span ref={containerRef} lang={glyphLang} dir={contentDir} className={`${textColor ?? 'text-muted-foreground'} ${fontClass} ${cjkWrapClass}`} style={{ ...textStyle, opacity: 0.8 }}>
        {highlightPlainText(text, formats)}
      </span>
    );
  }

  if (loading) {
    return (
      <span ref={containerRef} lang={glyphLang} dir={contentDir} className={`${textColor ?? 'text-muted-foreground'} animate-pulse ${fontClass} ${cjkWrapClass}`} style={textStyle}>
        {highlightPlainText(text, formats)}
      </span>
    );
  }

  if (error && tokens.length <= 1) {
    return (
      <span ref={containerRef} lang={glyphLang} dir={contentDir} className={`${textColor ?? 'text-muted-foreground'} ${fontClass} ${cjkWrapClass}`} style={textStyle}>
        {highlightPlainText(text, formats)}
      </span>
    );
  }

  return (
    <>
      <span ref={containerRef} lang={glyphLang} dir={contentDir} className={`${textColor ?? ''} ${fontClass} ${cjkWrapClass} ${selectionDictionary ? '[-webkit-touch-callout:none]' : ''}`}>
      <span style={textStyle}>
        {/* Precompute karaoke word weights once, outside the per-token loop */}
        {(() => {
          let totalWeight = 0;
          const weights: number[] = [];
          if (karaokeProgress !== undefined) {
            for (const token of displayTokens) {
              if (token.lemmas.length === 0) {
                weights.push(0);
              } else {
                const w = karaokeWordWeight(token.text);
                weights.push(w);
                totalWeight += w;
              }
            }
          }
          let cumulativeWeight = 0;
          return displayTokens.map((token, i) => {
          const l2Settings = getL2(l2Code);
          const nextToken = displayTokens[i + 1];
          const nextTokenIsSeparator = nextToken ? isSeparatorToken(nextToken.text) : true;
          const phoneticsShow = phonetics === false
            ? false
            : (isPhoneticsEligible(l2Code)
              ? l2Settings.tokenSpan.phonetics.show
              : false);
          // In karaoke mode, light each word once its weighted time slot begins.
          let isKaraokeSpoken: boolean | undefined;
          if (karaokeProgress !== undefined) {
            if (token.lemmas.length > 0) {
              // Light a word as soon as its weighted time slot begins — the word
              // currently being spoken — instead of waiting until it has finished.
              isKaraokeSpoken = totalWeight > 0
                ? karaokeProgress >= cumulativeWeight / totalWeight
                : true;
              cumulativeWeight += weights[i] ?? 0;
            } else {
              // Separators/punctuation stay fully visible in karaoke mode.
              isKaraokeSpoken = true;
            }
          }
          const fmt = tokenFormatStyles?.[i] ?? null;
          // ADR-0039: flat ruby run when interlinear definitions are off — the
          // word's ruby segments render as bare inline siblings with no
          // per-token wrapper box, so readings can overhang/distribute against
          // neighboring glyphs. The boxed TokenSpan stays when interlinear
          // definitions are on: the definition slot needs a token column under
          // every word, which the flat run cannot express.
          const effectiveShowDefinition = showDefinition ?? l2Settings.tokenSpan.definition.show;
          const flat = !effectiveShowDefinition;
          const tokenSpan = (
            <TokenSpan
              key={i}
              token={token}
              l2Code={l2Code}
              l1Code={l1.code}
              phoneticsMode={phoneticsShow}
              phoneticsConditions={l2Settings.tokenSpan.phonetics.conditions}
              userLevel={typeof userLevel === 'number' ? userLevel : undefined}
              quickGloss={quickGloss ?? settingsTokenizedText.quickGloss}
              showDefinition={effectiveShowDefinition}
              mode={modeOverride ?? settingsTokenizedText.mode}
              byeonggi={byeonggi ?? l2Settings.display.byeonggi}
              isSelected={selectedToken === token}
              isSaved={highlightSaved === false ? false : tokenMatchesAnyForm(token, savedFormSet)}
              savedWordId={savedWordIdForToken(token)}
              isHighlighted={tokenMatchesHighlight(token)}
              nextTokenIsSeparator={nextTokenIsSeparator}
              onClick={(rect, el) => handleTokenClick(token, rect, el)}
              onHoverChange={onTokenHover && tokenRanges
                ? (hovering) => onTokenHover(hovering ? tokenRanges[i]! : null)
                : undefined}
              cacheVersion={cacheVersion}
              isKaraokeSpoken={isKaraokeSpoken}
              karaokeDimOpacity={karaokeDimOpacity}
              phoneticsOnHighlight={phoneticsOnHighlight}
              quickGlossOnHighlight={quickGlossOnHighlight}
              flat={flat}
              format={flat && fmt !== 'image' ? fmt : null}
            />
          );
          const withCjkBreak = (node: React.ReactNode) => (
            <React.Fragment key={i}>
              {cjkWrapClass && i > 0 ? <wbr /> : null}
              {node}
            </React.Fragment>
          );
          // Inline image: an `image` format range replaces its alt text with
          // the image, drawn inline in the line flow (SPEC-087 §2). Render it
          // once at the first token of the contiguous image run; the remaining
          // tokens of that run render nothing so the image takes their place.
          if (fmt === 'image') {
            if (tokenFormatStyles?.[i - 1] === 'image') return null;
            const url = imageTokenMap?.[i];
            if (!url) return null;
            return (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={url}
                alt=""
                className="mx-0.5 inline-block max-h-[1.2em] max-w-[12em] w-auto h-auto object-contain align-middle"
              />
            );
          }
          // Flat run: format styling is folded into the segment element
          // classes inside TokenSpan — no wrapper element, which would
          // re-create the per-token box (ADR-0039).
          if (flat) return withCjkBreak(tokenSpan);
          if (fmt === 'bold') return withCjkBreak(<strong className="font-semibold">{tokenSpan}</strong>);
          if (fmt === 'italic') return withCjkBreak(<em>{tokenSpan}</em>);
          if (fmt === 'highlight') {
            return withCjkBreak(
              <mark className="rounded-sm bg-primary/40 px-0.5 text-primary dark:bg-primary/60">
                {tokenSpan}
              </mark>
            );
          }
          if (fmt === 'code') {
            return withCjkBreak(<code className="rounded bg-muted px-1 font-mono text-[0.9em]">{tokenSpan}</code>);
          }
          if (fmt === 'strikethrough') {
            return withCjkBreak(<del className="line-through decoration-muted-foreground/60">{tokenSpan}</del>);
          }
          if (fmt === 'link') {
            return withCjkBreak(
              <span className="text-primary underline underline-offset-2 decoration-primary/40 hover:decoration-primary">
                {tokenSpan}
              </span>
            );
          }
          return withCjkBreak(tokenSpan);
        });
      })()}
      </span>

      {/* Dictionary popup */}
      {!disablePopup && selectedToken && (
        <DictionaryPopup
          token={selectedToken}
          l1Code={l1.code}
          l2Code={l2Code}
          context={{
            ...externalContext,
            form: selectedToken.text,
            text: selectedContextText ?? text,
          }}
          position={popupPosition ?? undefined}
          linkUrl={href && (onOpenLink || /^https?:\/\//i.test(href)) ? href : undefined}
          onOpenLink={onOpenLink}
          onClose={() => setSelectedToken(null)}
        />
      )}
      </span>

      {/* Selection dictionary popup — the selected text becomes the lookup term */}
      {selectionDictionary && textSelection && (
        <DictionaryPopup
          token={{ text: textSelection.text, lemmas: [] }}
          l1Code={l1.code}
          l2Code={l2Code}
          context={{
            ...externalContext,
            form: textSelection.text,
            text: selectedTextContext ?? text,
          }}
          position={textSelection.rect}
          linkUrl={href && (onOpenLink || /^https?:\/\//i.test(href)) ? href : undefined}
          onOpenLink={onOpenLink}
          extractPhrases
          onClose={clearTextSelection}
        />
      )}
    </>
  );
};

TokenizedText.displayName = 'TokenizedText';

export default TokenizedText;
