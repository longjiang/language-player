import React, { memo, useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { View, Text, Animated, Alert } from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import { useColorScheme } from 'nativewind';
import type { TokenCache } from '@langplayer/shared';
import type { DictionaryEntry } from '@langplayer/shared';
import {
  colors,
  decomposeWordId,
  firstGloss,
  hslToHex,
  isSameEntryId,
  semanticColorsForMobile,
} from '@langplayer/shared';
import {
  baseCode,
  buildRuby,
  kanaFormsForEntries,
  mergePhraseTokens,
  sentenceForToken,
  tokenMatchesAnyForm,
  tokenMatchesAnyTerm,
} from '@langplayer/utils';
import type { RubySegment } from '@langplayer/utils';
import type { LemmatizedToken } from '@langplayer/shared';
import { lemmatizeText, prewarmLocalLemmatizer } from '@/lib/tokenizer';
import { enqueueLemmatize } from '@/lib/lemmatize-queue';
import { lookupOfflineManyByL2 } from '@/lib/dictionary-db';
import { isOfflineModeEnabled } from '@/lib/offline-mode';
import { computeRubyLayout, MOBILE_RUBY_SAVED_BG, typeFaceFontFamily, useMobileRubyColors } from '@/lib/ruby-layout';
import { getWordDifficulty, type WordDifficulty } from '@/lib/word-difficulty';
import { PlainTokenSpan, RubyTextParagraphBlock, RubyTokenFlat, RubyTokenSpan, type ParagraphRun, type ParagraphTapAction, type PressWordHandler } from '@/components/tokenized-text-spans';
import { logPhoneticsSummary, logRubyRenderPath, logRenderedTokens, scheduleTreeLog } from '@/lib/tokenized-text-log';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useSyncStatus } from '@/contexts/SyncStatusContext';
import { useSavedWords } from '@/hooks/use-saved-words';
import { useOfflineDictionaryAvailable } from '@/hooks/use-offline-dictionary';
import { useProgressLevel } from '@/hooks/use-progress-level';
import { useT } from '@/hooks/use-t';
import { DictionaryPopup } from '@/components/dictionary/DictionaryPopup';
import {
  RubyText,
  RubyTextParagraph,
  isNativeRubyActive,
  isNativeRubyParagraphActive,
} from '@/components/RubyText';
import { tokenizedTextLogger, log as appLog } from '@/lib/logger';
import { PYTHON_API_URL } from '@/lib/api-url';
import { ZOOM_TO_REM } from '@/lib/text-scale';
import {
  enqueueLookupWords,
  getCachedEntries,
  getCacheVersion,
  getCachedEntryById,
  setCachedEntries,
} from '@/lib/dictionary-cache';
import { useEffectiveHighlightTerms, useHighlightKanaForms, useSavedPhraseCandidates } from '@/hooks/use-highlight-forms';
import { fetchL1Gloss, getL1Gloss } from '@/lib/l1-gloss';
import { getConverter, getSimplifiedConverter } from '@/lib/chinese-script';
import type { SavedWordMeta } from '@/contexts/SavedWordsContext';
import type { EpubFormatRange } from '@/lib/epub-parser';

const { log, logwarn } = tokenizedTextLogger;
const NATIVE_RUBY_ACTIVE = isNativeRubyActive();
const NATIVE_PARAGRAPH_ACTIVE = isNativeRubyParagraphActive();


export interface TokenizedTextProps {
  text: string;
  l2Code: string;
  highlightTerms?: string[];
  /** Entry ids (e.g. the saved word's id) to highlight by dictionary
   *  resolution, matching web's tokenized-text.tsx. Catches inflected
   *  surfaces whose lemma resolves to the target entry even when the exact
   *  surface form isn't in `highlightTerms`. */
  highlightEntryIds?: string[];
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
   * Line-height (leading) multiplier for tokenized text (1–2). Defaults to
   * the display-settings value (1.625×).
   */
  leading?: number;
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
  /** Explicit font size (px) for inline text. Inline normally inherits the
   *  parent Text's size, but the ruby/definition path renders tokens inside
   *  Views where inheritance can't reach them — pass the parent's size here
   *  (e.g. the settings preview scaled by the user's zoom). */
  inlineFontSize?: number;
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
function TokenizedTextImpl({ text, l2Code, highlightTerms, highlightEntryIds, tokens: preloadedTokens, tokenCache, tokenCacheLoaded, deferTokenization = false, karaokeProgress, leading, testID, phoneticsOnHighlight = false, formats, onOpenLink, phonetics: phoneticsOverride, highlightSaved, quickGloss: quickGlossOverride, showDefinition: showDefinitionOverride, byeonggi: byeonggiOverride, mode: modeOverride, bold, textScale, inline = false, inlineFontSize, textColor = 'text-foreground' }: TokenizedTextProps) {
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
  const rubyColors = useMobileRubyColors();
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

  // ── Map format ranges (links, highlights, markdown bold/italic/code) onto
  //    token indices. Surface tokens concatenate back to `text`; when that
  //    invariant breaks (e.g. a tokenizer quirk), formats are not applied. ──
  const tokenFormatMap = useMemo<Array<{
    url?: string;
    highlight?: boolean;
    bold?: boolean;
    italic?: boolean;
    code?: boolean;
  } | null>>(() => {
    if (!formats?.length || tokens.length === 0) return [];
    const total = tokens.reduce((sum, t) => sum + t.text.length, 0);
    if (total !== text.length) return [];
    let pos = 0;
    return tokens.map((token) => {
      let format: { url?: string; highlight?: boolean; bold?: boolean; italic?: boolean; code?: boolean } | null = null;
      for (const f of formats) {
        if (pos < f.end && pos + token.text.length > f.start) {
          if (f.type === 'highlight') {
            format = { ...(format ?? {}), highlight: true };
          } else if (f.type === 'link') {
            format = { ...(format ?? {}), url: f.url };
          } else if (f.type === 'bold') {
            format = { ...(format ?? {}), bold: true };
          } else if (f.type === 'italic') {
            format = { ...(format ?? {}), italic: true };
          } else if (f.type === 'code') {
            format = { ...(format ?? {}), code: true };
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
    if (inlineFontSize !== undefined) {
      style.fontSize = inlineFontSize;
    } else if (!inline) {
      style.fontSize = 16 * effectiveScale;
    }

    const family = typeFaceFontFamily(tokenSettings.typeFace);
    if (family) style.fontFamily = family;
    if (bold) {
      style.fontWeight = 'bold';
    }

    return style;
  }, [tokenSettings.zoom, tokenSettings.typeFace, textScale, inline, inlineFontSize, bold]);

  // ── Leading ratio from prop (default: relaxed = 1.625) ──
  const effectiveLeading = leading ?? tokenSettings.leading ?? 1.625;
  const leadingRatio: number | undefined = inline ? undefined : effectiveLeading;
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

  // ── Saved word records by form (quick-gloss entry resolution) ──
  // A surface form can match several dictionary entries; the record the user
  // saved carries the exact entry id. Map each form to the most recently
  // saved record so the quick gloss shows the entry the user chose.
  const savedRecordByForm = useMemo(() => {
    const words = [...(savedWords[l2Code] ?? [])].sort((a, b) => {
      const ta = typeof a.date === 'number' ? a.date : a.savedAt ? Date.parse(a.savedAt) : 0;
      const tb = typeof b.date === 'number' ? b.date : b.savedAt ? Date.parse(b.savedAt) : 0;
      return (tb || 0) - (ta || 0);
    });
    const map = new Map<string, SavedWordMeta>();
    const add = (form: string | undefined, w: SavedWordMeta) => {
      if (!form || !form.trim()) return;
      const key = form.toLowerCase();
      if (!map.has(key)) map.set(key, w);
    };
    for (const w of words) {
      if (w.head) add(w.head, w);
      for (const f of w.forms ?? []) add(f, w);
      if (w.context?.form) add(w.context.form as string, w);
      for (const inst of w.instances ?? []) if (inst.form) add(inst.form, w);
    }
    return map;
  }, [savedWords, l2Code]);

  // Saved record for a token — surface form first, then lemma forms
  // (mirrors tokenMatchesAnyForm used for the saved highlight).
  const savedRecordForToken = useCallback((token: LemmatizedToken): SavedWordMeta | undefined => {
    const surface = savedRecordByForm.get(token.text.toLowerCase());
    if (surface) return surface;
    for (const l of token.lemmas) {
      const hit = savedRecordByForm.get(l.lemma.toLowerCase());
      if (hit) return hit;
    }
    return undefined;
  }, [savedRecordByForm]);

  // Resolve the exact dictionary entry behind a saved word record, from the
  // shared cache (the popup, review page, and offline hydration all index
  // entries by id) or the enriched canonicalEntry stored on the record.
  const resolveSavedEntry = useCallback((savedRecord: SavedWordMeta): DictionaryEntry | undefined => {
    const base = baseCode(l2Code);
    // Enriched entry stored on the record (saved-word cards) — only accept it
    // when it really is the saved entry (the API may return a scoped id).
    if (savedRecord.canonicalEntry && isSameEntryId(savedRecord.id, savedRecord.canonicalEntry.id, base)) {
      return savedRecord.canonicalEntry;
    }
    const tryIds = (id: string | undefined): DictionaryEntry | undefined => {
      if (!id) return undefined;
      return getCachedEntryById(l2Code, id) ?? getCachedEntryById(base, id);
    };
    const decomposed = decomposeWordId(savedRecord.id, base);
    return (
      tryIds(savedRecord.id) ??
      tryIds(savedRecord.entryId) ??
      (decomposed ? tryIds(decomposed.id) : undefined)
    );
  }, [l2Code]);

  // Saved phrase candidates — every saved form (head + inflections + per-
  // instance surface) that could span multiple tokens. The merge below
  // collapses exact token-boundary matches into one atomic token so
  // multi-token phrases (e.g. "got even with me" saved under "to get even
  // with someone") highlight as saved in the review context.
  const savedPhraseCandidates = useSavedPhraseCandidates(savedWords, l2Code);
  const highlightKanaForms = useHighlightKanaForms(highlightTerms, l2Code, cacheVersion);
  const effectiveHighlightTerms = useEffectiveHighlightTerms(highlightTerms, highlightKanaForms);

  // Merge saved multi-token phrases only in interactive highlight contexts
  // (the review card). Readers keep the raw token indices so EPUB format
  // ranges and links stay aligned.
  const displayTokens = useMemo(
    () =>
      effectiveHighlightTerms && effectiveHighlightTerms.length > 0 && !formats?.length
        ? mergePhraseTokens(text, tokens, [...savedPhraseCandidates, ...highlightKanaForms])
        : tokens,
    [text, tokens, savedPhraseCandidates, effectiveHighlightTerms, highlightKanaForms, formats],
  );

  // ── Rendered token structure (dev-only, once per text) ──
  useEffect(() => {
    logRenderedTokens(displayTokens, l2Code, text);
  }, [displayTokens, l2Code, text]);

  // Entry-id matching (web parity): highlight any token whose lemma (or
  // surface) resolves to one of the requested dictionary entries, so
  // inflected surfaces like 忠実な still highlight for the saved 忠実 entry.
  const highlightEntryIdSet = useMemo(
    () => new Set(highlightEntryIds ?? []),
    [highlightEntryIds],
  );
  const tokenHasTargetEntry = useCallback((token: LemmatizedToken): boolean => {
    if (highlightEntryIdSet.size === 0) return false;
    const base = baseCode(l2Code);
    const matches = (entries: DictionaryEntry[] | undefined): boolean =>
      !!entries?.some((e) =>
        [...highlightEntryIdSet].some((id) => isSameEntryId(id, e.id, base)),
      );
    for (const lemma of token.lemmas) {
      if (matches(getCachedEntries(base, lemma.lemma))) return true;
    }
    return matches(getCachedEntries(base, token.text));
  }, [highlightEntryIdSet, l2Code, cacheVersion]);

  // Search terms can appear inside compound tokens (e.g. 武侠 in 武侠片) —
  // highlight the whole token so the L2 matches the translation bold.
  const tokenMatchesOrContainsTerm = useCallback((token: LemmatizedToken): boolean => {
    if (tokenMatchesAnyTerm(token, effectiveHighlightTerms)) return true;
    const surface = token.text.toLowerCase();
    return (effectiveHighlightTerms ?? []).some((t) => {
      const form = t.toLowerCase();
      return form.length > 0 && surface.includes(form);
    });
  }, [effectiveHighlightTerms]);

  // ── Highlight diagnostics (dev-only, once per text) ──
  // Review-card target words (e.g. しかるべき) can fail to highlight when the
  // lemmatizer splits them (しかる + べき). Two logs, both fired only in
  // target-highlight contexts (review card / entry-id highlight):
  //   1. HIGHLIGHT-MERGE — raw tokens, saved phrase candidates, and which
  //      candidates appear in the text but never become an atomic display
  //      token (the merge step in mergePhraseTokens failed or the form is
  //      missing from savedPhraseCandidates).
  //   2. HIGHLIGHT-VERDICT — per display-token predicates exactly as the
  //      render computes them (isSaved / isHighlighted / isSavedWord), so a
  //      missing highlight is traceable to either the merge or the match.
  const loggedHighlightDiagTexts = useRef(new Set<string>());
  useEffect(() => {
    if (!__DEV__) return;
    const key = `merge:${l2Code}:${text}`;
    if (loggedHighlightDiagTexts.current.has(key)) return;
    const terms = highlightTerms ?? [];
    if (terms.length === 0 && (highlightEntryIds?.length ?? 0) === 0) return;
    loggedHighlightDiagTexts.current.add(key);

    const mergedSurfaces = new Set(displayTokens.map((t) => t.text.toLowerCase()));
    const lowerText = text.toLowerCase();
    const missedPhrases = savedPhraseCandidates.filter((p) => {
      const lp = p.toLowerCase();
      return lp.length >= 2 && lowerText.includes(lp) && !mergedSurfaces.has(lp);
    });
    appLog(
      `[TokenizedText] 🔎 HIGHLIGHT-MERGE l2=${l2Code} text="${text.slice(0, 100)}"`,
      {
        rawTokens: tokens.map((t) => ({ text: t.text, lemmas: t.lemmas.map((l) => l.lemma) })),
        displayTokens: displayTokens.map((t) => ({ text: t.text, lemmas: t.lemmas.map((l) => l.lemma) })),
        highlightTerms: terms,
        highlightEntryIds: highlightEntryIds ?? [],
        savedPhraseCandidates: savedPhraseCandidates.slice(0, 50),
        missedPhrases,
      },
    );
  }, [displayTokens, tokens, savedPhraseCandidates, highlightTerms, highlightEntryIds, l2Code, text]);

  useEffect(() => {
    if (!__DEV__) return;
    const key = `verdict:${l2Code}:${text}`;
    if (loggedHighlightDiagTexts.current.has(key)) return;
    const terms = highlightTerms ?? [];
    if (terms.length === 0 && (highlightEntryIds?.length ?? 0) === 0) return;
    loggedHighlightDiagTexts.current.add(key);
    const verdicts = displayTokens.map((token) => {
      const isSaved = highlightSaved !== false && tokenMatchesAnyForm(token, savedFormSet);
      const isHighlighted = tokenMatchesOrContainsTerm(token) || tokenHasTargetEntry(token);
      return {
        text: token.text,
        lemmas: token.lemmas.map((l) => l.lemma),
        isSaved,
        isHighlighted,
        isSavedWord: isSaved && !isHighlighted,
      };
    });
    appLog(
      `[TokenizedText] 🎯 HIGHLIGHT-VERDICT l2=${l2Code} text="${text.slice(0, 100)}"`,
      { highlightSaved, verdicts },
    );
  }, [displayTokens, savedFormSet, highlightTerms, highlightEntryIds, highlightSaved, tokenMatchesOrContainsTerm, tokenHasTargetEntry, l2Code, text]);

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

  // ── Phonetics debug summary (Japanese/Korean) — why is ruby/romanization missing? ──
  // Logged through the GLOBAL logger (appLog), not the tokenized-text domain:
  // defaultOff('tokenized-text') silences that domain unless
  // EXPO_PUBLIC_LOG_LEVEL_TOKENIZED_TEXT=3 is set, which made this summary
  // invisible by default.
  useEffect(() => {
    logPhoneticsSummary({
      tokens,
      l2Code,
      showPhonetics,
      phoneticsShow: phonetics.show,
      phoneticsConditions,
      userLevel,
      shouldShowPhonetics,
    });
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
    // DEBUG (context segmentation): which path the popup context takes.
    const token = tokens[index];
    const context = token
      ? sentenceForToken(text, tokens, token, baseCode(l2Code))
      : text;
    log(
      `[TokenizedText] 📝 POPUP-OPEN word="${word}" index=${index} tokens=${tokens.length} textLen=${text.length} contextLen=${context.length} segmented=${context.length < text.length} context="${context.slice(0, 40)}"`,
    );
    setSelectedWord(word);
    setSelectedTokenIndex(index);
    setSelectedLemma(lemma);
    setSelectedTokenPron(pron);
    setSelectedLinkUrl(linkUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokens, text]);

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

  // Enqueue lookups for the highlight terms themselves, so their dictionary
  // entries (alternate / phonetic_detail.kana — e.g. しかるべき for 然るべき)
  // land in the cache and highlightKanaForms can bridge kanji-head ↔ kana-
  // surface matching in the context sentence.
  useEffect(() => {
    const terms = effectiveHighlightTerms ?? [];
    if (terms.length === 0 || isOfflineModeEnabled()) return;
    const base = baseCode(l2Code);
    enqueueLookupWords(
      terms.map((text) => ({ text, l2Code: base })),
      PYTHON_API_URL,
    ).then(() => setCacheVersion(v => v + 1));
  }, [effectiveHighlightTerms, l2Code]);

  // ── Pre-warm local tokenizer machinery ──
  // Start loading the kuromoji data pack / dictionary headword set as soon
  // as tokenized text becomes visible, so the first line doesn't pay the
  // full one-time initialization cost (singletons dedupe concurrent calls).
  useEffect(() => {
    void prewarmLocalLemmatizer(l2Code);
  }, [l2Code]);

  // ── Per-token data from dictionary cache (byeonggi, gloss, levels) ──
  // When the token is a saved word, the definition/byeonggi come from the
  // exact entry the user saved — multiple dictionary entries can match one
  // surface form, and the saved record pins the one the user chose. Falls
  // back to the first cached match for unsaved words (or when the saved
  // entry isn't resolvable yet).
  const getTokenEntryData = useCallback((token: LemmatizedToken) => {
    if (!token.lemmas.length) {
      return { byeonggiText: null as string | null, firstDef: null as string | null, savedWordId: undefined as string | undefined };
    }

    const savedRecord = savedRecordForToken(token);
    if (savedRecord) {
      const savedEntry = resolveSavedEntry(savedRecord);
      if (savedEntry?.definitions?.length) {
        return {
          byeonggiText: savedEntry.han_script?.hanja ?? savedEntry.han_script?.hantu ?? savedEntry.han_script?.han ?? null,
          firstDef: firstGloss(savedEntry.definitions),
          savedWordId: savedRecord.id,
        };
      }
    }

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
  }, [l2Code, cacheVersion, savedRecordForToken, resolveSavedEntry]);

  // ── L1-translated quick gloss (matches web token-span) ──
  useEffect(() => {
    if (l1Lang.code === 'en' || !quickGlossEnabled) return;
    let cancelled = false;

    const pending: Array<{ lookupText: string; l1Key: string; preferredId?: string }> = [];
    const seen = new Set<string>();
    for (const token of tokens) {
      const lower = token.text.toLowerCase();
      if (!savedFormSet.has(lower)) continue;
      const { firstDef, savedWordId } = getTokenEntryData(token);
      if (!firstDef) continue;
      const lookupText = token.lemmas[0]?.lemma || token.text;
      // Dedupe by (surface form, saved entry) — the same surface form can be
      // saved under two different entries, each needing its own L1 gloss.
      const dedupeKey = `${lower}:${savedWordId ?? ''}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      // Key the state by lookup text + saved entry so tokens of the same text
      // but different saved entries don't share a gloss.
      const l1Key = `${lookupText}:${savedWordId ?? ''}`;
      const cached = getL1Gloss(lookupText, l2Code, l1Lang.code, savedWordId);
      if (cached !== null) {
        setL1Glosses((prev) => (prev[l1Key] ? prev : { ...prev, [l1Key]: cached }));
      } else {
        pending.push({ lookupText, l1Key, preferredId: savedWordId });
      }
    }

    for (const { lookupText, l1Key, preferredId } of pending) {
      void fetchL1Gloss(lookupText, l2Code, l1Lang.code, preferredId).then((gloss) => {
        if (!cancelled && gloss) {
          setL1Glosses((prev) => (prev[l1Key] ? prev : { ...prev, [l1Key]: gloss }));
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
    const rubyLayout = computeRubyLayout(baseCode(l2Code), {
      fontSize: textStyle.fontSize ?? 16,
      lineHeight: leadingRatio ? Math.round((textStyle.fontSize ?? 16) * leadingRatio) : undefined,
      showPhonetics,
      phoneticsShow: phonetics.show,
    });
    const { isRtl, tokenFontSize, readingSize, baseLeading, halfLeading, rubyPull, isRubyMode } = rubyLayout;

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
              const useParagraph = NATIVE_PARAGRAPH_ACTIVE && !showDefinition;
              // Dev-only: log the ruby render path once per change, so the
              // Metro log shows which path this build actually takes (native
              // paragraph / native per-token / JS fallback).
              logRubyRenderPath(
                NATIVE_RUBY_ACTIVE,
                NATIVE_PARAGRAPH_ACTIVE,
                useParagraph,
                showDefinition,
                isRubyMode,
              );
              const runs: ParagraphRun[] = [];
              const taps: Array<ParagraphTapAction | null> = [];
              const treeLines: string[] = [
                'TokenizedText',
                useParagraph
                  ? '└─ RubyTextParagraph (single native attributed string)'
                  : '└─ View flex-row flex-wrap items-end (line container)',
              ];
              const rendered = displayTokens.map((token, i) => {
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
                treeLines.push(`├─ [${i}] plain-Text "${token.text}" (non-word, bypasses RubyText)`);
                if (useParagraph) {
                  treeLines[treeLines.length - 1] = `├─ [${i}] plain-Text "${token.text}" (non-word, paragraph run)`;
                  runs.push({
                    tokenId: i,
                    text: isTab ? '  ' : token.text,
                    tappable: false,
                    color: rubyColors.foreground,
                    readingColor: rubyColors.mutedForeground,
                    bold: false,
                    underline: false,
                    opacity: 1,
                  });
                  taps.push(null);
                  return null;
                }
                return (
                  <View key={i} className="items-center" style={whitespaceStyle}>
                    {isRubyMode && !isNewline && (
                      <View style={{ height: readingSize, marginBottom: -rubyPull }} />
                    )}
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
              const isHighlighted =
                tokenMatchesOrContainsTerm(token) || tokenHasTargetEntry(token);
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
              const { byeonggiText, firstDef, savedWordId } = getTokenEntryData(token);
              // L1 glosses are keyed by lookup text + saved entry id so two
              // tokens of the same text saved under different entries each get
              // their own gloss; the bare-text fallback covers older state.
              const l1GlossDef = l1Glosses[`${firstLemma ?? word}:${savedWordId ?? ''}`] ?? l1Glosses[firstLemma ?? word] ?? l1Glosses[word] ?? null;
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
              const hasRuby = !!(isRubyMode && showTokenPhonetics && token.pronunciation && token.pronunciation !== word
                && (!isHighlighted || phoneticsOnHighlight));

              const isSavedWord = isSaved && !isHighlighted && !isBlanked;
              const tokenFormat = tokenFormatMap[i] ?? null;
              const isLink = !!tokenFormat?.url;
              const isSearchHighlight = !!tokenFormat?.highlight;
              const isBoldFormat = !!tokenFormat?.bold;
              const isItalicFormat = !!tokenFormat?.italic;
              const isCodeFormat = !!tokenFormat?.code;
              const isTokenSelected = selectedTokenIndex === i;
              const rawUrl = tokenFormat?.url ?? null;
              const linkUrl = rawUrl && (onOpenLink || /^https?:\/\//i.test(rawUrl)) ? rawUrl : null;

                const debugSegs = isBlanked
                  ? [{ text: '▯' }]
                  : hasRuby && token.pronunciation
                    ? buildRuby(displayText, token.pronunciation, l2Code)
                    : [{ text: displayText }];

                // ── Dev tree logging ──
                {
                  const flatPath = NATIVE_RUBY_ACTIVE && !showDefinition;
                  if (useParagraph) {
                    const readingForLog = token.pronunciation ?? '';
                    const syllableCount = readingForLog.split(' ').filter(Boolean).length;
                    treeLines.push(
                      `├─ [${i}] word="${word}" display="${displayText}" hasRuby=${hasRuby} [paragraph runs ×${debugSegs.length}]${hasRuby ? ` readingLen=${readingForLog.length} syllables=${syllableCount}` : ''}${isBlanked ? ' blanked' : ''}${isKaraokeDimmed ? ' dimmed' : ''}`,
                    );
                  } else if (flatPath) {
                  const segLinesFlat = debugSegs.map((s, j) => {
                    const leaf = j === debugSegs.length - 1;
                    return `${leaf ? '└─' : '├─'} RubyText seg="${s.text}"${
                      s.reading ? ` reading="${s.reading}"` : ' (no reading)'
                    } [native]`;
                  });
                  treeLines.push(
                    `├─ [${i}] word="${word}" display="${displayText}" hasRuby=${hasRuby} [flat fragment]${isBlanked ? ' blanked' : ''}`,
                    ...segLinesFlat,
                    ...(showByeonggi ? [`└─ Text byeonggi="${byeonggiText}"`] : []),
                    ...(showQuickGloss ? [`└─ Text quickGloss="‘${quickGlossDef}’"`] : []),
                  );
                } else {
                  const segLines = debugSegs.map((s, j) => {
                    const leaf = j === debugSegs.length - 1;
                    return `│       ${leaf ? '└─' : '├─'} RubyText seg="${s.text}"${
                      s.reading ? ` reading="${s.reading}"` : ' (no reading)'
                    } [fallback]`;
                  });
                  treeLines.push(
                    `├─ [${i}] RubyTokenSpan word="${word}" display="${displayText}" hasRuby=${hasRuby}${isBlanked ? ' blanked' : ''}`,
                    '│   └─ Pressable → View flex-row items-end',
                    ...segLines,
                    ...(showByeonggi ? [`│       └─ Text byeonggi="${byeonggiText}"`] : []),
                    ...(showQuickGloss ? [`│       └─ Text quickGloss="‘${quickGlossDef}’"`] : []),
                    ...(showDefinition ? [`└─ View definitionSlot ${showInterlinear ? `"${trimmedDef}"` : '(empty spacer)'}`] : []),
                  );
                }
              }

              if (useParagraph) {
                for (const seg of debugSegs) {
                  runs.push({
                    tokenId: i,
                    text: seg.text,
                    ...(seg.reading ? { reading: seg.reading } : {}),
                    tappable: true,
                    color: isTokenSelected || isHighlighted
                      ? rubyColors.primary
                      : rubyColors.foreground,
                    readingColor: isTokenSelected
                      ? rubyColors.primary
                      : rubyColors.mutedForeground,
                    bold: (!isBlanked && (isHighlighted || isBoldFormat)) || textStyle.fontWeight === 'bold',
                    underline: !isBlanked && isLink,
                    italic: !isBlanked && isItalicFormat,
                    ...(isSearchHighlight
                      ? { background: rubyColors.primary, backgroundAlpha: 0.2 }
                      : isSavedWord
                        ? { background: MOBILE_RUBY_SAVED_BG, backgroundAlpha: 0.2 }
                        : {}),
                    opacity: isKaraokeDimmed ? 0.4 : 1,
                  });
                }
                if (showByeonggi) {
                  runs.push({
                    tokenId: i,
                    text: ` ${byeonggiText}`,
                    fontSize: readingSize,
                    tappable: false,
                    color: rubyColors.mutedForeground,
                    readingColor: rubyColors.mutedForeground,
                    bold: false,
                    underline: false,
                    opacity: (isKaraokeDimmed ? 0.4 : 1) * 0.7,
                  });
                }
                if (showQuickGloss) {
                  log(`[TokenizedText] 📎 quick gloss run token=${i} text="${quickGlossDef}"`);
                  runs.push({
                    tokenId: i,
                    text: ` (‘${quickGlossDef}’) `,
                    tappable: false,
                    color: rubyColors.mutedForeground,
                    readingColor: rubyColors.mutedForeground,
                    bold: false,
                    underline: false,
                    opacity: isKaraokeDimmed ? 0.4 : 1,
                  });
                }
                taps.push({
                  word,
                  lemma: firstLemma,
                  pronunciation: token.pronunciation ?? null,
                  linkUrl,
                });
                return null;
              }

              const tokenSpanProps = {
                index: i,
                word,
                displayText,
                pronunciation: token.pronunciation ?? null,
                hasRuby,
                reserveRubySlot: isRubyMode,
                isBlanked,
                isHighlighted,
                isBoldFormat,
                isItalicFormat,
                isCodeFormat,
                isLink,
                isSearchHighlight,
                isSavedWord,
                isTokenSelected,
                isKaraokeDimmed,
                showByeonggi,
                byeonggiText,
                showQuickGloss,
                quickGlossDef,
                showDefinition,
                showInterlinear,
                trimmedDef,
                firstLemma,
                linkUrl,
                l2Code,
                quizMode,
                popupEnabled,
                rubyPull,
                readingSize,
                baseLeading,
                textStyle,
                onOpenLink,
                onPressWord: handlePressWord,
                onReveal: handleReveal,
              };

              // Flat native path: fragment children, no wrapper View/Pressable.
              // Legacy path when the native module is missing (Expo Go) or
              // interlinear definition slots need a token column.
              if (NATIVE_RUBY_ACTIVE && !showDefinition) {
                return <RubyTokenFlat key={i} {...tokenSpanProps} />;
              }
              return (
                <RubyTokenSpan key={i} {...tokenSpanProps} />
              );
            });
              if (__DEV__) scheduleTreeLog(text, treeLines);
              if (useParagraph) {
                return (
                  <RubyTextParagraphBlock
                    testID={testID}
                    runs={runs}
                    taps={taps}
                    fontSize={tokenFontSize}
                    lineHeight={(baseLeading ?? tokenFontSize) + (readingSize - rubyPull)}
                    readingSize={readingSize}
                    fontFamily={textStyle.fontFamily ?? null}
                    isRtl={isRtl}
                    fontWeight={textStyle.fontWeight === 'bold' ? 'bold' : 'normal'}
                    quizMode={quizMode}
                    popupEnabled={popupEnabled}
                    onOpenLink={onOpenLink}
                    onPressWord={handlePressWord}
                    onReveal={handleReveal}
                  />
                );
              }
              return rendered;
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
              const isHighlighted =
                tokenMatchesOrContainsTerm(token) || tokenHasTargetEntry(token);
              // Highlighted (target) words keep their written form unless
              // phoneticsOnHighlight is set (review card flip, SPEC-049 §6.1).
              const displayText = replaceWithPhonetics && isWordToken && shouldShowPhonetics(token) && token.pronunciation
                && (!isHighlighted || phoneticsOnHighlight)
                ? token.pronunciation
                : tokenDisplayText;
              const isRevealed = revealedTokens.has(i);
              const isBlanked = quizMode && !isRevealed;
              const firstLemma = token.lemmas[0]?.lemma;
              const { byeonggiText, firstDef, savedWordId } = getTokenEntryData(token);
              // L1 glosses are keyed by lookup text + saved entry id so two
              // tokens of the same text saved under different entries each get
              // their own gloss; the bare-text fallback covers older state.
              const l1GlossDef = l1Glosses[`${firstLemma ?? word}:${savedWordId ?? ''}`] ?? l1Glosses[firstLemma ?? word] ?? l1Glosses[word] ?? null;
              const quickGlossDef = l1GlossDef ?? firstDef;
              const showByeonggi = byeonggiEnabled && !!byeonggiText;
              const isSaved = highlightSaved !== false && tokenMatchesAnyForm(token, savedFormSet);
              const showQuickGloss = isSaved && quickGlossEnabled && !!quickGlossDef && !isHighlighted;
              const isSavedWord = isSaved && !isHighlighted && !isBlanked;
              const tokenFormat = tokenFormatMap[i] ?? null;
              const isLink = !!tokenFormat?.url;
              const isSearchHighlight = !!tokenFormat?.highlight;
              const isBoldFormat = !!tokenFormat?.bold;
              const isItalicFormat = !!tokenFormat?.italic;
              const isCodeFormat = !!tokenFormat?.code;
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
                  isBoldFormat={isBoldFormat}
                  isItalicFormat={isItalicFormat}
                  isCodeFormat={isCodeFormat}
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
    prev.inlineFontSize === next.inlineFontSize &&
    prev.textColor === next.textColor &&
    prev.highlightTerms === next.highlightTerms &&
    prev.tokenCacheLoaded === next.tokenCacheLoaded
  );
}

export const TokenizedText = memo(TokenizedTextImpl, tokenizedTextPropsEqual);
