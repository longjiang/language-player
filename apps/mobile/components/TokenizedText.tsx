import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { View, Text, Platform } from 'react-native';
import { PYTHON_API_URL } from '@/lib/api-url';
import type { TokenCache } from '@langplayer/shared';
import type { DictionaryEntry } from '@langplayer/shared';
import { buildRuby, baseCode } from '@langplayer/utils';
import type { RubySegment } from '@langplayer/utils';
import type { LemmatizedToken } from '@langplayer/shared';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useSavedWords } from '@/hooks/use-saved-words';
import { useProgressLevel } from '@/hooks/use-progress-level';
import { DictionaryPopup } from '@/components/dictionary/DictionaryPopup';
import { configureLayoutAnimation } from '@/lib/animations';
import { bulkLookupWords, getCachedEntries, getCacheVersion } from '@/lib/dictionary-cache';
import { getConverter } from '@/lib/chinese-script';

// ── Shared in-memory lemmatize cache ──────────────────
// All TokenizedText instances share this Map, so if two components
// render the same text, only one API call is made.
const lemmatizeCache = new Map<string, LemmatizedToken[]>();

// In-flight request deduplication — prevents thundering herd when many
// TokenizedText instances mount simultaneously and all hit the fallback.
const lemmatizeInflight = new Map<string, Promise<LemmatizedToken[]>>();

// ── Word difficulty helpers for hardWords filter ──────────────────

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

export interface TokenizedTextProps {
  text: string;
  l2Code: string;
  highlightTerms?: string[];
  /** Pre-computed lemmatized tokens — when set, skips all API calls. */
  tokens?: LemmatizedToken[];
  /** Video-level token cache from /lemmatize-video-normalized (optional optimization). */
  tokenCache?: TokenCache;
  /** Whether the token cache has finished loading. When false and tokenCache
   *  is provided, the component shows plain text without calling the API. */
  tokenCacheLoaded?: boolean;
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
export function TokenizedText({ text, l2Code, highlightTerms, tokens: preloadedTokens, tokenCache, tokenCacheLoaded }: TokenizedTextProps) {
  const [tokens, setTokens] = useState<LemmatizedToken[]>(preloadedTokens ?? []);
  const [loading, setLoading] = useState(!preloadedTokens);
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const loadingRef = useRef(false);
  const lastTextRef = useRef(text);
  const tokenCacheRef = useRef(tokenCache); // stable access without deps churn
  tokenCacheRef.current = tokenCache;

  const { l1Lang } = useLanguage();

  // ── Settings (matches Next.js) ──
  const { getL2, tokenizedText: tokenSettings } = useSettingsContext();
  const l2Settings = getL2(l2Code);
  const phonetics = l2Settings.tokenSpan.phonetics;
  const showPhonetics = phonetics.show !== false;
  const replaceWithPhonetics = phonetics.show === 'word';
  const popupEnabled = tokenSettings.enabled;
  const quizMode = tokenSettings.mode === 'quiz';
  const showDefinition = l2Settings.tokenSpan.definition.show;

  // ── hardWords filter + quickGloss (Phase 2: SPEC-019) ──
  const quickGlossEnabled = tokenSettings.quickGloss;
  const phoneticsConditions = phonetics.conditions;
  const userLevel = useProgressLevel(l2Code);
  const { savedWords } = useSavedWords();

  // ── Chinese script conversion (Phase 3: SPEC-019) ──
  const isChinese = baseCode(l2Code) === 'zh';
  const useTraditional = isChinese && l2Settings.display.traditional;

  // Pre-convert all unique token texts to traditional (OpenCC is lazy-loaded).
  // When useTraditional is false, the map is empty and original text is used.
  const [convertedTexts, setConvertedTexts] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    if (!useTraditional || tokens.length === 0) {
      setConvertedTexts(new Map());
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const converter = await getConverter();
        if (cancelled) return;
        const uniqueTexts = [...new Set(tokens.map(t => t.text))];
        const mapping = new Map<string, string>();
        for (const text of uniqueTexts) {
          mapping.set(text, converter(text));
        }
        if (!cancelled) setConvertedTexts(mapping);
      } catch {
        // OpenCC failed to load — fall back to original text (map stays empty)
      }
    })();
    return () => { cancelled = true; };
  }, [tokens, useTraditional]);

  const byeonggiEnabled = l2Settings.display.byeonggi !== false;

  // Quiz mode: track which tokens have been revealed
  const [revealedTokens, setRevealedTokens] = useState<Set<number>>(new Set());

  // Batch dictionary lookup layer (matches web's tokenized-text.tsx)
  const [cacheVersion, setCacheVersion] = useState(0);

  // ── Computed text styles from zoom + typeFace settings ──
  const textStyle = useMemo(() => {
    const zoom = tokenSettings.zoom;
    const baseSize = 16; // text-base
    const size = zoom === 0 ? baseSize : baseSize + zoom * 2; // zoom 1→18, 2→20, ..., 7→30
    const style: { fontSize: number; fontFamily?: string; lineHeight?: number } = { fontSize: size };

    if (tokenSettings.typeFace === 'serif') {
      style.fontFamily = Platform.OS === 'ios' ? 'Georgia' : 'serif';
    } else if (tokenSettings.typeFace === 'sans-serif') {
      style.fontFamily = Platform.OS === 'ios' ? 'Avenir Next' : 'sans-serif';
    }

    return style;
  }, [tokenSettings.zoom, tokenSettings.typeFace]);

  // ── Quick lookup set for saved word forms (quickGloss) ──
  const savedFormSet = useMemo(() => {
    const words = savedWords[l2Code] ?? [];
    const forms = new Set<string>();
    for (const w of words) {
      if (w.head) forms.add(w.head.toLowerCase());
      if (w.forms) for (const f of w.forms) forms.add(f.toLowerCase());
      if (w.context?.form) forms.add((w.context.form as string).toLowerCase());
    }
    return forms;
  }, [savedWords, l2Code]);

  // ── Phonetics filter: per-token hardWords check ──
  const shouldShowPhonetics = useCallback((token: LemmatizedToken): boolean => {
    if (token.lemmas.length === 0) return false;
    if (phoneticsConditions === 'always') return true;
    // hardWords — only show if word difficulty ≥ user level
    if (!userLevel || userLevel < 1) return true; // no level set → show all
    const diff = getWordDifficulty(l2Code, token.lemmas);
    if (diff.kind === 'not_cached') return false; // wait for async bulk lookup
    if (diff.kind === 'unclassified') return true; // unknown → treat as hard
    return diff.value >= userLevel;
  }, [phoneticsConditions, userLevel, l2Code]);

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

    // If a video-level token cache is provided but hasn't finished loading yet,
    // show plain text and wait — don't fall back to per-line API calls.
    // When tokenCacheLoaded flips to true, this effect re-fires and tries the
    // now-populated cache.
    if (tokenCacheRef.current && tokenCacheLoaded === false) {
      setTokens([{ text: effectiveText, lemmas: [] }]);
      setLoading(false);
      return;
    }

    const cacheKey = `${l2Code}:${effectiveText}`;

    // 1. Check video token cache (via stable ref to avoid dep churn)
    const tc = tokenCacheRef.current;
    if (tc) {
      const cached = tc.get(effectiveText);
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

    // Prevent concurrent fetches for the same text within this instance
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
        // 3. Fall back to per-line API call — with in-flight deduplication
        //    so that concurrent TokenizedText instances for the same text
        //    share a single request instead of each launching their own.
        let inflight = lemmatizeInflight.get(cacheKey);
        if (!inflight) {
          inflight = fetch(`${PYTHON_API_URL}/lemmatize-normalized`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: effectiveText, l2: l2Code }),
            signal: controller.signal,
          }).then(async (response) => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            const serverTokens = data.tokens ?? [];
            lemmatizeCache.set(cacheKey, serverTokens);
            return serverTokens;
          }).finally(() => {
            lemmatizeInflight.delete(cacheKey);
          });
          lemmatizeInflight.set(cacheKey, inflight);
        }

        const serverTokens = await inflight;

        if (!cancelled) {
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
  }, [text, l2Code, preloadedTokens, tokenCacheLoaded]);

  // ── Abort on unmount ──
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // ── Batch dictionary lookup after tokens are loaded ──
  // Gathers all unique lemmas and fetches dictionary entries in one request,
  // populating the shared cache for instant popups + byeonggi/gloss data.
  useEffect(() => {
    if (!tokens.length || loading) return;

    const uniqueLemmas = new Map<string, string>();
    for (const token of tokens) {
      for (const lemma of token.lemmas) {
        const t = lemma.lemma?.trim();
        if (!t || t.length === 0) continue;
        if (!uniqueLemmas.has(t)) {
          uniqueLemmas.set(t, lemma.part_of_speech ?? '');
        }
      }
      // Also include surface form if different from lemmas
      const surface = token.text.trim();
      if (surface && surface.length > 0 && !uniqueLemmas.has(surface)) {
        uniqueLemmas.set(surface, '');
      }
    }

    if (uniqueLemmas.size === 0) return;

    const words = Array.from(uniqueLemmas.keys()).map((text) => ({
      text,
      l2Code: l2Code,
      l1Code: l1Lang?.code ?? 'en',
    }));

    bulkLookupWords(words).then(() => setCacheVersion(v => v + 1));
  }, [tokens, loading, l2Code, l1Lang?.code]);

  // ── Per-token data from dictionary cache (byeonggi, gloss, levels) ──
  const getTokenEntryData = useCallback((token: LemmatizedToken) => {
    if (!token.lemmas.length) return { byeonggiText: null as string | null, firstDef: null as string | null };
    const firstLemma = token.lemmas[0]!.lemma;
    const entries = getCachedEntries(l2Code, firstLemma);
    if (!entries || entries.length === 0) {
      // Try surface form if lemma didn't match
      const surfaceEntries = getCachedEntries(l2Code, token.text);
      if (surfaceEntries && surfaceEntries.length > 0) {
        const e = surfaceEntries[0]!;
        return {
          byeonggiText: e.han_script?.hanja ?? e.han_script?.hantu ?? null,
          firstDef: e.definitions?.[0] ?? null,
        };
      }
      return { byeonggiText: null, firstDef: null };
    }
    const firstEntry = entries[0]!;
    return {
      byeonggiText: firstEntry.han_script?.hanja ?? firstEntry.han_script?.hantu ?? null,
      firstDef: firstEntry.definitions?.[0] ?? null,
    };
  }, [l2Code, cacheVersion]);
  if (tokens.length > 0) {
    const isWord = (t: LemmatizedToken) => t.lemmas.length > 0;
    const readingSize = Math.max(8, Math.round(textStyle.fontSize! * 0.55));
    const baseLeading = textStyle.fontSize! + 6;

    return (
      <>
        {/* Ruby mode: View-based flex row for readings-above-characters layout */}
        {showPhonetics && phonetics.show === 'ruby' ? (
          <View className="flex-row flex-wrap items-end">
            {tokens.map((token, i) => {
              if (!isWord(token)) {
                return (
                  <View key={i} className="items-center mx-px">
                    <Text style={[textStyle, { lineHeight: baseLeading }]} className="text-foreground">{token.text}</Text>
                  </View>
                );
              }

              const word = token.text;
              const displayText = useTraditional ? (convertedTexts.get(word) ?? word) : word;
              const isHighlighted = highlightTerms?.some((t) => t === word);
              const isRevealed = revealedTokens.has(i);
              const isBlanked = quizMode && !isRevealed;
              const firstLemma = token.lemmas[0]?.lemma;
              const showGloss = showDefinition && firstLemma && firstLemma !== word;
              const { byeonggiText, firstDef } = getTokenEntryData(token);
              const showByeonggi = byeonggiEnabled && !!byeonggiText;
              const showTokenPhonetics = shouldShowPhonetics(token);
              const isSaved = savedFormSet.has(word.toLowerCase());
              const showQuickGloss = isSaved && quickGlossEnabled && !!firstDef && !isHighlighted;

              const hasRuby = showTokenPhonetics && token.pronunciation && token.pronunciation !== word;
              const rubySegs: RubySegment[] = hasRuby
                ? buildRuby(displayText, token.pronunciation!, l2Code)
                : [{ text: displayText }];

              const handlePress = () => {
                if (quizMode) {
                  setRevealedTokens(prev => new Set(prev).add(i));
                  return;
                }
                if (popupEnabled) {
                  configureLayoutAnimation();
                  setSelectedWord(word);
                }
              };

              return (
                <React.Fragment key={i}>
                  {rubySegs.map((seg, j) => (
                    <View key={j} className="items-center mx-px">
                      {seg.reading && (
                        <Text style={{ fontSize: readingSize, lineHeight: readingSize + 2 }} className="text-muted-foreground">{seg.reading}</Text>
                      )}
                      {showByeonggi && j === 0 && (
                        <Text style={{ fontSize: readingSize, lineHeight: readingSize + 2 }} className="text-muted-foreground">{byeonggiText}</Text>
                      )}
                      <Text
                        style={[textStyle, { lineHeight: baseLeading }]}
                        className={isHighlighted ? 'font-bold text-primary' : 'text-foreground'}
                        onPress={handlePress}
                      >
                        {isBlanked ? '▯' : seg.text}
                      </Text>
                      {showGloss && j === rubySegs.length - 1 && (
                        <Text style={{ fontSize: readingSize, lineHeight: readingSize + 2 }} className="text-muted-foreground">{firstLemma}</Text>
                      )}
                      {showQuickGloss && j === rubySegs.length - 1 && (
                        <Text style={{ fontSize: readingSize, lineHeight: readingSize + 2 }} className="text-muted-foreground">{firstDef}</Text>
                      )}
                    </View>
                  ))}
                </React.Fragment>
              );
            })}
          </View>
        ) : (
          /* Word-replace or no-phonetics mode: plain inline Text */
          <Text style={textStyle} className="text-foreground">
            {tokens.map((token, i) => {
              const word = token.text;
              const tokenDisplayText = useTraditional ? (convertedTexts.get(word) ?? word) : word;
              const displayText = replaceWithPhonetics && isWord(token) && shouldShowPhonetics(token) && token.pronunciation
                ? token.pronunciation
                : tokenDisplayText;
              const isHighlighted = highlightTerms?.some((t) => t === word);
              const isRevealed = revealedTokens.has(i);
              const isBlanked = quizMode && !isRevealed;
              const firstLemma = token.lemmas[0]?.lemma;
              const showGloss = showDefinition && firstLemma && firstLemma !== word;
              const { byeonggiText, firstDef } = getTokenEntryData(token);
              const showByeonggi = byeonggiEnabled && !!byeonggiText;
              const isSaved = savedFormSet.has(word.toLowerCase());
              const showQuickGloss = isSaved && quickGlossEnabled && !!firstDef && !isHighlighted;

              const handlePress = () => {
                if (quizMode) {
                  setRevealedTokens(prev => new Set(prev).add(i));
                  return;
                }
                if (popupEnabled && isWord(token)) {
                  configureLayoutAnimation();
                  setSelectedWord(word);
                }
              };

              return (
                <Text
                  key={i}
                  onPress={handlePress}
                  className={isHighlighted ? 'font-bold text-primary' : ''}
                >
                  {showByeonggi ? `${byeonggiText} ` : ''}
                  {isBlanked ? '▯' : displayText}
                  {showGloss ? ` ·${firstLemma}` : ''}
                  {showQuickGloss ? ` ${firstDef}` : ''}
                </Text>
              );
            })}
          </Text>
        )}

        {popupEnabled && (
          <DictionaryPopup
            visible={!!selectedWord}
            word={selectedWord ?? ''}
            onClose={() => { configureLayoutAnimation(); setSelectedWord(null); }}
          />
        )}
      </>
    );
  }

  // ── Loading / no tokens: show plain undivided text (matches Next.js) ──
  return <Text className="text-base leading-relaxed text-foreground">{text}</Text>;
}
