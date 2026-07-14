'use client';

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import type { LemmatizedToken, Lemma, SavedWordContext } from '@langplayer/shared';
import { DictionaryPopup } from './dictionary-popup';
import { useLanguage } from '@/providers/language-provider';
import { useSavedWordsContext } from '@/providers/saved-words-provider';
import { baseCode } from '@/lib/language-data';
import { PYTHON_API_URL } from '@/lib/api-url';
import type { TokenCache } from '@/lib/token-cache';

// Simple in-memory cache to avoid re-lemmatizing the same text
const lemmatizeCache = new Map<string, LemmatizedToken[]>();

export interface TokenizedTextProps {
  text: string;
  l2Code: string;
  /** Scale factor for text size (default: 1). Pass 0 to inherit from parent. */
  textScale?: number;
  /** Contextual info for word saving (subtitle line, video title, etc.) */
  context?: Partial<SavedWordContext>;
  /** Pre-populated token cache from /lemmatize-video-normalized */
  tokenCache?: TokenCache;
  /** Pre-loaded tokens — when set, skips the API call entirely. */
  tokens?: LemmatizedToken[];
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
  context: externalContext,
  tokenCache,
  tokens: preloadedTokens,
}) => {
  const { l1 } = useLanguage();
  const { savedWords } = useSavedWordsContext();
  const [tokens, setTokens] = useState<LemmatizedToken[]>(preloadedTokens ?? []);
  const [loading, setLoading] = useState(!preloadedTokens);
  const [error, setError] = useState<string | null>(null);
  const [selectedToken, setSelectedToken] = useState<LemmatizedToken | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Skip API call if tokens were pre-loaded
    if (preloadedTokens) {
      setTokens(preloadedTokens);
      setLoading(false);
      return;
    }

    // Cancel previous request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (!text.trim()) {
      setTokens([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setSelectedToken(null);

    const tokenize = async () => {
      try {
        // 1. In-memory lemmatize cache
        const cacheKey = `${l2Code}:${text}`;
        const cached = lemmatizeCache.get(cacheKey);
        if (cached) {
          if (!cancelled) { setTokens(cached); setLoading(false); }
          return;
        }

        // 2. Video token cache (from /lemmatize-video-normalized)
        if (tokenCache) {
          const videoCached = tokenCache.get(text);
          if (videoCached) {
            lemmatizeCache.set(cacheKey, videoCached);
            if (!cancelled) { setTokens(videoCached); setLoading(false); }
            return;
          }
        }

        // 3. Fall back to per-line API call
        const response = await fetch(`${PYTHON_API_URL}/lemmatize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, l2: baseCode(l2Code) }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!cancelled) {
          lemmatizeCache.set(cacheKey, data.tokens);
          setTokens(data.tokens);
          setLoading(false);
        }
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        if (!cancelled) {
          console.error('Tokenization error:', err);
          setError(err?.message ?? 'Tokenization failed');
          setTokens([{ text, lemmas: [] }]);
          setLoading(false);
        }
      }
    };

    tokenize();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [text, l2Code, preloadedTokens]);

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
    }
    return forms;
  }, [savedWords, l2Code]);

  if (loading) {
    return (
      <div className="text-muted-foreground animate-pulse" style={textScale ? { fontSize: `${textScale}rem` } : undefined}>
        {text}
      </div>
    );
  }

  if (error && tokens.length <= 1) {
    return (
      <div className="text-muted-foreground" style={textScale ? { fontSize: `${textScale}rem` } : undefined}>
        {text}
      </div>
    );
  }

  return (
    <div>
      <span className="leading-relaxed" style={textScale ? { fontSize: `${textScale}rem` } : undefined}>
        {tokens.map((token, i) => (
          <TokenSpan
            key={i}
            token={token}
            isSelected={selectedToken === token}
            isSaved={savedFormSet.has(token.text.toLowerCase())}
            onClick={() => handleTokenClick(token)}
          />
        ))}
      </span>

      {/* Dictionary popup */}
      {selectedToken && (
        <DictionaryPopup
          token={selectedToken}
          l1Code={l1.code}
          l2Code={l2Code}
          context={{
            form: selectedToken.text,
            text,
            ...externalContext,
          }}
          onClose={() => setSelectedToken(null)}
        />
      )}
    </div>
  );
};

/** Individual token span — rendered inline so whitespace tokens flow naturally. */
const TokenSpan: React.FC<{
  token: LemmatizedToken;
  isSelected: boolean;
  isSaved: boolean;
  onClick: () => void;
}> = ({ token, isSelected, isSaved, onClick }) => {
  const isWord = token.lemmas.length > 0;

  if (!isWord) {
    // Punctuation, spaces, newlines — render as raw text (inline, no wrapper).
    // Space tokens are already " " from the backend, so they act as natural
    // word separators for English/Korean and are absent for Chinese/Japanese.
    return <>{token.text}</>;
  }

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
          : isSaved
            ? 'bg-yellow-200/25 hover:bg-yellow-200/40'
            : 'hover:bg-muted/80'
        }
      `}
      title={token.lemmas.map(l => l.lemma).join(', ')}
    >
      {token.text}
    </span>
  );
};

TokenizedText.displayName = 'TokenizedText';

export default TokenizedText;
