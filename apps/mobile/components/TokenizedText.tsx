import React, { memo, useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { View, Text, Platform, Animated, Alert, Pressable } from 'react-native';
import type { TokenCache } from '@langplayer/shared';
import type { DictionaryEntry } from '@langplayer/shared';
import { firstGloss } from '@langplayer/shared';
import {
  baseCode,
  buildRuby,
  mergePhraseTokens,
  sentenceForToken,
  tokenMatchesAnyForm,
  tokenMatchesAnyTerm,
} from '@langplayer/utils';
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
import { tokenizedTextLogger } from '@/lib/logger';
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

const { log, logwarn } = tokenizedTextLogger;

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

/** RTL-script languages: the View-based ruby layout must reverse its flex
 *  row, otherwise words and their readings render in mirrored (LTR) order. */
const RTL_L2S = new Set(['ar', 'fa', 'he', 'ur', 'sd', 'ps', 'dv']);

/** Target gap (px) between furigana glyphs and the base text. Web's native
 *  <ruby> annotation sits ~0–2px above the base, so mobile matches that
 *  instead of leaving the base line's full half-leading as a gap. */
const RUBY_READING_GAP = 2;

/** Stable signature for opening the dictionary popup from a memoized token. */
type PressWordHandler = (
  index: number,
  word: string,
  lemma: string | null,
  pron: string | null,
  linkUrl: string | null,
) => void;

// ── Memoized per-token span (ruby / definition path) ──────────────────
// Extracted so a token press only re-renders the tapped token + the popup,
// not the block's other N tokens. Re-rendering every token of a large
// reader block on popup open cost seconds in dev (e.g. 4.6s for a ~300-token
// block) and, combined with whole-page re-renders during scroll/sync, froze
// the JS thread for up to ~47s.
interface RubyTokenSpanProps {
  index: number;
  word: string;
  displayText: string;
  pronunciation: string | null;
  hasRuby: boolean;
  isBlanked: boolean;
  isHighlighted: boolean;
  isLink: boolean;
  isSearchHighlight: boolean;
  isSavedWord: boolean;
  isTokenSelected: boolean;
  isKaraokeDimmed: boolean;
  showByeonggi: boolean;
  byeonggiText: string | null;
  showQuickGloss: boolean;
  quickGlossDef: string | null;
  showDefinition: boolean;
  showInterlinear: boolean;
  trimmedDef: string | null;
  firstLemma: string | null;
  linkUrl: string | null;
  l2Code: string;
  quizMode: boolean;
  popupEnabled: boolean;
  rubyPull: number;
  readingSize: number;
  baseLeading: number | undefined;
  textStyle: { fontSize?: number; fontFamily?: string; lineHeight?: number };
  onOpenLink?: (href: string) => void;
  onPressWord: PressWordHandler;
  onReveal: (index: number) => void;
}

const RubyTokenSpan = memo(function RubyTokenSpan(props: RubyTokenSpanProps) {
  const {
    index, word, displayText, pronunciation, hasRuby, isBlanked, isHighlighted, isLink,
    isSearchHighlight, isSavedWord, isTokenSelected, isKaraokeDimmed, showByeonggi, byeonggiText,
    showQuickGloss, quickGlossDef, showDefinition, showInterlinear, trimmedDef, firstLemma,
    linkUrl, l2Code, quizMode, popupEnabled, rubyPull, readingSize, baseLeading, textStyle,
    onOpenLink, onPressWord, onReveal,
  } = props;

  // Ruby segments are rebuilt only when the pieces change (displayText,
  // pronunciation, script); they are a fresh array each render otherwise,
  // which would defeat memoization.
  const rubySegs = useMemo<RubySegment[]>(() => {
    if (!hasRuby || !pronunciation) return [{ text: displayText }];
    return buildRuby(displayText, pronunciation, l2Code);
  }, [hasRuby, pronunciation, displayText, l2Code]);

  const handlePress = () => {
    if (linkUrl && !popupEnabled) {
      onOpenLink?.(linkUrl);
      return;
    }
    if (quizMode) {
      onReveal(index);
      return;
    }
    if (popupEnabled) {
      log(`[TokenizedText] ⏱ TOKEN-PRESS t=${Date.now()} word="${word}" index=${index}`);
      onPressWord(index, word, firstLemma, pronunciation, linkUrl);
    }
  };

  return (
    <View className="items-center" style={[isKaraokeDimmed ? { opacity: 0.4 } : undefined]}>
      {/* One pressable per token: the whole word — kanji + kana +
          furigana + quick gloss — shares a single tap target, matching
          web's token-span.tsx wrapper span. */}
      <Pressable
        testID={`token-${index}`}
        onPress={handlePress}
        className={`rounded ${isTokenSelected ? 'bg-primary/20' : ''} active:bg-muted/80`}
        style={({ pressed }) => (pressed ? { opacity: 0.45 } : undefined)}
      >
        {/* Segment row + quick gloss: items-end so the gloss (no furigana)
            baseline-aligns with the word text at the bottom of the segment columns. */}
        <View className="flex-row items-end">
          {rubySegs.map((seg, j) => (
            <View key={j} className="items-center">
              {seg.reading && (
                <Text style={{ fontSize: readingSize, lineHeight: readingSize, marginBottom: -rubyPull }} className={isTokenSelected ? 'text-primary' : 'text-muted-foreground'}>{seg.reading}</Text>
              )}
              {/* Spacer: align kana-only segments with kanji segments that have ruby above.
                  Matches the reading text's line box so base texts share a baseline. */}
              {hasRuby && !seg.reading && (
                <View style={{ height: readingSize, marginBottom: -rubyPull }} />
              )}
              <Text style={[textStyle, { lineHeight: baseLeading }]}>
                {isBlanked ? (
                  <Text style={[textStyle, { lineHeight: baseLeading }]} className="text-foreground">▯</Text>
                ) : (
                  <Text style={[textStyle, { lineHeight: baseLeading }]}
                    className={isTokenSelected
                      ? 'text-primary'
                      : `${isHighlighted ? 'font-bold text-primary' : 'text-foreground'} ${isLink ? 'underline text-primary' : ''} ${isSearchHighlight ? 'bg-primary/20 rounded' : ''} ${isSavedWord ? 'bg-yellow-200/20 rounded' : ''}`}>
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

// ── Memoized per-token span (plain inline-Text path) ─────────────────
interface PlainTokenSpanProps {
  index: number;
  word: string;
  displayText: string;
  isWordToken: boolean;
  isBlanked: boolean;
  isHighlighted: boolean;
  isLink: boolean;
  isSearchHighlight: boolean;
  isSavedWord: boolean;
  isTokenSelected: boolean;
  isPressed: boolean;
  isKaraokeDimmed: boolean;
  showByeonggi: boolean;
  byeonggiText: string | null;
  showQuickGloss: boolean;
  quickGlossDef: string | null;
  firstLemma: string | null;
  tokenPron: string | null;
  linkUrl: string | null;
  quizMode: boolean;
  popupEnabled: boolean;
  textColor: string;
  textStyle: { fontSize?: number; fontFamily?: string; lineHeight?: number };
  onOpenLink?: (href: string) => void;
  onPressWord: PressWordHandler;
  onReveal: (index: number) => void;
  onPressIn: (index: number) => void;
  onPressOut: (index: number | null) => void;
}

const PlainTokenSpan = memo(function PlainTokenSpan(props: PlainTokenSpanProps) {
  const {
    index, word, displayText, isWordToken, isBlanked, isHighlighted, isLink, isSearchHighlight,
    isSavedWord, isTokenSelected, isPressed, isKaraokeDimmed, showByeonggi, byeonggiText,
    showQuickGloss, quickGlossDef, firstLemma, tokenPron, linkUrl, quizMode, popupEnabled,
    textColor, textStyle, onOpenLink, onPressWord, onReveal, onPressIn, onPressOut,
  } = props;

  const handlePress = () => {
    if (linkUrl && !popupEnabled) {
      onOpenLink?.(linkUrl);
      return;
    }
    if (quizMode) {
      onReveal(index);
      return;
    }
    if (popupEnabled && isWordToken) {
      log(`[TokenizedText] ⏱ TOKEN-PRESS t=${Date.now()} word="${word}" index=${index}`);
      onPressWord(index, word, firstLemma, tokenPron, linkUrl);
    }
  };

  return (
    <Text
      testID={`token-${index}`}
      onPressIn={() => onPressIn(index)}
      onPressOut={() => onPressOut(null)}
      onPress={handlePress}
      style={isKaraokeDimmed ? { opacity: 0.4 } : undefined}
      className={
        isTokenSelected
          ? 'rounded bg-primary/20 text-primary'
          : isPressed
            ? 'rounded bg-muted/80'
            : undefined
      }
    >
      {isBlanked ? (
        <Text className={textColor}>▯</Text>
      ) : (
        <Text className={`${isHighlighted ? 'font-bold text-primary' : ''} ${isLink ? 'underline text-primary' : ''} ${isSearchHighlight ? 'bg-primary/20 rounded' : ''} ${isSavedWord && !isTokenSelected ? 'bg-yellow-200/20' : ''}`}>{displayText}</Text>
      )}
      {showByeonggi ? ` ${byeonggiText}` : ''}
      {showQuickGloss ? <Text style={{ fontSize: textStyle.fontSize ?? 16 }} className="text-muted-foreground">{` (‘${quickGlossDef}’) `}</Text> : ''}
    </Text>
  );
});

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
  /** When false, saved words are not highlighted (no yellow background).
   *  Defaults to true — saved words highlight as usual. Used by AI explanations. */
  highlightSaved?: boolean;
  /** Overrides the user's quick-gloss setting when provided. */
  quickGloss?: boolean;
  /** Overrides the user's interlinear-definition setting when provided. */
  showDefinition?: boolean;
  /** Overrides the user's byeonggi (hanja/hán tự) setting when provided. */
  byeonggi?: boolean;
  /** Overrides the tokenized-text mode. AI explanations pass 'normal' so
   *  quiz blanking never appears. */
  mode?: 'normal' | 'quiz';
  /** When true, renders the L2 token text bold (AI explanation spans). */
  bold?: boolean;
  /** Extra multiplier on top of the user's zoom setting. Defaults to 1 (user
   *  zoom alone); only single-line subtitles pass 1.5. SPEC-051: this is the
   *  only allowed non-default value. */
  textScale?: number;
  /** Inline tokenized text (e.g. AI explanation spans): no user-zoom scaling
   *  and no leading — inherit from the parent text. SPEC-051 §Target behavior. */
  inline?: boolean;
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
function TokenizedTextImpl({ text, l2Code, highlightTerms, tokens: preloadedTokens, tokenCache, tokenCacheLoaded, deferTokenization = false, karaokeProgress, leading = 'loose', testID, phoneticsOnHighlight = false, formats, onOpenLink, phonetics: phoneticsOverride, highlightSaved, quickGloss: quickGlossOverride, showDefinition: showDefinitionOverride, byeonggi: byeonggiOverride, mode: modeOverride, bold, textScale, inline = false, textColor = 'text-foreground' }: TokenizedTextProps) {
  const t = useT();
  const [tokens, setTokens] = useState<LemmatizedToken[]>(preloadedTokens ?? []);
  const [loading, setLoading] = useState(!preloadedTokens && !deferTokenization);
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [selectedLemma, setSelectedLemma] = useState<string | null>(null);
  const [selectedTokenPron, setSelectedTokenPron] = useState<string | null>(null);
  const [selectedLinkUrl, setSelectedLinkUrl] = useState<string | null>(null);
  const [selectedTokenIndex, setSelectedTokenIndex] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const popupOpenStartRef = useRef<number | null>(null);
  const popupCloseStartRef = useRef<number | null>(null);
  const popupRenderStartLoggedRef = useRef(false);
  const loadingRef = useRef(false);
  const lastTextRef = useRef(text);
  const tokenCacheRef = useRef(tokenCache); // stable access without deps churn
  tokenCacheRef.current = tokenCache;
  const { status } = useSyncStatus();
  const dictAvailable = useOfflineDictionaryAvailable(l2Code);
  // Offline + no downloaded dictionary: words can't be interactive. Render
  // plain text immediately (no pulsing tokenization) and explain on tap.
  const offlineNoDict = status.effectiveOffline && dictAvailable === false;

  // Warm the per-language SQLite handle (including its one-time schema
  // migration) as early as possible — on mount and again once availability
  // resolves — so the first popup tap doesn't pay the open cost on the hot
  // path. openOfflineDictionaryDB is a no-op when no file exists yet.
  useEffect(() => {
    void import('@/lib/dictionary-db')
      .then(({ openOfflineDictionaryDB }) => openOfflineDictionaryDB(l2Code))
      .catch(() => {});
  }, [l2Code, dictAvailable]);

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
  const quizMode = modeOverride === undefined ? tokenSettings.mode === 'quiz' : modeOverride === 'quiz';

  // ── hardWords filter + quickGloss (Phase 2: SPEC-019) ──
  const quickGlossEnabled = quickGlossOverride ?? tokenSettings.quickGloss;
  const showDefinition = showDefinitionOverride ?? l2Settings.tokenSpan.definition.show;
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
        if (cancelled) return;
        const uniqueTexts = [...new Set(tokens.map(t => t.text))];
        const mapping = new Map<string, string>();
        for (const text of uniqueTexts) {
          mapping.set(text, converter(text));
        }
        if (!cancelled) setConvertedTexts(mapping);
      } catch {
        logwarn(`[LP Mobile] ⚠️ Chinese script conversion failed — falling back to original text`);
        // OpenCC failed to load — fall back to original text (map stays empty)
      }
    })();
    return () => { cancelled = true; };
  }, [tokens, useTraditional, isChinese, l2Code]);

  const byeonggiEnabled = byeonggiOverride ?? (l2Settings.display.byeonggi !== false);

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
  // Plain-text branch: pressed-token index for immediate touch feedback.
  const [pressedTokenIndex, setPressedTokenIndex] = useState<number | null>(null);
  // Sentence containing the tapped token — matches web's Intl.Segmenter
  // context instead of passing the whole block to the dictionary popup.
  const selectedTokenForContext = selectedTokenIndex != null ? tokens[selectedTokenIndex] : undefined;
  const popupContext = selectedTokenForContext
    ? sentenceForToken(text, tokens, selectedTokenForContext, baseCode(l2Code))
    : text;

  // Batch dictionary lookup layer (matches web's tokenized-text.tsx)
  const [cacheVersion, setCacheVersion] = useState(0);
  // L1-translated quick glosses keyed by lookup text (non-English UI only).
  const [l1Glosses, setL1Glosses] = useState<Record<string, string>>({});

  // ── Computed text styles from zoom + typeFace settings ──
  const textStyle = useMemo(() => {
    const zoom = tokenSettings.zoom;
    const zoomRem = ZOOM_TO_REM[zoom] ?? 1;
    // Matches web: block-level text is user zoom × textScale (1 default,
    // 1.5 for single-line subtitles). Inline text has no size of its own —
    // it inherits from the parent Text.
    const effectiveScale = (textScale ?? 1) * zoomRem;
    const style: { fontSize?: number; fontFamily?: string; lineHeight?: number; fontWeight?: 'normal' | 'bold' } = {};
    if (!inline) style.fontSize = 16 * effectiveScale;

    if (tokenSettings.typeFace === 'serif') {
      style.fontFamily = Platform.OS === 'ios' ? 'Georgia' : 'serif';
    } else if (tokenSettings.typeFace === 'sans-serif') {
      style.fontFamily = Platform.OS === 'ios' ? 'Avenir Next' : 'sans-serif';
    }
    if (bold) {
      style.fontWeight = 'bold';
    }

    return style;
  }, [tokenSettings.zoom, tokenSettings.typeFace, textScale, inline, bold]);

  // ── Leading ratio from prop (default: loose = 2) ──
  const LEADING_RATIOS: Record<string, number> = {
    relaxed: 1.625,
    normal: 1.5,
    tight: 1.25,
    snug: 1.375,
    loose: 2,
  };
  const leadingRatio: number | undefined = inline || leading === 'none' ? undefined : (LEADING_RATIOS[leading] ?? 2);
  const fallbackLineHeight = leadingRatio ? Math.round((textStyle.fontSize ?? 16) * leadingRatio) : undefined;
  const fallbackStyle = fallbackLineHeight ? { lineHeight: fallbackLineHeight } : undefined;

  // ── Quick lookup set for saved word forms (quickGloss) ──
  const savedFormSet = useMemo(() => {
    const words = savedWords[l2Code] ?? [];
    const forms = new Set<string>();
    for (const w of words) {
      if (w.head) forms.add(w.head.toLowerCase());
      if (w.forms) for (const f of w.forms) forms.add(f.toLowerCase());
      if (w.context?.form) forms.add((w.context.form as string).toLowerCase());
      for (const inst of w.instances ?? []) {
        if (inst.form) forms.add(inst.form.toLowerCase());
      }
    }
    return forms;
  }, [savedWords, l2Code]);

  // Saved phrase candidates — every saved form (head + inflections + per-
  // instance surface) that could span multiple tokens. The merge below
  // collapses exact token-boundary matches into one atomic token so
  // multi-token phrases (e.g. "got even with me" saved under "to get even
  // with someone") highlight as saved in the review context.
  const savedPhraseCandidates = useMemo(() => {
    const words = savedWords[l2Code] ?? [];
    const out: string[] = [];
    const seen = new Set<string>();
    const add = (form: unknown) => {
      if (typeof form !== 'string' || !form.trim()) return;
      const key = form.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(form);
    };
    for (const w of words) {
      if (w.head) add(w.head);
      if (w.forms) for (const f of w.forms) add(f);
      if (w.context?.form) add(w.context.form);
      for (const inst of w.instances ?? []) if (inst.form) add(inst.form);
    }
    return out;
  }, [savedWords, l2Code]);

  // Merge saved multi-token phrases only in interactive highlight contexts
  // (the review card). Readers keep the raw token indices so EPUB format
  // ranges and links stay aligned.
  const displayTokens = useMemo(
    () =>
      highlightTerms && highlightTerms.length > 0 && !formats?.length
        ? mergePhraseTokens(text, tokens, savedPhraseCandidates)
        : tokens,
    [text, tokens, savedPhraseCandidates, highlightTerms, formats],
  );

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

  // ── Popup timing diagnostics ──
  useEffect(() => {
    if (selectedWord) {
      if (popupOpenStartRef.current !== null) {
        log(`[TokenizedText] ⏱ POPUP-OPEN render=${Date.now() - popupOpenStartRef.current}ms word="${selectedWord}"`);
        popupOpenStartRef.current = null;
        popupRenderStartLoggedRef.current = false;
      }
    } else if (popupCloseStartRef.current !== null) {
      log(`[TokenizedText] ⏱ POPUP-CLOSE render=${Date.now() - popupCloseStartRef.current}ms`);
      popupCloseStartRef.current = null;
    }
  }, [selectedWord]);

  // ── Stable token-press handlers (memoized tokens call these) ──
  const handlePressWord = useCallback<PressWordHandler>((index, word, lemma, pron, linkUrl) => {
    popupOpenStartRef.current = Date.now();
    setSelectedWord(word);
    setSelectedTokenIndex(index);
    setSelectedLemma(lemma);
    setSelectedTokenPron(pron);
    setSelectedLinkUrl(linkUrl);
  }, []);

  const handleReveal = useCallback((index: number) => {
    setRevealedTokens(prev => new Set(prev).add(index));
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
        // Batch lookup is case-sensitive, but Vietnamese (and other Latin
        // script) lemmatization keeps sentence-initial capitals. Enqueue the
        // lowercase form too so dictionary entries populate for "Bạn"/"bạn".
        const lower = t.toLowerCase();
        if (lower !== t && !uniqueLemmas.has(lower)) {
          uniqueLemmas.set(lower, lemma.part_of_speech ?? '');
        }
      }
      // Also include surface form if different from lemmas
      const surface = token.text.trim();
      if (surface && surface.length > 0 && !/^[\s\p{P}]+$/u.test(surface) && !uniqueLemmas.has(surface)) {
        uniqueLemmas.set(surface, '');
      }
      const surfaceLower = surface.toLowerCase();
      if (surfaceLower !== surface && !uniqueLemmas.has(surfaceLower)) {
        uniqueLemmas.set(surfaceLower, '');
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
    // glosses work everywhere (including video subtitles). Also check the
    // lowercase form — the batch lookup is case-sensitive on the server, while
    // Vietnamese lemmatization keeps sentence-initial capitals ("Bạn").
    const entries =
      getCachedEntries(l2Code, firstLemma) ??
      getCachedEntries(baseCode(l2Code), firstLemma) ??
      getCachedEntries(l2Code, firstLemma.toLowerCase()) ??
      getCachedEntries(baseCode(l2Code), firstLemma.toLowerCase());
    if (!entries || entries.length === 0) {
      // Try surface form if lemma didn't match
      const surfaceEntries =
        getCachedEntries(l2Code, token.text) ??
        getCachedEntries(baseCode(l2Code), token.text) ??
        getCachedEntries(l2Code, token.text.toLowerCase()) ??
        getCachedEntries(baseCode(l2Code), token.text.toLowerCase());
      if (surfaceEntries && surfaceEntries.length > 0) {
        const e = surfaceEntries[0]!;
        return {
          byeonggiText: e.han_script?.hanja ?? e.han_script?.hantu ?? e.han_script?.han ?? null,
          firstDef: e.definitions ? firstGloss(e.definitions) : null,
        };
      }
      return { byeonggiText: null, firstDef: null };
    }
    const firstEntry = entries[0]!;
    return {
      byeonggiText: firstEntry.han_script?.hanja ?? firstEntry.han_script?.hantu ?? firstEntry.han_script?.han ?? null,
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

  // ── Popup open render timing (phase 1) ──
  // Log the moment this block's render actually begins after a token press,
  // so POPUP-OPEN splits into "JS thread busy before this render started"
  // (sincePress) vs "render + commit" (POPUP-OPEN minus sincePress).
  if (selectedWord && popupOpenStartRef.current !== null && !popupRenderStartLoggedRef.current) {
    popupRenderStartLoggedRef.current = true;
    log(`[TokenizedText] ⏱ POPUP-RENDER-START word="${selectedWord}" sincePress=${Date.now() - popupOpenStartRef.current}ms`);
  }

  // Offline without a downloaded dictionary: words can't be interactive.
  // Render plain text immediately and explain on tap — never show the
  // pulsing tokenization state in this case.
  if (offlineNoDict) {
    return (
      <Text
        className={textColor}
        style={[textStyle, fallbackStyle]}
        onPress={() => Alert.alert(t('title.offline_dictionaries'), t('msg.offline_dictionary_required'))}
      >
        {text}
      </Text>
    );
  }

  if (tokens.length > 0) {
    const isWord = (t: LemmatizedToken) => t.lemmas.length > 0;
    const isRtl = RTL_L2S.has(baseCode(l2Code));
    const tokenFontSize = textStyle.fontSize ?? 16;
    const readingSize = Math.max(8, Math.round(tokenFontSize * 0.55));
    const baseLeading = leadingRatio ? Math.round(tokenFontSize * leadingRatio) : undefined;
    // Match web's native ruby: the reading's line box (readingSize, no extra
    // leading) overlaps the base text's top half-leading, so the column stays
    // ≈ baseLeading tall. Pulling the base text up by `rubyPull` leaves only
    // RUBY_READING_GAP px between the reading glyphs and the base glyphs.
    const halfLeading = Math.round(((baseLeading ?? tokenFontSize) - tokenFontSize) / 2);
    const rubyPull = Math.max(0, halfLeading - RUBY_READING_GAP);

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
          <View testID={testID} className="flex-row flex-wrap items-end" style={isRtl ? { direction: 'rtl' } : undefined}>
            {(() => {
              let wordIndexSoFar = 0;
              return displayTokens.map((token, i) => {
              if (!isWord(token)) {
                // Whitespace gap tokens must get explicit dimensions: in this
                // View-based (ruby/definition) path every token is a flex
                // item, and Yoga collapses whitespace-only <Text> items to
                // zero width — words would render flush together (regression
                // surfaced with space-separated non-Latin text, e.g. Greek).
                const isSpace = token.text === ' ';
                const isTab = token.text === '\t';
                const isNewline = token.text === '\n';
                const whitespaceStyle = isSpace
                  ? { width: Math.max(2, Math.round(tokenFontSize * 0.28)) }
                  : isTab
                    ? { width: Math.max(2, Math.round(tokenFontSize * 1.1)) }
                    : isNewline
                      ? { flexBasis: '100%' as const, height: 0 }
                      : undefined;
                return (
                  <View key={i} className="items-center" style={whitespaceStyle}>
                    {!isNewline && (
                      <Text style={[textStyle, { lineHeight: baseLeading }]} className={textColor}>{token.text}</Text>
                    )}
                    {/* Universal definition slot: when showDefinition is on, every token
                        gets a slot of the same height so all word texts share a baseline.
                        Punctuation gets an empty spacer. */}
                    {showDefinition && !isNewline && (
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
              // Script conversion map is populated for both directions
              // (simplified or traditional preference); empty map = identity.
              const traditionalText = convertedTexts.get(word) ?? word;
              const isHighlighted = tokenMatchesAnyTerm(token, highlightTerms);
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
              const isSaved = highlightSaved !== false && tokenMatchesAnyForm(token, savedFormSet);

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
              const hasRuby = !!(isRubyMode && showTokenPhonetics && token.pronunciation && token.pronunciation !== word
                && (!isHighlighted || phoneticsOnHighlight));

              const isSavedWord = isSaved && !isHighlighted && !isBlanked;
              const tokenFormat = tokenFormatMap[i] ?? null;
              const isLink = !!tokenFormat?.url;
              const isSearchHighlight = !!tokenFormat?.highlight;
              const isTokenSelected = selectedTokenIndex === i;
              const rawUrl = tokenFormat?.url ?? null;
              const linkUrl = rawUrl && (onOpenLink || /^https?:\/\//i.test(rawUrl)) ? rawUrl : null;

              return (
                <RubyTokenSpan
                  key={i}
                  index={i}
                  word={word}
                  displayText={displayText}
                  pronunciation={token.pronunciation ?? null}
                  hasRuby={hasRuby}
                  isBlanked={isBlanked}
                  isHighlighted={isHighlighted}
                  isLink={isLink}
                  isSearchHighlight={isSearchHighlight}
                  isSavedWord={isSavedWord}
                  isTokenSelected={isTokenSelected}
                  isKaraokeDimmed={isKaraokeDimmed}
                  showByeonggi={showByeonggi}
                  byeonggiText={byeonggiText}
                  showQuickGloss={showQuickGloss}
                  quickGlossDef={quickGlossDef}
                  showDefinition={showDefinition}
                  showInterlinear={showInterlinear}
                  trimmedDef={trimmedDef}
                  firstLemma={firstLemma}
                  linkUrl={linkUrl}
                  l2Code={l2Code}
                  quizMode={quizMode}
                  popupEnabled={popupEnabled}
                  rubyPull={rubyPull}
                  readingSize={readingSize}
                  baseLeading={baseLeading}
                  textStyle={textStyle}
                  onOpenLink={onOpenLink}
                  onPressWord={handlePressWord}
                  onReveal={handleReveal}
                />
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
              return displayTokens.map((token, i) => {
              const isWordToken = isWord(token);
              if (isWordToken) wordIndexSoFar++;
              const isKaraokeSpoken = karaokeProgress !== undefined ? wordIndexSoFar <= spokenWordCount : undefined;
              const isKaraokeDimmed = isKaraokeSpoken === false;

              const word = token.text;
              // Script conversion map is populated for both directions
              // (simplified or traditional preference); empty map = identity.
              const tokenDisplayText = convertedTexts.get(word) ?? word;
              const isHighlighted = tokenMatchesAnyTerm(token, highlightTerms);
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
              const isSaved = highlightSaved !== false && tokenMatchesAnyForm(token, savedFormSet);
              const showQuickGloss = isSaved && quickGlossEnabled && !!quickGlossDef && !isHighlighted;
              const isSavedWord = isSaved && !isHighlighted && !isBlanked;
              const tokenFormat = tokenFormatMap[i] ?? null;
              const isLink = !!tokenFormat?.url;
              const isSearchHighlight = !!tokenFormat?.highlight;
              const isTokenSelected = selectedTokenIndex === i;
              const isPressed = pressedTokenIndex === i;

              const rawUrl = tokenFormat?.url ?? null;
              const linkUrl = rawUrl && (onOpenLink || /^https?:\/\//i.test(rawUrl)) ? rawUrl : null;
              const tokenPron = token.pronunciation ?? null;

              return (
                <PlainTokenSpan
                  key={i}
                  index={i}
                  word={word}
                  displayText={displayText}
                  isWordToken={isWordToken}
                  isBlanked={isBlanked}
                  isHighlighted={isHighlighted}
                  isLink={isLink}
                  isSearchHighlight={isSearchHighlight}
                  isSavedWord={isSavedWord}
                  isTokenSelected={isTokenSelected}
                  isPressed={isPressed}
                  isKaraokeDimmed={isKaraokeDimmed}
                  showByeonggi={showByeonggi}
                  byeonggiText={byeonggiText}
                  showQuickGloss={showQuickGloss}
                  quickGlossDef={quickGlossDef}
                  firstLemma={firstLemma}
                  tokenPron={tokenPron}
                  linkUrl={linkUrl}
                  quizMode={quizMode}
                  popupEnabled={popupEnabled}
                  textColor={textColor}
                  textStyle={textStyle}
                  onOpenLink={onOpenLink}
                  onPressWord={handlePressWord}
                  onReveal={handleReveal}
                  onPressIn={setPressedTokenIndex}
                  onPressOut={setPressedTokenIndex}
                />
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
            // Immediate-sentence context (SPEC-049 §8.4 equivalent): the
            // popup's AI explanation, image search, and saved-word context
            // are limited to the sentence the token was tapped in.
            context={popupContext}
            onClose={() => { popupCloseStartRef.current = Date.now(); setSelectedWord(null); setSelectedTokenIndex(null); setSelectedLemma(null); setSelectedTokenPron(null); setSelectedLinkUrl(null); }}
          />
        )}
      </>
    );
  }

  // ── Loading: pulsing undivided text while lemmatization is in flight ──
  if (loading) {
    return (
      <Animated.Text
        testID={testID}
        className={textColor}
        style={[textStyle, fallbackStyle, { opacity: pulseAnim }]}
      >
        {text}
      </Animated.Text>
    );
  }

  return <Text testID={testID} className={textColor} style={[textStyle, fallbackStyle]}>{text}</Text>;
}

// Memoized export: the reader re-renders its whole page on every scroll-window
// change, tokenCache batch, and sync-status update. Without memoization that
// re-renders every block's full token tree (thousands of NativeWind Views),
// which blocked the JS thread for up to ~47s (popup opens queued behind it).
// The comparator ignores the `tokenCache` object identity — it is read through
// a ref and only gets a new identity when `tokenCacheLoaded` flips (the video
// cache's useMemo is keyed on `loaded`), which the comparator does include.
function tokenizedTextPropsEqual(prev: TokenizedTextProps, next: TokenizedTextProps): boolean {
  return (
    prev.text === next.text &&
    prev.l2Code === next.l2Code &&
    prev.tokens === next.tokens &&
    prev.deferTokenization === next.deferTokenization &&
    prev.karaokeProgress === next.karaokeProgress &&
    prev.leading === next.leading &&
    prev.testID === next.testID &&
    prev.phoneticsOnHighlight === next.phoneticsOnHighlight &&
    prev.formats === next.formats &&
    prev.onOpenLink === next.onOpenLink &&
    prev.phonetics === next.phonetics &&
    prev.textScale === next.textScale &&
    prev.inline === next.inline &&
    prev.textColor === next.textColor &&
    prev.highlightTerms === next.highlightTerms &&
    prev.tokenCacheLoaded === next.tokenCacheLoaded
  );
}

export const TokenizedText = memo(TokenizedTextImpl, tokenizedTextPropsEqual);
