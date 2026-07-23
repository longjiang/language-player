import React, { useEffect, useState, useRef } from 'react';
import { Text } from 'react-native';
import { PYTHON_API_URL } from '@/lib/api-url';
import type { TokenCache } from '@langplayer/utils';
import type { LemmatizedToken } from '@langplayer/shared';

// ── Shared in-memory lemmatize cache ──────────────────
// All TokenizedText instances share this Map, so if two components
// render the same text, only one API call is made.
const lemmatizeCache = new Map<string, LemmatizedToken[]>();

export interface TokenizedTextProps {
  text: string;
  l2Code: string;
  highlightTerms?: string[];
  onWordPress?: (word: string) => void;
  /** Pre-computed lemmatized tokens — when set, skips all API calls. */
  tokens?: LemmatizedToken[];
  /** Video-level token cache from /lemmatize-video-normalized (optional optimization). */
  tokenCache?: TokenCache;
}

/**
 * Renders text as tappable word tokens with server-side lemmatization.
 *
 * When `tokens` is provided, uses those directly (pre-lemmatized).
 * Otherwise, auto-fetches from `POST /lemmatize-normalized`, checking:
 *   1. Video token cache (if `tokenCache` provided)
 *   2. Shared in-memory cache (cross-component dedup)
 *   3. Server API call
 *
 * Falls back to basic CJK/whitespace splitting while the server request
 * is in flight or on error.
 */
export function TokenizedText({ text, l2Code, highlightTerms, onWordPress, tokens: preloadedTokens, tokenCache }: TokenizedTextProps) {
  const [tokens, setTokens] = useState<LemmatizedToken[]>(preloadedTokens ?? []);
  const [loading, setLoading] = useState(!preloadedTokens);
  const abortRef = useRef<AbortController | null>(null);
  const loadingRef = useRef(false);
  const lastTextRef = useRef(text);

  // ── Preloaded tokens: use directly ──
  useEffect(() => {
    if (preloadedTokens) {
      setTokens(preloadedTokens);
      setLoading(false);
    }
  }, [preloadedTokens]);

  // ── Auto-fetch tokens when no preloaded tokens ──
  useEffect(() => {
    // Skip if tokens were preloaded externally
    if (preloadedTokens) return;

    const effectiveText = text;
    if (!effectiveText.trim()) {
      setTokens([]);
      setLoading(false);
      return;
    }

    // Skip if text hasn't changed
    if (effectiveText === lastTextRef.current && tokens.length > 0) return;
    lastTextRef.current = effectiveText;

    const cacheKey = `${l2Code}:${effectiveText}`;

    // 1. Check video token cache
    if (tokenCache) {
      const cached = tokenCache.get(effectiveText);
      if (cached && cached.length > 0) {
        lemmatizeCache.set(cacheKey, cached);
        setTokens(cached);
        setLoading(false);
        return;
      }
    }

    // 2. Check shared in-memory cache
    const memCached = lemmatizeCache.get(cacheKey);
    if (memCached && memCached.length > 0) {
      setTokens(memCached);
      setLoading(false);
      return;
    }

    // Prevent concurrent fetches for the same text
    if (loadingRef.current) return;
    loadingRef.current = true;

    // Cancel previous in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    let cancelled = false;
    setLoading(true);

    const fetchTokens = async () => {
      try {
        const response = await fetch(`${PYTHON_API_URL}/lemmatize-normalized`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: effectiveText, l2: l2Code }),
          signal: controller.signal,
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        if (!cancelled) {
          const serverTokens = data.tokens ?? [];
          lemmatizeCache.set(cacheKey, serverTokens);
          setTokens(serverTokens);
          setLoading(false);
          loadingRef.current = false;
        }
      } catch (err: any) {
        if (err.name === 'AbortError') { loadingRef.current = false; return; }
        if (!cancelled) {
          console.warn('[TokenizedText] Tokenization failed, using fallback:', err.message);
          setLoading(false);
          loadingRef.current = false;
        }
      }
    };

    fetchTokens();

    return () => {
      cancelled = true;
      controller.abort();
      loadingRef.current = false;
    };
  }, [text, l2Code, preloadedTokens, tokenCache]);

  // ── Abort on unmount ──
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // ── Render server tokens ──
  if (tokens.length > 0) {
    return (
      <Text className="text-base leading-relaxed text-foreground">
        {tokens.map((token, i) => {
          const word = token.text;
          const isHighlighted = highlightTerms?.some((t) => t === word);
          return (
            <Text
              key={i}
              onPress={() => onWordPress?.(word)}
              className={isHighlighted ? 'font-bold text-primary' : ''}
            >
              {word}
            </Text>
          );
        })}
      </Text>
    );
  }

  // ── Loading: show plain text ──
  if (loading) {
    return <Text className="text-base leading-relaxed text-foreground">{text}</Text>;
  }

  // ── Fallback: basic splitting (no server tokens available) ──
  const isCJK = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/.test(text);

  if (isCJK) {
    const chars = [...text];
    return (
      <Text className="text-base leading-relaxed text-foreground">
        {chars.map((char, i) => {
          const isHighlighted = highlightTerms?.some((t) => char === t);
          return (
            <Text
              key={i}
              onPress={() => onWordPress?.(char)}
              className={isHighlighted ? 'font-bold text-primary' : ''}
            >
              {char}
            </Text>
          );
        })}
      </Text>
    );
  }

  const words = text.split(/(\s+)/);
  return (
    <Text className="text-base leading-relaxed text-foreground">
      {words.map((word, i) => {
        const trimmed = word.trim();
        const isHighlighted = highlightTerms?.some((t) => t === trimmed);
        return (
          <Text
            key={i}
            onPress={() => trimmed && onWordPress?.(trimmed)}
            className={isHighlighted ? 'font-bold text-primary' : ''}
          >
            {word}
          </Text>
        );
      })}
    </Text>
  );
}
