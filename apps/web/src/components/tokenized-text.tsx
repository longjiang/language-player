'use client';

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import type { LemmatizedToken, SavedWordContext } from '@langplayer/shared';
import { DictionaryPopup } from './dictionary-popup';
import { useLanguage } from '@/providers/language-provider';
import { useSavedWordsContext } from '@/providers/saved-words-provider';
import { baseCode } from '@/lib/language-data';
import { PYTHON_API_URL } from '@/lib/api-url';
import { useSettingsContext } from '@/providers/settings-provider';
import { useProgressLevel } from '@/hooks/use-progress';
import type { TokenCache } from '@langplayer/shared';
import { enqueueLookupWords } from '@/lib/dictionary-cache';
import { isPhoneticsEligible, sentenceContaining, sentenceForToken } from '@langplayer/utils';
import { TokenSpan } from './token-span';
import type { FormatRange } from '@/lib/parse-markdown';
import { useSelectionPopup } from '@/hooks/use-selection-popup';
import { ZOOM_TO_REM } from '@/lib/text-scale';

// Re-exported for callers that imported the constant from this component
// before it moved to lib/text-scale.
export { ZOOM_TO_REM };

// Simple in-memory cache to avoid re-lemmatizing the same text
const lemmatizeCache = new Map<string, LemmatizedToken[]>();

// In-flight request deduplication — prevents thundering herd when many
// TokenizedText instances mount simultaneously and all hit the fallback.
const lemmatizeInflight = new Map<string, Promise<LemmatizedToken[]>>();

// ── Queued batch lemmatization ────────────────────────────────────────
// Visible TokenizedText instances enqueue their line; a short timer flushes
// the queue through /lemmatize-normalized/batch in one request instead of
// firing N per-line calls. Falls back to per-line requests on failure.
interface LemmatizeBatchItem {
  key: string;
  text: string;
  l2Code: string;
  resolve: (tokens: LemmatizedToken[]) => void;
  reject: (err: unknown) => void;
}

const lemmatizeBatchQueue: LemmatizeBatchItem[] = [];
const lemmatizeBatchPending = new Map<string, Promise<LemmatizedToken[]>>();
const LEMMATIZE_BATCH_MAX = 12;
const LEMMATIZE_BATCH_DELAY_MS = 60;
let lemmatizeBatchTimer: ReturnType<typeof setTimeout> | null = null;

/** Queue a line for batched lemmatization; resolves with its tokens. */
function enqueueLemmatize(text: string, l2Code: string): Promise<LemmatizedToken[]> {
  const key = `${l2Code}:${text}`;
  const existing = lemmatizeBatchPending.get(key);
  if (existing) return existing;

  const promise = new Promise<LemmatizedToken[]>((resolve, reject) => {
    lemmatizeBatchQueue.push({ key, text, l2Code, resolve, reject });
  });
  lemmatizeBatchPending.set(key, promise);
  scheduleLemmatizeBatchFlush();
  return promise;
}

function scheduleLemmatizeBatchFlush() {
  if (lemmatizeBatchTimer) return;
  lemmatizeBatchTimer = setTimeout(() => {
    lemmatizeBatchTimer = null;
    void flushLemmatizeBatch();
  }, LEMMATIZE_BATCH_DELAY_MS);
}

async function flushLemmatizeBatch() {
  // Drain the whole queue in chunks — lines beyond LEMMATIZE_BATCH_MAX that
  // enqueued before this flush must not be stranded until a later enqueue.
  while (lemmatizeBatchQueue.length > 0) {
    const items = lemmatizeBatchQueue.splice(0, LEMMATIZE_BATCH_MAX);
    if (items.length === 0) break;

    // Batch endpoint takes one language per call — group the queue by l2.
    const byL2 = new Map<string, LemmatizeBatchItem[]>();
    for (const item of items) {
      const group = byL2.get(item.l2Code);
      if (group) group.push(item);
      else byL2.set(item.l2Code, [item]);
    }

    for (const [l2Code, group] of byL2) {
      try {
        const res = await fetch(`${PYTHON_API_URL}/lemmatize-normalized/batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ texts: group.map((g) => g.text), l2: baseCode(l2Code) }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const results: LemmatizedToken[][] = data?.results ?? [];
        group.forEach((item, i) => {
          const tokens = results[i] ?? [];
          lemmatizeCache.set(item.key, tokens);
          item.resolve(tokens);
          lemmatizeBatchPending.delete(item.key);
        });
      } catch (err) {
        // Batch request failed — fall back to per-line requests so nothing is lost.
        await Promise.allSettled(group.map(async (item) => {
          try {
            const tokens = await fetchLemmatizeLine(item.text, item.l2Code);
            lemmatizeCache.set(item.key, tokens);
            item.resolve(tokens);
          } catch (lineErr) {
            item.reject(lineErr);
          } finally {
            lemmatizeBatchPending.delete(item.key);
          }
        }));
      }
    }
  }
}

/** Single-line /lemmatize-normalized request (batch failure fallback). */
async function fetchLemmatizeLine(text: string, l2Code: string): Promise<LemmatizedToken[]> {
  const res = await fetch(`${PYTHON_API_URL}/lemmatize-normalized`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, l2: baseCode(l2Code) }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.tokens as LemmatizedToken[];
}

/** True when a token is whitespace-only or punctuation-only — used to decide
 *  whether a quick gloss needs a trailing space to separate it from the next word. */
function isSeparatorToken(text: string): boolean {
  const t = text.trim();
  return t === '' || /^[\p{P}]+$/u.test(t);
}

/**
 * Rough speaking-time weight for karaoke pacing, used when we have no
 * per-word timing data. CJK words: one unit per character (each hanzi/kana/
 * hangul ≈ one syllable/mora). Latin/Cyrillic/Greek: one unit per vowel
 * group. Everything else (Thai, Arabic, Hebrew, …): character count.
 * Long words keep the highlight longer; short words flip quickly.
 */
function karaokeWordWeight(text: string): number {
  const t = text.trim();
  if (!t) return 0;

  // CJK: character count is a near-exact syllable/mora proxy.
  const cjk = t.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu);
  if (cjk && cjk.length >= t.length * 0.5) return cjk.length;

  // Latin/Cyrillic/Greek: vowel groups are a decent syllable proxy.
  const vowelGroups = t.match(/[aeiouyà-öø-ÿаеёиоуыэюяіїєæœαεηιουωάέήίόύώϊϋΐΰ]+/giu);
  if (vowelGroups && vowelGroups.length > 0) return Math.max(1, vowelGroups.length);

  // Vowel-less scripts: fall back to character count.
  const significant = t.replace(/[\s\p{P}]/gu, '');
  return significant ? Math.max(1, significant.length) : 0;
}

export interface TokenizedTextProps {
  text: string;
  l2Code: string;
  /**
   * Explicit text size in rem. When omitted, uses the user's zoom setting
   * from SettingsContext (tokenizedText.zoom). Pass 0 to inherit from parent
   * (no inline font-size set).
   */
  textScale?: number;
  /** Font family override: 'default' (inherit), 'serif', or 'sans-serif'. */
  typeFace?: 'default' | 'serif' | 'sans-serif';
  /**
   * Line-height (leading) for tokenized text. Defaults to 'relaxed' (1.625×).
   * Pass 'none' to inherit from the parent container.
   */
  leading?: 'relaxed' | 'normal' | 'tight' | 'snug' | 'loose' | 'none';
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
  /** Karaoke progress for the active subtitle line: 0 (start) to 1 (end). When undefined, karaoke is off. */
  karaokeProgress?: number;
  /** When false, phonetics are suppressed on highlighted tokens. Used by the SRS
   *  review page so the target word's reading stays hidden until the card is
   *  revealed. Defaults to true — highlighting alone does not hide readings. */
  phoneticsOnHighlight?: boolean;
  /** When false, the quick gloss is suppressed on highlighted tokens. Used by the
   *  SRS review page so the target word's gloss stays hidden until the card is
   *  revealed. Defaults to true — highlighting alone does not hide a saved word's
   *  gloss. */
  quickGlossOnHighlight?: boolean;
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
}

/**
 * Displays text with each word tokenized and lemmatized.
 * Tokens are clickable — clicking shows lemma info and enables dictionary lookup.
 * Passes context through for word saving (video title, subtitle line, etc.).
 */
/** Leading prop → Tailwind class. 'none' = inherit from parent (no class applied). */
const LEADING_CLASS: Record<string, string> = {
  relaxed: 'leading-relaxed',
  normal: 'leading-normal',
  tight: 'leading-tight',
  snug: 'leading-snug',
  loose: 'leading-loose',
};

export const TokenizedText: React.FC<TokenizedTextProps> = ({
  text,
  l2Code,
  textScale,
  typeFace = 'default',
  leading = 'relaxed',
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
  karaokeProgress,
  phoneticsOnHighlight = true,
  quickGlossOnHighlight = true,
  highlightSaved,
  quickGloss,
  showDefinition,
  byeonggi,
  selectionDictionary = false,
}) => {
  // Map typeFace to Tailwind font-family class
  const fontClass =
    typeFace === 'serif' ? 'font-serif' :
    typeFace === 'sans-serif' ? 'font-sans' : '';
  const leadingClass = LEADING_CLASS[leading] ?? '';
  const { l1 } = useLanguage();
  const { savedWords } = useSavedWordsContext();
  const { getL2, tokenizedText: settingsTokenizedText } = useSettingsContext();
  const userLevel = useProgressLevel(l2Code);

  // Resolve effective font size:
  //   - textScale explicitly provided → use as absolute rem value
  //   - textScale omitted        → use user's zoom setting from SettingsContext
  //   - textScale === 0          → inherit (no inline fontSize set)
  const effectiveScale = textScale ?? (ZOOM_TO_REM[settingsTokenizedText.zoom] ?? 1);
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

  // Map markdown format ranges onto token indices by reconstructing character
  // offsets from the surface tokens (they concatenate back to `text`). Bails
  // out entirely when the reconstruction doesn't match, so formatting can
  // never corrupt token alignment.
  const tokenFormatStyles = useMemo(() => {
    if (!formats?.length) return null;
    const total = tokens.reduce((sum, t) => sum + t.text.length, 0);
    if (total !== text.length) return null;
    let pos = 0;
    const out: Array<'bold' | 'italic' | 'code' | 'link' | 'highlight' | null> = [];
    for (const token of tokens) {
      let fmt: 'bold' | 'italic' | 'code' | 'link' | 'highlight' | null = null;
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
  }, [tokens, formats, text]);

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
    if (loading || error || tokens.length === 0) return;

    const uniqueLemmas = new Map<string, string>(); // text → part_of_speech
    for (const token of tokens) {
      for (const lemma of token.lemmas) {
        const t = lemma.lemma.trim();
        // Skip whitespace, punctuation, and single-char non-word tokens
        if (!t || t.length === 0 || /^[\s\p{P}]+$/u.test(t)) continue;
        if (!uniqueLemmas.has(t)) {
          uniqueLemmas.set(t, lemma.part_of_speech ?? '');
        }
      }
      // Also include the surface form if it differs from all lemmas
      const surface = token.text.trim();
      if (surface && surface.length > 0 && !/^[\s\p{P}]+$/u.test(surface) && !uniqueLemmas.has(surface)) {
        uniqueLemmas.set(surface, '');
      }
    }

    if (uniqueLemmas.size === 0) return;

    const words = Array.from(uniqueLemmas.keys()).map((text) => ({
      text,
      l2Code: baseCode(l2Code),
    }));

    // Queue with other visible lines' lemmas so one flush covers many lines
    // (still lazy — only lemmatized, i.e. visible, lines enqueue anything).
    enqueueLookupWords(words, PYTHON_API_URL).then(() => setCacheVersion(v => v + 1));
  }, [tokens, loading, error, l2Code]);

  const handleTokenClick = useCallback((token: LemmatizedToken, rect?: DOMRect) => {
    setSelectedToken(prev => prev === token ? null : token);
    if (rect) {
      setPopupPosition({ x: rect.left, y: rect.top, width: rect.width, height: rect.height });
    }
    // A token popup supersedes the selection popup.
    clearTextSelection();
  }, [clearTextSelection]);

  // A new text selection supersedes the token dictionary popup.
  useEffect(() => {
    if (textSelection) setSelectedToken(null);
  }, [textSelection]);

  // Sentence containing the selected token — limits the saved context (and the
  // AI/image-search context) to the sentence the word was clicked in.
  const selectedContextText = useMemo(() => {
    if (!selectedToken) return null;
    return sentenceForToken(text, tokens, selectedToken, baseCode(l2Code));
  }, [selectedToken, text, tokens, l2Code]);

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
    }
    return forms;
  }, [savedWords, l2Code]);

  // ── Pre-visible: plain text, no tokenization yet ──
  if (!hasBeenVisible && !preloadedTokens) {
    return (
      <span ref={containerRef} className={`text-muted-foreground/80 ${fontClass} ${leadingClass}`} style={effectiveScale ? { fontSize: `${effectiveScale}rem` } : undefined}>
        {text}
      </span>
    );
  }

  if (loading) {
    return (
      <span ref={containerRef} className={`text-muted-foreground animate-pulse ${fontClass} ${leadingClass}`} style={effectiveScale ? { fontSize: `${effectiveScale}rem` } : undefined}>
        {text}
      </span>
    );
  }

  if (error && tokens.length <= 1) {
    return (
      <span ref={containerRef} className={`text-muted-foreground ${fontClass} ${leadingClass}`} style={effectiveScale ? { fontSize: `${effectiveScale}rem` } : undefined}>
        {text}
      </span>
    );
  }

  return (
    <>
      <span ref={containerRef} className={fontClass}>
      <span className={leadingClass} style={effectiveScale ? { fontSize: `${effectiveScale}rem` } : undefined}>
        {/* Precompute karaoke word weights once, outside the per-token loop */}
        {(() => {
          let totalWeight = 0;
          const weights: number[] = [];
          if (karaokeProgress !== undefined) {
            for (const token of tokens) {
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
          return tokens.map((token, i) => {
          const l2Settings = getL2(l2Code);
          const nextToken = tokens[i + 1];
          const nextTokenIsSeparator = nextToken ? isSeparatorToken(nextToken.text) : true;
          const phoneticsShow = isPhoneticsEligible(l2Code)
            ? l2Settings.tokenSpan.phonetics.show
            : false;
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
              showDefinition={showDefinition ?? l2Settings.tokenSpan.definition.show}
              mode={settingsTokenizedText.mode}
              byeonggi={byeonggi ?? l2Settings.display.byeonggi}
              isSelected={selectedToken === token}
              isSaved={highlightSaved === false ? false : savedFormSet.has(token.text.toLowerCase())}
              isHighlighted={
                (!!highlightForm && token.text === highlightForm) ||
                (!!highlightForms && highlightForms.some((f) => f === token.text))
              }
              nextTokenIsSeparator={nextTokenIsSeparator}
              onClick={(rect) => handleTokenClick(token, rect)}
              cacheVersion={cacheVersion}
              isKaraokeSpoken={isKaraokeSpoken}
              phoneticsOnHighlight={phoneticsOnHighlight}
              quickGlossOnHighlight={quickGlossOnHighlight}
            />
          );
          const fmt = tokenFormatStyles?.[i] ?? null;
          if (fmt === 'bold') return <strong key={i} className="font-semibold">{tokenSpan}</strong>;
          if (fmt === 'italic') return <em key={i}>{tokenSpan}</em>;
          if (fmt === 'highlight') {
            return (
              <mark key={i} className="rounded-sm bg-primary/40 px-0.5 text-primary dark:bg-primary/60">
                {tokenSpan}
              </mark>
            );
          }
          if (fmt === 'code') {
            return <code key={i} className="rounded bg-muted px-1 font-mono text-[0.9em]">{tokenSpan}</code>;
          }
          if (fmt === 'link') {
            return (
              <span key={i} className="text-primary underline underline-offset-2 decoration-primary/40 hover:decoration-primary">
                {tokenSpan}
              </span>
            );
          }
          return tokenSpan;
        });
      })()}
      </span>

      {/* Dictionary popup */}
      {selectedToken && (
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
