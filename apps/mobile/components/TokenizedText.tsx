import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { View, Text, Platform } from 'react-native';
import type { TokenCache } from '@langplayer/shared';
import type { DictionaryEntry } from '@langplayer/shared';
import { buildRuby, baseCode } from '@langplayer/utils';
import type { RubySegment } from '@langplayer/utils';
import type { LemmatizedToken, TokenSource } from '@langplayer/shared';
import { lemmatizeText } from '@/lib/tokenizer';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useSavedWords } from '@/hooks/use-saved-words';
import { useProgressLevel } from '@/hooks/use-progress-level';
import { DictionaryPopup } from '@/components/dictionary/DictionaryPopup';
import { configureLayoutAnimation } from '@/lib/animations';
import { bulkLookupWords, getCachedEntries, getCacheVersion } from '@/lib/dictionary-cache';
import { getConverter } from '@/lib/chinese-script';

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
  /** Karaoke progress for the active subtitle line: 0 (start) to 1 (end).
   *  When undefined, karaoke is off. */
  karaokeProgress?: number;
  /** testID for the outermost container — enables E2E selectors like "subtitle-line-0". */
  testID?: string;
}

/**
 * Renders text as tappable word tokens with lemmatization via `lemmatizeText()`.
 *
 * Lemma resolution pipeline (SPEC-018):
 *   1. Pre-computed `tokens` prop (skip all resolution)
 *   2. Video token cache (`tokenCache` prop, for playback optimization)
 *   3. `lemmatizeText()` — server-first (POST /lemmatize-normalized, 3s timeout),
 *      falls back to local regex split + surface-as-lemma / arabic-stem
 *
 * Includes a built-in dictionary popup — tapping any word opens the
 * dictionary lookup. No `onWordPress` prop needed (matches Next.js).
 *
 * While loading, shows plain undivided text.
 */
export function TokenizedText({ text, l2Code, highlightTerms, tokens: preloadedTokens, tokenCache, tokenCacheLoaded, karaokeProgress, testID }: TokenizedTextProps) {
  const [tokens, setTokens] = useState<LemmatizedToken[]>(preloadedTokens ?? []);
  const [loading, setLoading] = useState(!preloadedTokens);
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [selectedLemma, setSelectedLemma] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const loadingRef = useRef(false);
  const lastTextRef = useRef(text);
  const tokenCacheRef = useRef(tokenCache); // stable access without deps churn
  tokenCacheRef.current = tokenCache;

  const { l1Lang } = useLanguage();

  // ── Debug: colored underlines per token source (SPEC-018) ──
  // Only active in __DEV__. Maps source to a color level:
  //   Level 1 (green)  — server / kuromoji (best accuracy)
  //   Level 2 (yellow) — dict-seg / lemma-table / snowball / arabic-stem (medium)
  //   Level 3 (red)    — surface (last resort)
  const TOKEN_SOURCE_COLORS: Record<TokenSource, string> = __DEV__ ? {
    server:       '#22c55e', // green-500
    'ja-kuromoji':'#22c55e',
    'ko-kuromoji':'#22c55e',
    'dict-seg':   '#eab308', // yellow-500
    'lemma-table':'#eab308',
    'snowball':   '#eab308',
    'arabic-stem':'#eab308',
    surface:      '#ef4444', // red-500
  } : ({} as any);

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
      if (__DEV__ && preloadedTokens.length > 0) {
        const wordTokens = preloadedTokens.filter(t => t.lemmas.length > 0);
        const lemmaSample = wordTokens.slice(0, 10).map(t => `${t.text}→${t.lemmas[0]?.lemma}`).join(', ');
        console.log(`[TokenizedText] 📥 PRELOADED l2=${l2Code} total=${preloadedTokens.length} words=${wordTokens.length} lemmas=\"${lemmaSample}\"`);
      }
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

    // Skip if text hasn't changed AND we already have real tokens (not the
    // placeholder set below while waiting for the video token cache to load).
    // Placeholder tokens have lemmas: [] for the whole line — no word is
    // interactive. When tokenCacheLoaded flips from false→true, this guard
    // must NOT block re-processing so the now-populated cache (or
    // lemmatizeText fallback) can replace the placeholder with real tokens.
    const hasRealTokens = tokens.length > 0 && tokens.some(t => t.lemmas.length > 0);
    if (effectiveText === lastTextRef.current && hasRealTokens) return;
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
        setTokens(cached);
        setLoading(false);
        return;
      }
    }

    // Cancel previous in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    let cancelled = false;
    setLoading(true);

    // 2. Server-first, local-fallback pipeline (SPEC-018 Phase 1)
    //    - Tries POST /lemmatize-normalized first (3s timeout)
    //    - Falls back to regex split + surface-as-lemma (or arabic-stem for ar)
    //    - Handles in-memory cache + in-flight dedup internally
    lemmatizeText(effectiveText, l2Code, controller.signal).then((result) => {
      if (!cancelled) {
        setTokens(result);
        setLoading(false);
        loadingRef.current = false;
      }
    });

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

    // ── Karaoke: precompute spoken word count ──
    let wordCount = 0;
    let spokenWordCount = 0;
    if (karaokeProgress !== undefined) {
      wordCount = tokens.filter(t => isWord(t)).length;
      spokenWordCount = Math.floor(karaokeProgress * wordCount);
    }

    return (
      <>
        {/* Ruby mode: View-based flex row for readings-above-characters layout */}
        {showPhonetics && phonetics.show === 'ruby' ? (
          <View testID={testID} className="flex-row flex-wrap items-end">
            {(() => {
              let wordIndexSoFar = 0;
              return tokens.map((token, i) => {
              if (!isWord(token)) {
                return (
                  <View key={i} className="items-center mx-px">
                    <Text style={[textStyle, { lineHeight: baseLeading }]} className="text-foreground">{token.text}</Text>
                  </View>
                );
              }

              // Karaoke dimming for non-spoken words
              wordIndexSoFar++;
              const isKaraokeSpoken = karaokeProgress !== undefined ? wordIndexSoFar <= spokenWordCount : undefined;
              const isKaraokeDimmed = isKaraokeSpoken === false;

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
                  setSelectedLemma(firstLemma || null);
                }
              };

              // Debug: colored underline matching token source level (SPEC-018)
              const debugUnderline = __DEV__ && token.source && TOKEN_SOURCE_COLORS[token.source]
                ? { borderBottomWidth: 2, borderBottomColor: TOKEN_SOURCE_COLORS[token.source] }
                : undefined;

              return (
                <React.Fragment key={i}>
                  {rubySegs.map((seg, j) => (
                    <View key={j} className="items-center mx-px" style={[isKaraokeDimmed ? { opacity: 0.4 } : undefined, debugUnderline]}>
                      {seg.reading && (
                        <Text style={{ fontSize: readingSize, lineHeight: readingSize + 2 }} className="text-muted-foreground">{seg.reading}</Text>
                      )}
                      {showByeonggi && j === 0 && (
                        <Text style={{ fontSize: readingSize, lineHeight: readingSize + 2 }} className="text-muted-foreground">{byeonggiText}</Text>
                      )}
                      <Text
                        testID={`token-${i}`}
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
            });
          })()}
          </View>
        ) : (
          /* Word-replace or no-phonetics mode: plain inline Text */
          <Text testID={testID} style={textStyle} className="text-foreground">
            {(() => {
              let wordIndexSoFar = 0;
              return tokens.map((token, i) => {
              const isWordToken = isWord(token);
              if (isWordToken) wordIndexSoFar++;
              const isKaraokeSpoken = karaokeProgress !== undefined ? wordIndexSoFar <= spokenWordCount : undefined;
              const isKaraokeDimmed = isKaraokeSpoken === false;

              const word = token.text;
              const tokenDisplayText = useTraditional ? (convertedTexts.get(word) ?? word) : word;
              const displayText = replaceWithPhonetics && isWordToken && shouldShowPhonetics(token) && token.pronunciation
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
                if (popupEnabled && isWordToken) {
                  configureLayoutAnimation();
                  setSelectedWord(word);
                  setSelectedLemma(firstLemma || null);
                }
              };

              // Debug: colored underline matching token source level (SPEC-018)
              const debugUnderline = __DEV__ && token.source && TOKEN_SOURCE_COLORS[token.source]
                ? { textDecorationLine: 'underline' as const, textDecorationColor: TOKEN_SOURCE_COLORS[token.source] }
                : undefined;

              return (
                <Text
                  key={i}
                  testID={`token-${i}`}
                  onPress={handlePress}
                  className={isHighlighted ? 'font-bold text-primary' : ''}
                  style={[isKaraokeDimmed ? { opacity: 0.4 } : undefined, debugUnderline]}
                >
                  {showByeonggi ? `${byeonggiText} ` : ''}
                  {isBlanked ? '▯' : displayText}
                  {showGloss ? ` ·${firstLemma}` : ''}
                  {showQuickGloss ? ` ${firstDef}` : ''}
                </Text>
              );
            });
          })()}
          </Text>
        )}

        {popupEnabled && (
          <DictionaryPopup
            visible={!!selectedWord}
            word={selectedWord ?? ''}
            lemma={selectedLemma ?? undefined}
            onClose={() => { configureLayoutAnimation(); setSelectedWord(null); setSelectedLemma(null); }}
          />
        )}
      </>
    );
  }

  // ── Loading / no tokens: show plain undivided text (matches Next.js) ──
  return <Text testID={testID} className="text-base leading-relaxed text-foreground">{text}</Text>;
}
