import React, { useEffect, useState, useRef } from 'react';
import { View, Text } from 'react-native';
import { PYTHON_API_URL } from '@/lib/api-url';
import type { TokenCache } from '@langplayer/utils';
import { buildRuby } from '@langplayer/utils';
import type { RubySegment } from '@langplayer/utils';
import type { LemmatizedToken } from '@langplayer/shared';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { DictionaryPopup } from '@/components/dictionary/DictionaryPopup';

// ── Shared in-memory lemmatize cache ──────────────────
// All TokenizedText instances share this Map, so if two components
// render the same text, only one API call is made.
const lemmatizeCache = new Map<string, LemmatizedToken[]>();

export interface TokenizedTextProps {
  text: string;
  l2Code: string;
  highlightTerms?: string[];
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
 * Includes a built-in dictionary popup — tapping any word opens the
 * dictionary lookup. No `onWordPress` prop needed (matches Next.js).
 *
 * While loading or on error, shows plain undivided text.
 */
export function TokenizedText({ text, l2Code, highlightTerms, tokens: preloadedTokens, tokenCache }: TokenizedTextProps) {
  const [tokens, setTokens] = useState<LemmatizedToken[]>(preloadedTokens ?? []);
  const [loading, setLoading] = useState(!preloadedTokens);
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const loadingRef = useRef(false);
  const lastTextRef = useRef(text);

  // ── Phonetics settings (matches Next.js getShowPhonetics) ──
  const { getL2 } = useSettingsContext();
  const l2Settings = getL2(l2Code);
  const phonetics = l2Settings.tokenSpan.phonetics;
  const showPhonetics = phonetics.show !== false; // 'ruby' | 'word' → true, false → false
  const replaceWithPhonetics = phonetics.show === 'word';

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
    const isWord = (t: LemmatizedToken) => t.lemmas.length > 0;

    return (
      <>
        {/* Ruby mode: View-based flex row for readings-above-characters layout */}
        {showPhonetics && phonetics.show === 'ruby' ? (
          <View className="flex-row flex-wrap items-end">
            {tokens.map((token, i) => {
              if (!isWord(token)) {
                // Non-word tokens (spaces, punctuation): wrap in same column
                // structure as ruby tokens so they share bottom alignment.
                return (
                  <View key={i} className="items-center mx-px">
                    <Text className="text-base leading-[18px] text-foreground">{token.text}</Text>
                  </View>
                );
              }

              const word = token.text;
              const isHighlighted = highlightTerms?.some((t) => t === word);

              // Build ruby segments from pronunciation data
              const hasRuby = token.pronunciation && token.pronunciation !== token.text;
              const rubySegs: RubySegment[] = hasRuby
                ? buildRuby(token.text, token.pronunciation!, l2Code)
                : [{ text: token.text }];

              return (
                <React.Fragment key={i}>
                  {rubySegs.map((seg, j) => (
                    <View key={j} className="items-center mx-px">
                      {seg.reading && (
                        <Text className="text-[9px] leading-[11px] text-muted-foreground">{seg.reading}</Text>
                      )}
                      <Text
                        className={`text-base leading-[18px] ${isHighlighted ? 'font-bold text-primary' : 'text-foreground'}`}
                        onPress={() => setSelectedWord(word)}
                      >
                        {seg.text}
                      </Text>
                    </View>
                  ))}
                </React.Fragment>
              );
            })}
          </View>
        ) : (
          /* Word-replace or no-phonetics mode: plain inline Text */
          <Text className="text-base leading-relaxed text-foreground">
            {tokens.map((token, i) => {
              // Word mode: replace text with pronunciation
              const displayText = replaceWithPhonetics && isWord(token) && token.pronunciation
                ? token.pronunciation
                : token.text;
              const word = token.text;
              const isHighlighted = highlightTerms?.some((t) => t === word);
              return (
                <Text
                  key={i}
                  onPress={() => isWord(token) && setSelectedWord(word)}
                  className={isHighlighted ? 'font-bold text-primary' : ''}
                >
                  {displayText}
                </Text>
              );
            })}
          </Text>
        )}

        <DictionaryPopup
          visible={!!selectedWord}
          word={selectedWord ?? ''}
          onClose={() => setSelectedWord(null)}
        />
      </>
    );
  }

  // ── Loading / no tokens: show plain undivided text (matches Next.js) ──
  return <Text className="text-base leading-relaxed text-foreground">{text}</Text>;
}
