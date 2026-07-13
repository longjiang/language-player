'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import type { LemmatizedToken, Lemma } from '@langplayer/shared';
import { DictionaryPopup } from './dictionary-popup';
import { useLanguage } from '@/providers/language-provider';
import { baseCode } from '@/lib/language-data';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:5001';

// Simple in-memory cache to avoid re-lemmatizing the same text
const lemmatizeCache = new Map<string, LemmatizedToken[]>();

export interface TokenizedTextProps {
  text: string;
  l2Code: string;
  /** Scale factor for text size (default: 1) */
  textScale?: number;
}

/**
 * Displays text with each word tokenized and lemmatized.
 * Tokens are clickable — clicking shows lemma info and enables dictionary lookup.
 */
export const TokenizedText: React.FC<TokenizedTextProps> = ({
  text,
  l2Code,
  textScale = 1,
}) => {
  const { l1 } = useLanguage();
  const [tokens, setTokens] = useState<LemmatizedToken[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedToken, setSelectedToken] = useState<LemmatizedToken | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
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
        // Check cache first
        const cacheKey = `${l2Code}:${text}`;
        const cached = lemmatizeCache.get(cacheKey);
        if (cached) {
          if (!cancelled) { setTokens(cached); setLoading(false); }
          return;
        }

        const response = await fetch(`${API_BASE}/lemmatize`, {
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
  }, [text, l2Code]);

  const handleTokenClick = useCallback((token: LemmatizedToken) => {
    setSelectedToken(prev => prev === token ? null : token);
  }, []);

  if (loading) {
    return (
      <div className="text-muted-foreground animate-pulse" style={{ fontSize: `${textScale}rem` }}>
        {text}
      </div>
    );
  }

  if (error && tokens.length <= 1) {
    return (
      <div className="text-muted-foreground" style={{ fontSize: `${textScale}rem` }}>
        {text}
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-end gap-x-0.5 leading-relaxed">
        {tokens.map((token, i) => (
          <TokenSpan
            key={i}
            token={token}
            textScale={textScale}
            isSelected={selectedToken === token}
            onClick={() => handleTokenClick(token)}
          />
        ))}
      </div>

      {/* Dictionary popup */}
      {selectedToken && (
        <DictionaryPopup
          token={selectedToken}
          l1Code={l1.code}
          l2Code={l2Code}
          onClose={() => setSelectedToken(null)}
        />
      )}
    </div>
  );
};

/** Individual token span */
const TokenSpan: React.FC<{
  token: LemmatizedToken;
  textScale: number;
  isSelected: boolean;
  onClick: () => void;
}> = ({ token, textScale, isSelected, onClick }) => {
  const isWord = token.lemmas.length > 0;

  if (!isWord) {
    // Punctuation or spaces — render as-is
    return (
      <span style={{ fontSize: `${textScale}rem` }}>
        {token.text}
      </span>
    );
  }

  return (
    <span
      onClick={onClick}
      className={`
        cursor-pointer rounded px-0.5 transition-colors
        ${isSelected
          ? 'bg-primary/20 text-primary'
          : 'hover:bg-muted/80'
        }
      `}
      style={{ fontSize: `${textScale}rem` }}
      title={token.lemmas.map(l => l.lemma).join(', ')}
    >
      {token.text}
    </span>
  );
};

TokenizedText.displayName = 'TokenizedText';

export default TokenizedText;
