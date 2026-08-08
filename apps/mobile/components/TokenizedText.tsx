import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { View, Text, Platform, Animated, Alert, Pressable } from 'react-native';
import type { TokenCache } from '@langplayer/shared';
import type { DictionaryEntry } from '@langplayer/shared';
import { firstGloss } from '@langplayer/shared';
import { buildRuby, baseCode } from '@langplayer/utils';
import type { RubySegment } from '@langplayer/utils';
import type { LemmatizedToken } from '@langplayer/shared';
import { lemmatizeText, prewarmLocalLemmatizer } from '@/lib/tokenizer';
import { lookupOfflineManyByL2 } from '@/lib/dictionary-db';
import { isOfflineModeEnabled } from '@/lib/offline-mode';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useSyncStatus } from '@/contexts/SyncStatusContext';
import { useSavedWords } from '@/hooks/use-saved-words';
import { useOfflineDictionaryAvailable } from '@/hooks/use-offline-dictionary';
import { useProgressLevel } from '@/hooks/use-progress-level';
import { useT } from '@/hooks/use-t';
import { DictionaryPopup } from '@/components/dictionary/DictionaryPopup';
import { log, logwarn } from '@/lib/logger';
import { configureLayoutAnimation } from '@/lib/animations';
import { PYTHON_API_URL } from '@/lib/api-url';
import { ZOOM_TO_REM } from '@/lib/text-scale';
import {
  enqueueLookupWords,
  getCachedEntries,
  getCacheVersion,
  setCachedEntries,
} from '@/lib/dictionary-cache';
import { fetchL1Gloss, getL1Gloss } from '@/lib/l1-gloss';
import { getConverter, getSimplifiedConverter } from '@/lib/chinese-script';
import type { EpubFormatRange } from '@/lib/epub-parser';

// ── Queued batch lemmatization ────────────────────────────────────────
// Visible TokenizedText instances enqueue their line; a short timer flushes
// the queue through /lemmatize-normalized/batch in one request instead of
// firing N per-line calls. Falls back to lemmatizeText() (server-first with
// local tokenizer fallback) when the batch request fails.
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
      // Offline Mode: don't attempt the batch endpoint at all. The gate would
      // reject instantly anyway; skipping keeps the local fallback instant
      // and avoids the double failure (batch + per-line) in the logs.
      if (isOfflineModeEnabled()) {
        log('[TokenizedText] ⏭ OFFLINE-MODE — skipping /lemmatize-normalized/batch, using local lemmatizeText');
        await Promise.allSettled(group.map(async (item) => {
          try {
            item.resolve(await lemmatizeText(item.text, item.l2Code));
          } catch (lineErr) {
            item.reject(lineErr);
          } finally {
            lemmatizeBatchPending.delete(item.key);
          }
        }));
        continue;
      }

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        try {
          const res = await fetch(`${PYTHON_API_URL}/lemmatize-normalized/batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ texts: group.map((g) => g.text), l2: l2Code }),
            signal: controller.signal,
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          const results: LemmatizedToken[][] = data?.results ?? [];
          group.forEach((item, i) => {
            item.resolve(results[i] ?? []);
            lemmatizeBatchPending.delete(item.key);
          });
        } finally {
          clearTimeout(timeout);
        }
      } catch (err) {
        // Batch failed — fall back to lemmatizeText() (server-first, then local
        // tokenizer), preserving the offline pipeline.
        logwarn('[LP Mobile] Batch lemmatize failed — falling back per-line:', err);
        await Promise.allSettled(group.map(async (item) => {
          try {
            item.resolve(await lemmatizeText(item.text, item.l2Code));
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
  /** When true, skip this component's own lemmatization queue — the parent
   *  (e.g. reader pagination) is the lemmatization authority and supplies
   *  tokens via the `tokens` prop once a block is near the viewport
   *  (SPEC-019 O2 lazy loading). */
  deferTokenization?: boolean;
  /** Karaoke progress for the active subtitle line: 0 (start) to 1 (end).
   *  When undefined, karaoke is off. */
  karaokeProgress?: number;
  /**
   * Line-height (leading) for tokenized text. Defaults to 'loose' (2×).
   * Pass 'none' to inherit from the parent container.
   */
  leading?: 'relaxed' | 'normal' | 'tight' | 'snug' | 'loose' | 'none';
  /** testID for the outermost container — enables E2E selectors like "subtitle-line-0". */
  testID?: string;
  /** When true, highlighted (target) words show their phonetics too. Used by
   *  the review card to reveal phonetics on the highlighted word when the
   *  card is flipped (SPEC-049 §6.1). Default false. */
  phoneticsOnHighlight?: boolean;
  /** EPUB inline link ranges mapped onto `text` (SPEC-049 §9.7). */
  formats?: EpubFormatRange[];
  /** Follow an in-book link when a linked token is tapped. */
  onOpenLink?: (href: string) => void;
  /** When false, forces phonetics/furigana off (AI explanation plain spans). */
  phonetics?: boolean;
  /** Text scale multiplier (matches web): omitted → user zoom; 0 → inherit
   *  (fixed 16px on mobile); otherwise textScale × user zoom. */
  textScale?: number;
  /** Tailwind text color class for the L2 text. Defaults to `text-foreground`
   *  (used by the on-video subtitle band to render white text). */
  textColor?: string;
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
export function TokenizedText({ text, l2Code, highlightTerms, tokens: preloadedTokens, tokenCache, tokenCacheLoaded, deferTokenization = false, karaokeProgress, leading = 'loose', testID, phoneticsOnHighlight = false, formats, onOpenLink, phonetics: phoneticsOverride, textScale, textColor = 'text-foreground' }: TokenizedTextProps) {
  const t = useT();
  const [tokens, setTokens] = useState<LemmatizedToken[]>(preloadedTokens ?? []);
  const [loading, setLoading] = useState(!preloadedTokens && !deferTokenization);
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [selectedLemma, setSelectedLemma] = useState<string | null>(null);
  const [selectedTokenPron, setSelectedTokenPron] = useState<string | null>(null);
  const [selectedLinkUrl, setSelectedLinkUrl] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const loadingRef = useRef(false);
  const lastTextRef = useRef(text);
  const tokenCacheRef = useRef(tokenCache); // stable access without deps churn
  tokenCacheRef.current = tokenCache;
  const { status } = useSyncStatus();
  const dictAvailable = useOfflineDictionaryAvailable(l2Code);
  // Offline + no downloaded dictionary: words can't be interactive. Render
  // plain text immediately (no pulsing tokenization) and explain on tap.
  const offlineNoDict = status.effectiveOffline && dictAvailable === false;
  // Opacity pulse shown while lemmatization is in flight.
  const pulseAnim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    if (!loading) {
      pulseAnim.setValue(0.4);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.4, duration: 650, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [loading, pulseAnim]);

  const { l1Lang } = useLanguage();



  // ── Settings (matches Next.js) ──
  const { getL2, tokenizedText: tokenSettings } = useSettingsContext();
  const l2Settings = getL2(l2Code);
  const phonetics = l2Settings.tokenSpan.phonetics;
  const showPhonetics = phoneticsOverride === false ? false : phonetics.show !== false;
  const replaceWithPhonetics = phoneticsOverride === false ? false : phonetics.show === 'word';
  const popupEnabled = tokenSettings.enabled;
  const quizMode = tokenSettings.mode === 'quiz';

  // ── hardWords filter + quickGloss (Phase 2: SPEC-019) ──
  const quickGlossEnabled = tokenSettings.quickGloss;
  const showDefinition = l2Settings.tokenSpan.definition.show;
  const phoneticsConditions = phonetics.conditions;
  const userLevel = useProgressLevel(l2Code);
  const { savedWords } = useSavedWords();

  // ── Chinese script conversion (Phase 3: SPEC-019) ──
  const isChinese = baseCode(l2Code) === 'zh';
  const useTraditional = isChinese && l2Settings.display.traditional;

  // Pre-convert all unique token texts to the preferred script (OpenCC is
  // lazy-loaded). Bidirectional per ADR-0019: traditional when
  // useTraditional, simplified otherwise.
  const [convertedTexts, setConvertedTexts] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    if (!isChinese || tokens.length === 0) {
      setConvertedTexts(new Map());
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        // ADR-0019: convert whenever the user's script preference differs
        // from the token's script. cn→twp when traditional is preferred;
        // twp→cn when simplified is preferred (idempotent on matching text).
        const converter = useTraditional ? await getConverter() : await getSimplifiedConverter();
        const direction = useTraditional ? 'toTraditional' : 'toSimplified';
        if (cancelled) return;
        const uniqueTexts = [...new Set(tokens.map(t => t.text))];
        const mapping = new Map<string, string>();
        let converted = 0;
        const changes: string[] = [];
        for (const text of uniqueTexts) {
          const result = converter(text);
          mapping.set(text, result);
          if (result !== text) {
            converted++;
            if (changes.length < 10) changes.push(`${text}→${result}`);
          }
        }
        log(`[LP Mobile] 🎙 SCRIPT-CONV l2=${l2Code} useTraditional=${useTraditional} direction=${direction} unique=${uniqueTexts.length} converted=${converted} sample=${changes.join(', ') || '(none changed)'}`);
        if (!cancelled) setConvertedTexts(mapping);
      } catch {
        logwarn(`[LP Mobile] 🎙 SCRIPT-CONV l2=${l2Code} OpenCC load failed — falling back to original text`);
        // OpenCC failed to load — fall back to original text (map stays empty)
      }
    })();
    return () => { cancelled = true; };
  }, [tokens, useTraditional, isChinese, l2Code]);

  const byeonggiEnabled = l2Settings.display.byeonggi !== false;

  // ── Map EPUB format ranges (links + search highlights) onto token indices ──
  // Surface tokens concatenate back to `text`; when that invariant breaks
  // (e.g. a tokenizer quirk), formats are simply not applied.
  const tokenFormatMap = useMemo<Array<{ url?: string; highlight?: boolean } | null>>(() => {
    if (!formats?.length || tokens.length === 0) return [];
    const total = tokens.reduce((sum, t) => sum + t.text.length, 0);
    if (total !== text.length) return [];
    let pos = 0;
    return tokens.map((token) => {
      let format: { url?: string; highlight?: boolean } | null = null;
      for (const f of formats) {
        if (pos < f.end && pos + token.text.length > f.start) {
          if (f.type === 'highlight') {
            format = { ...(format ?? {}), highlight: true };
          } else if (f.url) {
            format = { ...(format ?? {}), url: f.url };
          }
        }
      }
      pos += token.text.length;
      return format;
    });
  }, [formats, tokens, text]);

  // Quiz mode: track which tokens have been revealed
  const [revealedTokens, setRevealedTokens] = useState<Set<number>>(new Set());

  // Batch dictionary lookup layer (matches web's tokenized-text.tsx)
  const [cacheVersion, setCacheVersion] = useState(0);
  // L1-translated quick glosses keyed by lookup text (non-English UI only).
  const [l1Glosses, setL1Glosses] = useState<Record<string, string>>({});

  // ── Computed text styles from zoom + typeFace settings ──
  const textStyle = useMemo(() => {
    const zoom = tokenSettings.zoom;
    const zoomRem = ZOOM_TO_REM[zoom] ?? 1;
    // Matches web: omitted → user zoom; 0 → inherit (fixed 16px); otherwise
    // textScale × user zoom.
    const effectiveScale = textScale === undefined
      ? zoomRem
      : (textScale === 0 ? 0 : textScale * zoomRem);
    const size = effectiveScale === 0 ? 16 : 16 * effectiveScale;
    const style: { fontSize: number; fontFamily?: string; lineHeight?: number } = { fontSize: size };

    if (tokenSettings.typeFace === 'serif') {
      style.fontFamily = Platform.OS === 'ios' ? 'Georgia' : 'serif';
    } else if (tokenSettings.typeFace === 'sans-serif') {
      style.fontFamily = Platform.OS === 'ios' ? 'Avenir Next' : 'sans-serif';
    }

    return style;
  }, [tokenSettings.zoom, tokenSettings.typeFace, textScale]);

  // ── Leading ratio from prop (default: loose = 2) ──
  const LEADING_RATIOS: Record<string, number> = {
    relaxed: 1.625,
    normal: 1.5,
    tight: 1.25,
    snug: 1.375,
    loose: 2,
  };
  const leadingRatio: number | undefined = leading === 'none' ? undefined : (LEADING_RATIOS[leading] ?? 2);

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

  // ── Phonetics debug summary (Korean) — why is ruby/romanization missing? ──
  useEffect(() => {
    if (!__DEV__ || baseCode(l2Code) !== 'ko' || tokens.length === 0) return;
    const words = tokens.filter((t) => t.lemmas.length > 0);
    const withPron = words.filter((t) => t.pronunciation).length;
    const pronEqWord = words.filter((t) => t.pronunciation && t.pronunciation === t.text).length;
    const eligible = words.filter(shouldShowPhonetics).length;
    const rubyShown = words.filter(
      (t) =>
        showPhonetics &&
        phonetics.show === 'ruby' &&
        shouldShowPhonetics(t) &&
        !!t.pronunciation &&
        t.pronunciation !== t.text,
    ).length;
    log(
      `[TokenizedText] 🎙 PHONETICS l2=${l2Code} show=${String(phonetics.show)} conditions=${phoneticsConditions} userLevel=${userLevel ?? 'none'} words=${words.length} eligible=${eligible} withPron=${withPron} pronEqWord=${pronEqWord} rubyShown=${rubyShown} sample=${words.slice(0, 10).map((t) => `${t.text}→${t.pronunciation ?? '∅'}`).join(', ')}`,
    );
  }, [tokens, l2Code, showPhonetics, phonetics.show, phoneticsConditions, userLevel, shouldShowPhonetics]);

  // ── Preloaded tokens: use directly ──
  useEffect(() => {
    if (preloadedTokens) {
      if (__DEV__ && preloadedTokens.length > 0) {
        const wordTokens = preloadedTokens.filter(t => t.lemmas.length > 0);
        const lemmaSample = wordTokens.slice(0, 10).map(t => `${t.text}→${t.lemmas[0]?.lemma}`).join(', ');
        log(`[TokenizedText] 📥 PRELOADED l2=${l2Code} total=${preloadedTokens.length} words=${wordTokens.length} lemmas=\"${lemmaSample}\"`);
      }
      setTokens(preloadedTokens);
      setLoading(false);
    }
  }, [preloadedTokens]);

  // ── Auto-fetch tokens when no preloaded tokens ──
  useEffect(() => {
    // Skip if tokens were preloaded externally
    if (preloadedTokens) return;
    // Parent-driven tokenization (reader pages): don't start our own queue
    // request — the parent only tokenizes blocks near the viewport and hands
    // tokens back through the `tokens` prop. Render plain text until then.
    if (deferTokenization) {
      setTokens([]);
      setLoading(false);
      loadingRef.current = false;
      return;
    }
    // Offline + no dictionary: don't attempt tokenization at all — plain
    // text immediately, no pulsing (a tap explains why).
    if (offlineNoDict) {
      setTokens([]);
      setLoading(false);
      loadingRef.current = false;
      return;
    }

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
    // keep the pulsing state — don't fall back to API calls yet. When
    // tokenCacheLoaded flips to true, this effect re-fires and proceeds to the
    // cache / queued-batch pipeline (imported videos are already "loaded" with
    // an empty cache, so they skip straight to the queue).
    if (tokenCacheRef.current && tokenCacheLoaded === false) {
      setLoading(true);
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

    // 2. Queued batch pipeline: visible lines flush together through
    //    /lemmatize-normalized/batch, falling back to lemmatizeText()
    //    (server-first, then local regex/stem fallback) on failure.
    enqueueLemmatize(effectiveText, l2Code)
      .then((result) => {
        if (!cancelled) {
          setTokens(result);
          setLoading(false);
          loadingRef.current = false;
        }
      })
      .catch(() => {
        // Batch and per-line fallback both failed — show plain text.
        if (!cancelled) {
          setTokens([{ text: effectiveText, lemmas: [] }]);
          setLoading(false);
          loadingRef.current = false;
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
      loadingRef.current = false;
    };
  }, [text, l2Code, preloadedTokens, tokenCacheLoaded, offlineNoDict, deferTokenization]);

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
    if (offlineNoDict) return;

    const uniqueLemmas = new Map<string, string>();
    for (const token of tokens) {
      for (const lemma of token.lemmas) {
        const t = lemma.lemma?.trim();
        if (!t || t.length === 0 || /^[\s\p{P}]+$/u.test(t)) continue;
        if (!uniqueLemmas.has(t)) {
          uniqueLemmas.set(t, lemma.part_of_speech ?? '');
        }
      }
      // Also include surface form if different from lemmas
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
    const uncachedWords = words.filter((w) => !getCachedEntries(w.l2Code, w.text));

    // Offline-first: hydrate the shared cache from the downloaded dictionary
    // so popups and quick glosses work when Offline Mode blocks the network.
    // One batched exact-match query per language instead of one SQLite
    // round-trip per word (the popup still runs the full lookup on tap).
    const byL2 = new Map<string, string[]>();
    for (const w of uncachedWords) {
      const group = byL2.get(w.l2Code);
      if (group) group.push(w.text);
      else byL2.set(w.l2Code, [w.text]);
    }
    void Promise.all([...byL2.entries()].map(async ([l2, texts]) => {
      try {
        const hits = await lookupOfflineManyByL2(l2, texts);
        for (const [text, entries] of hits) {
          if (entries.length > 0) {
            log('[TokenizedText] 📖 offline batch cache hit — l2:', l2, 'text:', text, 'entries:', entries.length);
            setCachedEntries(l2, text, entries);
          }
        }
      } catch (e) {
        logwarn('[TokenizedText] ❌ offline batch cache hydration failed — l2:', l2, 'error:', (e as Error)?.message ?? e);
      }
    })).then(() => setCacheVersion(v => v + 1));

    // Queue with other visible lines' lemmas so one flush covers many lines
    // (still lazy — only lemmatized, i.e. visible, lines enqueue anything).
    // Offline Mode skips this: the local hydration above already filled the
    // cache, and the popup runs a full offline lookup on tap.
    if (!isOfflineModeEnabled()) {
      enqueueLookupWords(words, PYTHON_API_URL).then(() => setCacheVersion(v => v + 1));
    }
  }, [tokens, loading, l2Code]);

  // ── Pre-warm local tokenizer machinery ──
  // Start loading the kuromoji data pack / dictionary headword set as soon
  // as tokenized text becomes visible, so the first line doesn't pay the
  // full one-time initialization cost (singletons dedupe concurrent calls).
  useEffect(() => {
    void prewarmLocalLemmatizer(l2Code);
  }, [l2Code]);

  // ── Per-token data from dictionary cache (byeonggi, gloss, levels) ──
  const getTokenEntryData = useCallback((token: LemmatizedToken) => {
    if (!token.lemmas.length) return { byeonggiText: null as string | null, firstDef: null as string | null };
    const firstLemma = token.lemmas[0]!.lemma;
    // Cache/backend keys use the base L2 code (e.g. "zh" not "zh-Hans"), but
    // components may be mounted with the regional code. Check both so quick
    // glosses work everywhere (including video subtitles).
    const entries =
      getCachedEntries(l2Code, firstLemma) ??
      getCachedEntries(baseCode(l2Code), firstLemma);
    if (!entries || entries.length === 0) {
      // Try surface form if lemma didn't match
      const surfaceEntries =
        getCachedEntries(l2Code, token.text) ??
        getCachedEntries(baseCode(l2Code), token.text);
      if (surfaceEntries && surfaceEntries.length > 0) {
        const e = surfaceEntries[0]!;
        return {
          byeonggiText: e.han_script?.hanja ?? e.han_script?.hantu ?? null,
          firstDef: e.definitions ? firstGloss(e.definitions) : null,
        };
      }
      return { byeonggiText: null, firstDef: null };
    }
    const firstEntry = entries[0]!;
    return {
      byeonggiText: firstEntry.han_script?.hanja ?? firstEntry.han_script?.hantu ?? null,
      firstDef: firstEntry.definitions ? firstGloss(firstEntry.definitions) : null,
    };
  }, [l2Code, cacheVersion]);

  // ── L1-translated quick gloss (matches web token-span) ──
  useEffect(() => {
    if (l1Lang.code === 'en' || !quickGlossEnabled) return;
    let cancelled = false;

    const pending: Array<{ lookupText: string }> = [];
    const seen = new Set<string>();
    for (const token of tokens) {
      const lower = token.text.toLowerCase();
      if (!savedFormSet.has(lower) || seen.has(lower)) continue;
      seen.add(lower);
      const { firstDef } = getTokenEntryData(token);
      if (!firstDef) continue;
      const lookupText = token.lemmas[0]?.lemma || token.text;
      const cached = getL1Gloss(lookupText, l2Code, l1Lang.code);
      if (cached !== null) {
        setL1Glosses((prev) => (prev[lookupText] ? prev : { ...prev, [lookupText]: cached }));
      } else {
        pending.push({ lookupText });
      }
    }

    for (const { lookupText } of pending) {
      void fetchL1Gloss(lookupText, l2Code, l1Lang.code).then((gloss) => {
        if (!cancelled && gloss) {
          setL1Glosses((prev) => (prev[lookupText] ? prev : { ...prev, [lookupText]: gloss }));
        }
      });
    }

    return () => { cancelled = true; };
  }, [tokens, cacheVersion, l1Lang.code, quickGlossEnabled, savedFormSet, getTokenEntryData]);

  // Offline without a downloaded dictionary: words can't be interactive.
  // Render plain text immediately and explain on tap — never show the
  // pulsing tokenization state in this case.
  if (offlineNoDict) {
    return (
      <Text
        className={textColor}
        style={textStyle}
        onPress={() => Alert.alert(t('title.offline_dictionaries'), t('msg.offline_dictionary_required'))}
      >
        {text}
      </Text>
    );
  }

  if (tokens.length > 0) {
    const isWord = (t: LemmatizedToken) => t.lemmas.length > 0;
    const tokenFontSize = textStyle.fontSize ?? 16;
    const readingSize = Math.max(8, Math.round(tokenFontSize * 0.55));
    const baseLeading = leadingRatio ? Math.round(tokenFontSize * leadingRatio) : undefined;
    // The base text's line box is `baseLeading` tall, so its top half-leading
    // creates a visible gap between furigana and the word. Pull the reading
    // down by that half-leading (minus a small breathing room) and compensate
    // with top padding on the token column — row height and baseline
    // alignment with punctuation stay identical.
    const rubyGapTrim = Math.max(2, Math.round(((baseLeading ?? tokenFontSize) - tokenFontSize) / 2) - 2);

    // ── Karaoke: precompute spoken word count ──
    let wordCount = 0;
    let spokenWordCount = 0;
    if (karaokeProgress !== undefined) {
      wordCount = tokens.filter(t => isWord(t)).length;
      spokenWordCount = Math.floor(karaokeProgress * wordCount);
    }

    return (
      <>
        {/* View-based flex row: used for ruby readings-above-characters or interlinear definitions */}
        {(showPhonetics && phonetics.show === 'ruby') || showDefinition ? (
          <View testID={testID} className="flex-row flex-wrap items-end">
            {(() => {
              let wordIndexSoFar = 0;
              return tokens.map((token, i) => {
              if (!isWord(token)) {
                return (
                  <View key={i} className="items-center">
                    <Text style={[textStyle, { lineHeight: baseLeading }]} className={textColor}>{token.text}</Text>
                    {/* Universal definition slot: when showDefinition is on, every token
                        gets a slot of the same height so all word texts share a baseline.
                        Punctuation gets an empty spacer. */}
                    {showDefinition && (
                      <View style={{ height: readingSize + 2 }} />
                    )}
                  </View>
                );
              }

              // Karaoke dimming for non-spoken words
              wordIndexSoFar++;
              const isKaraokeSpoken = karaokeProgress !== undefined ? wordIndexSoFar <= spokenWordCount : undefined;
              const isKaraokeDimmed = isKaraokeSpoken === false;

              const word = token.text;
              const traditionalText = useTraditional ? (convertedTexts.get(word) ?? word) : word;
              const isHighlighted = highlightTerms?.some((t) => t === word);
              // In word-replace phonetics mode, use pronunciation as the display text.
              // When interlinear definition is on, always show the original word
              // (with optional ruby) — matching web's token-span.tsx behavior.
              // Highlighted (target) words keep their written form unless
              // phoneticsOnHighlight is set (review card flip, SPEC-049 §6.1).
              const displayText = replaceWithPhonetics && !showDefinition && shouldShowPhonetics(token) && token.pronunciation
                && (!isHighlighted || phoneticsOnHighlight)
                ? token.pronunciation
                : traditionalText;
              const isRevealed = revealedTokens.has(i);
              const isBlanked = quizMode && !isRevealed;
              const firstLemma = token.lemmas[0]?.lemma;
              const { byeonggiText, firstDef } = getTokenEntryData(token);
              const l1GlossDef = l1Glosses[firstLemma ?? word] ?? l1Glosses[word] ?? null;
              const quickGlossDef = l1GlossDef ?? firstDef;
              const showByeonggi = byeonggiEnabled && !!byeonggiText;
              const showTokenPhonetics = shouldShowPhonetics(token);
              const isSaved = savedFormSet.has(word.toLowerCase());

              // Trim the interlinear definition to the word's length + 2 chars
              // (one extra character on each side), scaled up because definition
              // text is ~0.55x font size (so ~1.8x more chars fit per unit width).
              const trimmedDef = (() => {
                if (!firstDef) return null;
                const maxDefChars = Math.round((displayText.length + 2) * 1.8);
                return firstDef.length > maxDefChars ? firstDef.slice(0, maxDefChars - 1) + '…' : firstDef;
              })();

              // Quick gloss and interlinear definition coexist (matching web).
              // Quick gloss: 'def' marker inline after saved words.
              // Interlinear: definition stacked below all words.
              const showQuickGloss = isSaved && quickGlossEnabled && !!quickGlossDef && !isHighlighted;
              const showInterlinear = showDefinition && !!trimmedDef && !isBlanked;

              // Ruby only in actual ruby mode (not when View-based is triggered by showDefinition alone)
              // Suppress ruby for the highlighted (target) word unless
              // phoneticsOnHighlight is set (review card flip, SPEC-049 §6.1).
              const isRubyMode = showPhonetics && phonetics.show === 'ruby';
              const hasRuby = isRubyMode && showTokenPhonetics && token.pronunciation && token.pronunciation !== word
                && (!isHighlighted || phoneticsOnHighlight);
              const rubySegs: RubySegment[] = hasRuby
                ? buildRuby(displayText, token.pronunciation!, l2Code)
                : [{ text: displayText }];

              const handlePress = () => {
                const rawUrl = tokenFormat?.url ?? null;
                const linkUrl = rawUrl && (onOpenLink || /^https?:\/\//i.test(rawUrl)) ? rawUrl : null;
                if (linkUrl && !popupEnabled) {
                  onOpenLink?.(linkUrl);
                  return;
                }
                if (quizMode) {
                  setRevealedTokens(prev => new Set(prev).add(i));
                  return;
                }
                if (popupEnabled) {
                  configureLayoutAnimation();
                  setSelectedWord(word);
                  setSelectedLemma(firstLemma || null);
                  setSelectedTokenPron(token.pronunciation ?? null);
                  setSelectedLinkUrl(linkUrl);
                }
              };

              const isSavedWord = isSaved && !isHighlighted && !isBlanked;
              const tokenFormat = tokenFormatMap[i] ?? null;
              const isLink = !!tokenFormat?.url;
              const isSearchHighlight = !!tokenFormat?.highlight;

              return (
                <View key={i} className="items-center" style={[isKaraokeDimmed ? { opacity: 0.4 } : undefined, { paddingTop: rubyGapTrim }]}>
                  {/* One pressable per token: the whole word — kanji + kana +
                      furigana + quick gloss — shares a single tap target, matching
                      web's token-span.tsx wrapper span. */}
                  <Pressable
                    testID={`token-${i}`}
                    onPress={handlePress}
                    style={({ pressed }) => (pressed ? { opacity: 0.45 } : undefined)}
                  >
                    {/* Segment row + quick gloss: items-end so the gloss (no furigana)
                        baseline-aligns with the word text at the bottom of the segment columns. */}
                    <View className="flex-row items-end">
                      {rubySegs.map((seg, j) => (
                        <View key={j} className="items-center">
                          {seg.reading && (
                            <Text style={{ fontSize: readingSize, lineHeight: readingSize + 2, marginBottom: -rubyGapTrim }} className="text-muted-foreground">{seg.reading}</Text>
                          )}
                          {/* Spacer: align kana-only segments with kanji segments that have ruby above.
                              Matches the reading text's lineHeight so base texts share a baseline. */}
                          {hasRuby && !seg.reading && (
                            <View style={{ height: readingSize + 2, marginBottom: -rubyGapTrim }} />
                          )}
                          <Text style={[textStyle, { lineHeight: baseLeading }]}>
                            {isBlanked ? (
                              <Text style={[textStyle, { lineHeight: baseLeading }]} className="text-foreground">▯</Text>
                            ) : (
                              <Text style={[textStyle, { lineHeight: baseLeading }]}
                                className={`${isHighlighted ? 'font-bold text-primary' : 'text-foreground'} ${isLink ? 'underline text-primary' : ''} ${isSearchHighlight ? 'bg-primary/20 rounded' : ''} ${isSavedWord ? 'bg-yellow-200/20 rounded' : ''}`}>
                                {seg.text}
                              </Text>
                            )}
                            {/* Byeonggi: inline after the word, smaller size, muted (matching web's token-span.tsx) */}
                            {showByeonggi && j === 0 ? (
                              <Text style={{ fontSize: readingSize }} className="text-muted-foreground/70"> {byeonggiText}</Text>
                            ) : null}
                          </Text>
                        </View>
                      ))}
                      {/* Quick gloss: peer of the segment columns, not inside any segment.
                          Placed after all segments so furigana centers over just the word,
                          not the word + gloss combined width. items-end keeps the gloss on
                          the same baseline as the word text.
                          Uses readingSize for fontSize (both outer and inner) — when furigana is
                          off, the outer wrapper must not inherit the word's full textStyle,
                          otherwise the word's large lineHeight applies to the gloss text too,
                          creating a tall invisible box that breaks baseline alignment. */}
                      {showQuickGloss && (
                        <Text style={{ fontSize: textStyle.fontSize ?? 16, lineHeight: baseLeading }}>
                          <Text style={{ fontSize: textStyle.fontSize ?? 16 }} className="text-muted-foreground">{` (‘${quickGlossDef}’) `}</Text>
                        </Text>
                      )}
                    </View>
                  </Pressable>
                  {/* Universal definition slot: when showDefinition is on, every token
                      gets a slot of the same height. Tokens without a definition get
                      an empty spacer — this keeps all word texts on the same baseline
                      regardless of which tokens have interlinear glosses. */}
                  {showDefinition && (
                    <View style={{ height: readingSize + 2, justifyContent: 'flex-start', alignItems: 'center' }}>
                      {showInterlinear ? (
                        <Text style={{ fontSize: readingSize, lineHeight: readingSize + 2 }} className="text-muted-foreground/60">{trimmedDef}</Text>
                      ) : (
                        <View style={{ height: readingSize + 2 }} />
                      )}
                    </View>
                  )}
                </View>
              );
            });
          })()}
          </View>
        ) : (
          /* Word-replace or no-phonetics mode: plain inline Text.
             Line-height is controlled by the `leading` prop (default: relaxed). */
          <Text testID={testID} style={[textStyle, leadingRatio ? { lineHeight: Math.round(textStyle.fontSize! * leadingRatio) } : undefined]} className={textColor}>
            {(() => {
              let wordIndexSoFar = 0;
              return tokens.map((token, i) => {
              const isWordToken = isWord(token);
              if (isWordToken) wordIndexSoFar++;
              const isKaraokeSpoken = karaokeProgress !== undefined ? wordIndexSoFar <= spokenWordCount : undefined;
              const isKaraokeDimmed = isKaraokeSpoken === false;

              const word = token.text;
              const tokenDisplayText = useTraditional ? (convertedTexts.get(word) ?? word) : word;
              const isHighlighted = highlightTerms?.some((t) => t === word);
              // Highlighted (target) words keep their written form unless
              // phoneticsOnHighlight is set (review card flip, SPEC-049 §6.1).
              const displayText = replaceWithPhonetics && isWordToken && shouldShowPhonetics(token) && token.pronunciation
                && (!isHighlighted || phoneticsOnHighlight)
                ? token.pronunciation
                : tokenDisplayText;
              const isRevealed = revealedTokens.has(i);
              const isBlanked = quizMode && !isRevealed;
              const firstLemma = token.lemmas[0]?.lemma;
              const { byeonggiText, firstDef } = getTokenEntryData(token);
              const l1GlossDef = l1Glosses[firstLemma ?? word] ?? l1Glosses[word] ?? null;
              const quickGlossDef = l1GlossDef ?? firstDef;
              const showByeonggi = byeonggiEnabled && !!byeonggiText;
              const isSaved = savedFormSet.has(word.toLowerCase());
              const showQuickGloss = isSaved && quickGlossEnabled && !!quickGlossDef && !isHighlighted;
              const isSavedWord = isSaved && !isHighlighted && !isBlanked;
              const tokenFormat = tokenFormatMap[i] ?? null;
              const isLink = !!tokenFormat?.url;
              const isSearchHighlight = !!tokenFormat?.highlight;

              const handlePress = () => {
                const rawUrl = tokenFormat?.url ?? null;
                const linkUrl = rawUrl && (onOpenLink || /^https?:\/\//i.test(rawUrl)) ? rawUrl : null;
                if (linkUrl && !popupEnabled) {
                  onOpenLink?.(linkUrl);
                  return;
                }
                if (quizMode) {
                  setRevealedTokens(prev => new Set(prev).add(i));
                  return;
                }
                if (popupEnabled && isWordToken) {
                  configureLayoutAnimation();
                  setSelectedWord(word);
                  setSelectedLemma(firstLemma || null);
                  setSelectedTokenPron(token.pronunciation ?? null);
                  setSelectedLinkUrl(linkUrl);
                }
              };

              return (
                <Text
                  key={i}
                  testID={`token-${i}`}
                  onPress={handlePress}
                  style={isKaraokeDimmed ? { opacity: 0.4 } : undefined}
                >
                  {isBlanked ? (
                    <Text className={textColor}>▯</Text>
                  ) : (
                    <Text className={`${isHighlighted ? 'font-bold text-primary' : ''} ${isLink ? 'underline text-primary' : ''} ${isSearchHighlight ? 'bg-primary/20 rounded' : ''} ${isSavedWord ? 'bg-yellow-200/20' : ''}`}>{displayText}</Text>
                  )}
                  {showByeonggi ? ` ${byeonggiText}` : ''}
                  {showQuickGloss ? <Text style={{ fontSize: textStyle.fontSize ?? 16 }} className="text-muted-foreground">{` (‘${quickGlossDef}’) `}</Text> : ''}
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
            tokenPron={selectedTokenPron ?? undefined}
            linkUrl={selectedLinkUrl}
            onOpenLink={onOpenLink}
            // Pass the immediate sentence as popup context (SPEC-049 §8.4
            // equivalent): the popup's AI explanation + translations are
            // biased by the surrounding sentence.
            context={text}
            onClose={() => { configureLayoutAnimation(); setSelectedWord(null); setSelectedLemma(null); setSelectedTokenPron(null); setSelectedLinkUrl(null); }}
          />
        )}
      </>
    );
  }

  // ── Loading / no tokens: show plain undivided text (matches Next.js) ──
  const fallbackStyle = leadingRatio ? { lineHeight: Math.round(16 * leadingRatio) } : undefined;

  // ── Loading: pulsing undivided text while lemmatization is in flight ──
  if (loading) {
    return (
      <Animated.Text
        testID={testID}
        className={`text-base ${textColor}`}
        style={[fallbackStyle, { opacity: pulseAnim }]}
      >
        {text}
      </Animated.Text>
    );
  }

  return <Text testID={testID} className={`text-base ${textColor}`} style={fallbackStyle}>{text}</Text>;
}
