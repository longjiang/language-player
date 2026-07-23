'use client';

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import type { LemmatizedToken, Lemma, SavedWordContext } from '@langplayer/shared';
import { DictionaryPopup } from './dictionary-popup';
import { useLanguage } from '@/providers/language-provider';
import { useSavedWordsContext } from '@/providers/saved-words-provider';
import { baseCode } from '@/lib/language-data';
import { PYTHON_API_URL } from '@/lib/api-url';
import { getUseTraditional } from '@/lib/settings';
import { useSettingsContext } from '@/providers/settings-provider';
import { buildRuby } from '@langplayer/utils';
import type { RubySegment } from '@langplayer/utils';
import type { TokenCache } from '@langplayer/shared';

// Simple in-memory cache to avoid re-lemmatizing the same text
const lemmatizeCache = new Map<string, LemmatizedToken[]>();

export interface TokenizedTextProps {
  text: string;
  l2Code: string;
  /** Scale factor for text size (default: 1). Pass 0 to inherit from parent. */
  textScale?: number;
  /** Font family override: 'default' (inherit), 'serif', or 'sans-serif'. */
  typeFace?: 'default' | 'serif' | 'sans-serif';
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
}

/**
 * Displays text with each word tokenized and lemmatized.
 * Tokens are clickable — clicking shows lemma info and enables dictionary lookup.
 * Passes context through for word saving (video title, subtitle line, etc.).
 */
export const TokenizedText: React.FC<TokenizedTextProps> = ({
  text,
  l2Code,
  textScale = 1,
  typeFace = 'default',
  context: externalContext,
  tokenCache,
  tokenCacheLoaded,
  tokens: preloadedTokens,
  highlightForm,
  highlightForms,
}) => {
  // Map typeFace to Tailwind font-family class
  const fontClass =
    typeFace === 'serif' ? 'font-serif' :
    typeFace === 'sans-serif' ? 'font-sans' : '';
  const { l1 } = useLanguage();
  const { savedWords } = useSavedWordsContext();
  const { getL2 } = useSettingsContext();
  const [tokens, setTokens] = useState<LemmatizedToken[]>(preloadedTokens ?? []);
  const [loading, setLoading] = useState(!preloadedTokens);
  const [error, setError] = useState<string | null>(null);
  const [selectedToken, setSelectedToken] = useState<LemmatizedToken | null>(null);
  const [convertedText, setConvertedText] = useState(text);
  const [converting, setConverting] = useState(false);
  const [hasBeenVisible, setHasBeenVisible] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const loadingRef = useRef(false); // prevent concurrent fetches
  const lastTextRef = useRef(text); // avoid redundant convert+tokenize
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

  // Convert text to traditional if user prefers traditional and L2 is Chinese.
  // OpenCC is lazy-loaded only when needed. Conversion is idempotent so
  // already-traditional text (e.g. from the reader page) is a no-op.
  useEffect(() => {
    // Skip if text hasn't changed (prevents re-triggering on parent re-renders)
    if (text === lastTextRef.current) return;
    lastTextRef.current = text;

    let cancelled = false;

    async function convert() {
      const isChinese = baseCode(l2Code) === 'zh';
      if (!isChinese || !getUseTraditional()) {
        setConvertedText(text);
        return;
      }

      setConverting(true);
      const { toTraditional } = await import('@/lib/chinese-script');
      const result = await toTraditional(text);
      if (!cancelled) {
        setConvertedText(result);
        setConverting(false);
      }
    }

    convert();
    return () => { cancelled = true; };
  }, [text, l2Code]);

  useEffect(() => {
    // Skip API call if tokens were pre-loaded
    if (preloadedTokens) {
      setTokens(preloadedTokens);
      setLoading(false);
      return;
    }

    // Wait for script conversion to finish
    if (converting) return;

    // Lazy tokenization: don't fetch until visible
    if (!hasBeenVisible) return;

    const effectiveText = convertedText;

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

        // 3. Fall back to per-line API call
        const response = await fetch(`${PYTHON_API_URL}/lemmatize-normalized`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: effectiveText, l2: baseCode(l2Code) }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!cancelled) {
          lemmatizeCache.set(cacheKey, data.tokens);
          setTokens(data.tokens);
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
  }, [convertedText, converting, l2Code, preloadedTokens, tokenCacheLoaded, hasBeenVisible]);

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
      <span ref={containerRef} className={`text-muted-foreground/80 ${fontClass}`} style={textScale ? { fontSize: `${textScale}rem` } : undefined}>
        {convertedText}
      </span>
    );
  }

  if (loading || converting) {
    return (
      <span ref={containerRef} className={`text-muted-foreground animate-pulse ${fontClass}`} style={textScale ? { fontSize: `${textScale}rem` } : undefined}>
        {convertedText}
      </span>
    );
  }

  if (error && tokens.length <= 1) {
    return (
      <span ref={containerRef} className={`text-muted-foreground ${fontClass}`} style={textScale ? { fontSize: `${textScale}rem` } : undefined}>
        {convertedText}
      </span>
    );
  }

  return (
    <span ref={containerRef} className={fontClass}>
      <span className="leading-relaxed" style={textScale ? { fontSize: `${textScale}rem` } : undefined}>
        {tokens.map((token, i) => {
          const l2Settings = getL2(l2Code);
          const phoneticsShow = l2Settings.tokenSpan.phonetics.show;
          const showPhonetics = phoneticsShow !== false;
          return (
            <TokenSpan
              key={i}
              token={token}
              l2Code={l2Code}
              showPhonetics={showPhonetics}
              isSelected={selectedToken === token}
              isSaved={savedFormSet.has(token.text.toLowerCase())}
              isHighlighted={
                (!!highlightForm && token.text === highlightForm) ||
                (!!highlightForms && highlightForms.some((f) => f === token.text))
              }
              onClick={() => handleTokenClick(token)}
            />
          );
        })}
      </span>

      {/* Dictionary popup */}
      {selectedToken && (
        <DictionaryPopup
          token={selectedToken}
          l1Code={l1.code}
          l2Code={l2Code}
          context={{
            form: selectedToken.text,
            text: convertedText,
            ...externalContext,
          }}
          onClose={() => setSelectedToken(null)}
        />
      )}
    </span>
  );
};

/** Individual token span — rendered inline so whitespace tokens flow naturally. */
const TokenSpan: React.FC<{
  token: LemmatizedToken;
  l2Code: string;
  showPhonetics: boolean;
  isSelected: boolean;
  isSaved: boolean;
  isHighlighted: boolean;
  onClick: () => void;
}> = ({ token, l2Code, showPhonetics, isSelected, isSaved, isHighlighted, onClick }) => {
  // ── Structural tokens: newlines → <br />, spaces/punctuation → raw text ──
  if (token.text === '\n' || token.text === '\r') {
    return <br />;
  }

  const isWord = token.lemmas.length > 0;

  if (!isWord) {
    // Punctuation, spaces — render as raw text (inline, no wrapper).
    // Space tokens are already " " from the backend, so they act as natural
    // word separators for English/Korean and are absent for Chinese/Japanese.
    return <>{token.text}</>;
  }

  // ── Ruby text (phonetic guide) — hidden on highlighted forms for cleaner display ──
  const hasPhonetics = !isHighlighted && showPhonetics && token.pronunciation && token.pronunciation !== token.text;

  const rubySegments: RubySegment[] | null = hasPhonetics
    ? buildRuby(token.text, token.pronunciation!, l2Code)
    : null;

  return (
    <span
      onClick={(e) => {
        e.stopPropagation(); // prevent line-level click from seeking
        onClick();
      }}
      className={`
        cursor-pointer rounded transition-colors
        ${isSelected
          ? 'bg-primary/20 text-primary'
          : isHighlighted
            ? 'bg-primary/15 text-primary font-semibold ring-1 ring-primary/30'
            : isSaved
              ? 'bg-yellow-200/25 hover:bg-yellow-200/40'
              : 'hover:bg-muted/80'
        }
      `}
      title={token.lemmas.map(l => l.lemma).join(', ')}
    >
      {rubySegments ? rubySegments.map((seg, j) =>
        seg.reading ? (
          <ruby key={j}>{seg.text}<rt>{seg.reading}</rt></ruby>
        ) : (
          <React.Fragment key={j}>{seg.text}</React.Fragment>
        )
      ) : token.text}
    </span>
  );
};

TokenizedText.displayName = 'TokenizedText';

export default TokenizedText;
