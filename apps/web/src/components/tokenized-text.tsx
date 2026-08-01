'use client';

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import type { LemmatizedToken, SavedWordContext } from '@langplayer/shared';
import { DictionaryPopup } from './dictionary-popup';
import { useLanguage } from '@/providers/language-provider';
import { useSavedWordsContext } from '@/providers/saved-words-provider';
import { baseCode } from '@/lib/language-data';
import { PYTHON_API_URL } from '@/lib/api-url';
import { useSettingsContext } from '@/providers/settings-provider';
import { log, logerr } from '@/lib/logger';
import { useProgressLevel } from '@/hooks/use-progress';
import type { TokenCache } from '@langplayer/shared';
import { enqueueLookupWords } from '@/lib/dictionary-cache';
import { isPhoneticsEligible } from '@langplayer/utils';
import { TokenSpan } from './token-span';

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
  const items = lemmatizeBatchQueue.splice(0, LEMMATIZE_BATCH_MAX);
  if (items.length === 0) return;

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
   * Line-height (leading) for tokenized text. Defaults to 'loose' (2×).
   * Pass 'none' to inherit from the parent container.
   */
  leading?: 'relaxed' | 'normal' | 'tight' | 'snug' | 'loose' | 'none';
  /** Contextual info for word saving (subtitle line, video title, etc.) */
  context?: Partial<SavedWordContext>;
  /** Pre-populated token cache from /lemmatize-video-normalized */
  tokenCache?: TokenCache;
  /** Whether the token cache has finished loading. When false and tokenCache
   *  is provided, the component shows plain text without calling the API. */
  tokenCacheLoaded?: boolean;
  /** Pre-loaded tokens — when set, skips the API call entirely. */
  tokens?: LemmatizedToken[];
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
}

/**
 * Displays text with each word tokenized and lemmatized.
 * Tokens are clickable — clicking shows lemma info and enables dictionary lookup.
 * Passes context through for word saving (video title, subtitle line, etc.).
 */
/** Map zoom index (0–7) to rem values: 1rem (16px) to 2.25rem (36px). */
const ZOOM_TO_REM = [1, 1.125, 1.25, 1.375, 1.5, 1.75, 2, 2.25] as const;

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
  leading = 'loose',
  context: externalContext,
  tokenCache,
  tokenCacheLoaded,
  tokens: preloadedTokens,
  highlightForm,
  highlightForms,
  karaokeProgress,
  phoneticsOnHighlight = true,
  quickGlossOnHighlight = true,
  highlightSaved,
  quickGloss,
  showDefinition,
  byeonggi,
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
  const [hasBeenVisible, setHasBeenVisible] = useState(false);
  const [cacheVersion, setCacheVersion] = useState(0);
  const containerRef = useRef<HTMLSpanElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const loadingRef = useRef(false); // prevent concurrent fetches
  const lastTextRef = useRef(text); // avoid redundant tokenize re-triggers
  const tokenCacheRef = useRef(tokenCache); // stable access without deps churn
  tokenCacheRef.current = tokenCache;

  // Debug: log every TokenizedText mount (text included, so we can verify
  // tokenization only starts after the explain stream ends).
  useEffect(() => {
    log('TokenizedText mounted', { chars: text.length, preview: text.slice(0, 60) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          logerr('Tokenization error:', err);
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
  }, [text, l2Code, preloadedTokens, tokenCacheLoaded, hasBeenVisible]);

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
  }, [tokens, loading, error, l2Code, l1.code]);

  const handleTokenClick = useCallback((token: LemmatizedToken) => {
    setSelectedToken(prev => prev === token ? null : token);
  }, []);

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
          return (
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
              onClick={() => handleTokenClick(token)}
              cacheVersion={cacheVersion}
              isKaraokeSpoken={isKaraokeSpoken}
              phoneticsOnHighlight={phoneticsOnHighlight}
              quickGlossOnHighlight={quickGlossOnHighlight}
            />
          );
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
            form: selectedToken.text,
            text: text,
            ...externalContext,
          }}
          onClose={() => setSelectedToken(null)}
        />
      )}
    </span>
  );
};

TokenizedText.displayName = 'TokenizedText';

export default TokenizedText;
