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
import { bulkLookupWords } from '@/lib/dictionary-cache';
import { isPhoneticsEligible } from '@langplayer/utils';
import { TokenSpan } from './token-span';

// Simple in-memory cache to avoid re-lemmatizing the same text
const lemmatizeCache = new Map<string, LemmatizedToken[]>();

// In-flight request deduplication — prevents thundering herd when many
// TokenizedText instances mount simultaneously and all hit the fallback.
const lemmatizeInflight = new Map<string, Promise<LemmatizedToken[]>>();

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
    // show plain text and wait — don't fall back to per-line API calls.
    // When tokenCacheLoaded flips to true, this effect re-fires and tries the
    // now-populated cache.
    if (tokenCache && tokenCacheLoaded === false) {
      setTokens([{ text: effectiveText, lemmas: [] }]);
      setLoading(false);
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

        // 3. Fall back to per-line API call — with in-flight deduplication
        // so that concurrent TokenizedText instances for the same text
        // share a single request instead of each launching their own.
        let inflight = lemmatizeInflight.get(cacheKey);
        if (!inflight) {
          inflight = fetch(`${PYTHON_API_URL}/lemmatize-normalized`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: effectiveText, l2: baseCode(l2Code) }),
            signal: controller.signal,
          }).then(async (response) => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            lemmatizeCache.set(cacheKey, data.tokens);
            return data.tokens as LemmatizedToken[];
          }).finally(() => {
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
          console.error('Tokenization error:', err);
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

    bulkLookupWords(words, PYTHON_API_URL).then(() => setCacheVersion(v => v + 1));
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
        {/* Precompute karaoke word count once, outside the per-token loop */}
        {(() => {
          let wordCount = 0;
          let spokenWordCount = 0;
          if (karaokeProgress !== undefined) {
            wordCount = tokens.filter(t => t.lemmas.length > 0).length;
            // Use Math.floor so a word doesn't light until its time has elapsed
            spokenWordCount = Math.floor(karaokeProgress * wordCount);
          }
          let wordIndexSoFar = 0;
          return tokens.map((token, i) => {
          const l2Settings = getL2(l2Code);
          const phoneticsShow = isPhoneticsEligible(l2Code)
            ? l2Settings.tokenSpan.phonetics.show
            : false;
          // In karaoke mode, determine if this token has been spoken using a O(n) counter
          let isKaraokeSpoken: boolean | undefined;
          if (karaokeProgress !== undefined) {
            if (token.lemmas.length > 0) wordIndexSoFar++;
            isKaraokeSpoken = wordIndexSoFar <= spokenWordCount;
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
              quickGloss={settingsTokenizedText.quickGloss}
              showDefinition={l2Settings.tokenSpan.definition.show}
              mode={settingsTokenizedText.mode}
              byeonggi={l2Settings.display.byeonggi}
              isSelected={selectedToken === token}
              isSaved={savedFormSet.has(token.text.toLowerCase())}
              isHighlighted={
                (!!highlightForm && token.text === highlightForm) ||
                (!!highlightForms && highlightForms.some((f) => f === token.text))
              }
              onClick={() => handleTokenClick(token)}
              cacheVersion={cacheVersion}
              isKaraokeSpoken={isKaraokeSpoken}
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
