/**
 * TranscriptApp — React component that renders tokenized subtitle lines.
 *
 * Replaces the vanilla JS renderCues() in content-entry.js.
 * Each subtitle line is tokenized via the Python API and displayed with
 * clickable words, furigana/pinyin ruby text, and lemma tooltips.
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import type { LemmatizedToken, DictionaryEntry } from '@langplayer/shared';
import { buildRuby, baseCode, getCachedEntries, subscribeToCache, enqueueLookupWords, sentenceContaining } from '@langplayer/utils';
import type { RubySegment } from '@langplayer/utils';
import { Ellipsis } from './components/Icons';
import { SavedWordsProvider, useSavedWords } from './components/SavedWordsProvider';
import { API_BASE } from './api-config';
import { apiFetch } from './api-fetch';
import { useTranslateLines } from './use-translate-lines';
import { useBatchLemmatize } from './use-batch-lemmatize';
import { useSubscription } from './use-subscription';
import { useLazyCueWindow, computeCueWindow, WINDOW_LOOKAHEAD_LINES } from './lazy-window';
import { useSelectionPopup } from './use-selection-popup';
import type { SubCue } from './use-translate-lines';
import { t, getLocaleVersion, log, logwarn } from './i18n';
import { applySpeechToUtterance, loadSpeechSettings, DEFAULT_PLAYBACK } from './extension-settings';

/** ADR-0034: free users see the first 10 transcript lines. */
const FREE_TRANSCRIPT_LINES = 10;

const WEB_APP_URL = 'https://language-player.netlify.app';

/** Furigana debug — log each unique (word, reason) once so the console stays readable. */
const furiganaDebugLogged = new Set<string>();

function logFurigana(key: string, message: string): void {
  if (furiganaDebugLogged.has(key)) return;
  furiganaDebugLogged.add(key);
  log(`[FURIGANA] ${message}`);
}

/** Re-render the transcript when the shared dictionary cache is populated by
 *  the lazy batch lookup, so quick glosses appear without a manual refresh. */
function useDictionaryCacheVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => subscribeToCache(() => setVersion((v) => v + 1)), []);
  return version;
}

// ── Types ──────────────────────────────────────────────────────────────────

interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

interface TranscriptAppProps {
  cues: SubtitleCue[];
  activeCueIdx: number;
  l2Code: string;
  l1Code: string;
  onSeekTo: (timeSec: number) => void;
  loadingL2?: string;
  localeVersion?: number;
  /** Video/page title (document.title), used for word-saving context. */
  videoTitle?: string;
  /** Page URL, used to extract platform/video ID for word-saving context. */
  pageUrl?: string;
  onDictionaryOpen?: (request: DictionaryModalRequest | null) => void;
  onLineExplainOpen?: (request: LineExplanationRequest | null) => void;
}

export interface DictionaryModalRequest {
  token: LemmatizedToken;
  l1Code: string;
  l2Code: string;
  contextText?: string;
  cueStartTime?: number;
  videoTitle?: string;
  pageUrl?: string;
}

export interface LineExplanationRequest {
  cue: { text: string; start: number; end: number };
  l1Code: string;
  l2Code: string;
}

// Re-export SubCue type for content-entry.js
export type { SubCue };

// ── Note: token cache lives in use-batch-lemmatize.ts ──────────────────────

// ── Tokenized Line Component ───────────────────────────────────────────────

interface TokenizedLineProps {
  text: string;
  l2Code: string;
  isActive: boolean;
  /** True when this line is inside the active tokenization lookahead window. */
  tokenizeAhead: boolean;
  showPhonetics: boolean;
  onClickLine: () => void;
  onTokenClick: (token: LemmatizedToken) => void;
  /** Bumped when the shared dictionary cache is populated (batch lookup). */
  cacheVersion?: number;
  /** Enable drag-select → dictionary lookup (SPEC-033 web parity). */
  selectionDictionary?: boolean;
  /** Called with a text selection: the selected text, its offset within the
   *  line's source text, and the line's source text. */
  onSelectionLookup?: (text: string, startOffset: number | null, sourceText: string) => void;
}

const TokenizedLine: React.FC<TokenizedLineProps> = React.memo(
  ({ text, l2Code, isActive, tokenizeAhead, showPhonetics, onClickLine, onTokenClick, cacheVersion, selectionDictionary, onSelectionLookup }) => {
    const [visible, setVisible] = useState(false);
    const containerRef = useRef<HTMLSpanElement>(null);
    const { getTokens, isQueued, enqueue } = useBatchLemmatize();
    const { containerRef: selectionRef, selection, clear: clearSelection } = useSelectionPopup<HTMLSpanElement>(!!selectionDictionary);

    // ── Drag-select → dictionary popup (SPEC-033 parity) ──
    // A non-collapsed selection inside this line is looked up as a lemma-less
    // token. The selection is cleared immediately so a dismissed popup cannot
    // be re-triggered by a stray click on the old highlight.
    useEffect(() => {
      if (!selectionDictionary || !selection) return;
      onSelectionLookup?.(selection.text, selection.startOffset, text);
      clearSelection();
    }, [selectionDictionary, selection, onSelectionLookup, text, clearSelection]);

    const shouldTokenize = visible || tokenizeAhead;
    const tokens = shouldTokenize ? getTokens(text, l2Code) : null;
    const queued = shouldTokenize && !tokens && isQueued(text, l2Code);

    // Lines inside the lookahead window request tokenization even before they
    // scroll into view; the shared queue coalesces them into one batch.
    useEffect(() => {
      if (!shouldTokenize) return;
      if (getTokens(text, l2Code) || isQueued(text, l2Code)) return;
      enqueue(text, l2Code);
    }, [shouldTokenize, text, l2Code, getTokens, isQueued, enqueue]);

    // ── Lazy dictionary batch lookup ──
    // Once this line's tokens arrive (it is visible or inside the rolling
    // window), enqueue its unique lemmas for /dictionary/lookup-batch through
    // the shared @langplayer/utils cache — the same stage apps/web + apps/mobile
    // run. Identical words across lines are looked up once; off-window lines
    // never enqueue anything, so the lookup is lazy like tokenization.
    useEffect(() => {
      if (!tokens || tokens.length === 0) return;
      const base = baseCode(l2Code);
      const unique: string[] = [];
      const seen = new Set<string>();
      const add = (t: string) => {
        const trimmed = t.trim();
        if (!trimmed || /^[\s\p{P}]+$/u.test(trimmed) || seen.has(trimmed)) return;
        seen.add(trimmed);
        unique.push(trimmed);
      };
      for (const token of tokens) {
        for (const lemma of token.lemmas) add(lemma.lemma);
        add(token.text);
      }
      if (unique.length === 0) return;
      enqueueLookupWords(
        unique.map((word) => ({ text: word, l2Code: base })),
        API_BASE,
      )
        .then((queuedBatch) => {
          if (queuedBatch) log(`[DICT] batch lookup queued ${unique.length} words for "${text.slice(0, 20)}"`);
        })
        .catch(() => {});
    }, [tokens, l2Code, text]);

    // ── Lazy visibility: show raw text until scrolled near viewport ──
    useEffect(() => {
      if (visible) return;
      const el = containerRef.current;
      if (!el) return;

      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry?.isIntersecting) {
            setVisible(true);
            observer.disconnect();
          }
        },
        { rootMargin: '200px' },
      );

      observer.observe(el);
      return () => observer.disconnect();
    }, [visible, text]);

    // ── Render: TOKENS → raw (not queued) → pulsating (queued) → hidden
    return (
      <span
        ref={(el) => { containerRef.current = el; selectionRef.current = el; }}
        className={`lpv-cue-text ${isActive ? 'lpv-active-text' : ''}`}
        onClick={(e) => { e.stopPropagation(); onClickLine(); }}
      >
        {tokens ? (
          tokens.map((token, i) => (
            <TokenSpan
              key={i}
              token={token}
              l2Code={l2Code}
              isActive={isActive}
              showPhonetics={showPhonetics}
              onClickLine={onClickLine}
              onTokenClick={onTokenClick}
              cacheVersion={cacheVersion}
            />
          ))
        ) : queued ? (
          <span className="lpv-cue-loading">{text}</span>
        ) : (
          <span>{text}</span>
        )}
      </span>
    );
  },
);
TokenizedLine.displayName = 'TokenizedLine';

// ── Token Span Component ───────────────────────────────────────────────────

interface TokenSpanProps {
  token: LemmatizedToken;
  l2Code: string;
  isActive: boolean;
  showPhonetics: boolean;
  onClickLine: () => void;
  onTokenClick: (token: LemmatizedToken) => void;
  /** Bumped when the shared dictionary cache is populated (batch lookup). */
  cacheVersion?: number;
}

const TokenSpan: React.FC<TokenSpanProps> = React.memo(
  ({ token, l2Code, isActive, showPhonetics, onClickLine, onTokenClick, cacheVersion }) => {
    const { savedFormSet } = useSavedWords();

    // Structural tokens
    if (token.text === '\n' || token.text === '\r') {
      return <br />;
    }

    const isWord = token.lemmas.length > 0;

    // Punctuation, spaces — raw text
    if (!isWord) {
      return <>{token.text}</>;
    }

    const isSaved = savedFormSet.has(token.text.toLowerCase());

    // Build ruby segments — gated by showPhonetics
    const hasPhonetics = showPhonetics && token.pronunciation && token.pronunciation !== token.text;
    const rubySegments: RubySegment[] | null = hasPhonetics
      ? buildRuby(token.text, token.pronunciation!, l2Code)
      : null;

    // ── Furigana debug: why is ruby (not) rendering for Japanese kanji words? ──
    const l2Base = l2Code.split('-')[0]!;
    if (isWord && l2Base === 'ja' && /[一-龯]/.test(token.text)) {
      const readings = rubySegments?.filter((seg) => seg.reading) ?? [];
      if (!showPhonetics) {
        logFurigana(`ja:${token.text}:toggle`, `"${token.text}" ruby skipped: phonetics toggle is OFF`);
      } else if (!token.pronunciation) {
        logFurigana(`ja:${token.text}:nopron`, `"${token.text}" ruby skipped: API returned no pronunciation`);
      } else if (token.pronunciation === token.text) {
        logFurigana(`ja:${token.text}:same`, `"${token.text}" ruby skipped: pronunciation equals surface text`);
      } else if (readings.length === 0) {
        logFurigana(`ja:${token.text}:nosegs`, `"${token.text}" ruby skipped: buildRuby returned no readings (segments=${JSON.stringify(rubySegments)})`);
      } else {
        logFurigana(`ja:success`, `ruby rendered for "${token.text}" (pron=${token.pronunciation}, readings=${readings.length}/${rubySegments!.length}) — first ja success`);
      }
    }

    const lemmaTitle = token.lemmas.map((l) => l.lemma).join(', ');

    // Quick gloss from the shared dictionary cache (populated lazily by the
    // batch lookup for window/visible lines). cacheVersion triggers a recompute
    // when the async batch lookup resolves. Falls back to the lemma list.
    let quickGloss = '';
    if (cacheVersion !== undefined) {
      const base = baseCode(l2Code);
      const entries: DictionaryEntry[] | undefined =
        token.lemmas.length > 0
          ? getCachedEntries(base, token.lemmas[0]!.lemma)
          : getCachedEntries(base, token.text);
      quickGloss = entries?.[0]?.definitions?.[0] ?? '';
    }
    const title = quickGloss ? `${lemmaTitle} — ${quickGloss}` : lemmaTitle;

    return (
      <span
        className={`lpv-token ${isActive ? 'lpv-token-active' : ''} ${isSaved ? 'lpv-token-saved' : ''}`}
        title={title}
        onClick={(e) => {
          e.stopPropagation();
          onTokenClick(token);
        }}
      >
        {rubySegments
          ? rubySegments.map((seg, j) =>
              seg.reading ? (
                <ruby key={j}>
                  {seg.text}
                  <rt className="select-none">{seg.reading}</rt>
                </ruby>
              ) : (
                <React.Fragment key={j}>{seg.text}</React.Fragment>
              ),
            )
          : token.text}
      </span>
    );
  },
);
TokenSpan.displayName = 'TokenSpan';

// ── Cue Line Component ─────────────────────────────────────────────────────

interface CueLineProps {
  cue: SubtitleCue;
  index: number;
  isActive: boolean;
  tokenizeAhead: boolean;
  isPro: boolean;
  l2Code: string;
  showPhonetics: boolean;
  onSeekTo: (timeSec: number) => void;
  onTokenClick: (token: LemmatizedToken, cue: SubtitleCue) => void;
  /** L1 translation text (empty string if not available/disabled) */
  translation: string;
  /** Whether translation is enabled (shows toggle state) */
  showTranslation: boolean;
  onExplainLine: (cue: SubtitleCue) => void;
  explainLoading: boolean;
  /** Changes on locale switch to force React.memo re-render */
  localeVersion?: number;
  /** Bumped when the shared dictionary cache is populated (batch lookup). */
  cacheVersion?: number;
  /** Enable drag-select → dictionary lookup (SPEC-033 web parity). */
  selectionDictionary?: boolean;
  /** Called with a text selection (selected text, source offset, source line). */
  onSelectionLookup?: (text: string, startOffset: number | null, sourceText: string) => void;
}

const CueLine: React.FC<CueLineProps> = React.memo(
  ({ cue, index, isActive, tokenizeAhead, isPro, l2Code, showPhonetics, onSeekTo, onTokenClick, translation, showTranslation, onExplainLine, explainLoading, localeVersion, cacheVersion, selectionDictionary, onSelectionLookup }) => {
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    // Close menu on click outside
    useEffect(() => {
      if (!menuOpen) return;
      const handler = (e: MouseEvent) => {
        if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
          setMenuOpen(false);
        }
      };
      document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }, [menuOpen]);

    const handleClick = useCallback(() => {
      onSeekTo(cue.start);
    }, [cue.start, onSeekTo]);

    const handleCopy = useCallback((e: React.MouseEvent) => {
      e.stopPropagation();
      navigator.clipboard.writeText(cue.text).catch(() => {});
      setMenuOpen(false);
    }, [cue.text]);

    const handleSpeak = useCallback((e: React.MouseEvent) => {
      e.stopPropagation();
      const utterance = new SpeechSynthesisUtterance(cue.text);
      speechSynthesis.cancel();
      loadSpeechSettings().then((speech) => {
        applySpeechToUtterance(utterance, l2Code, speech);
        speechSynthesis.speak(utterance);
      });
      setMenuOpen(false);
    }, [cue.text, l2Code]);

    const minutes = Math.floor(cue.start / 60);
    const seconds = Math.floor(cue.start % 60);

    const handleTokenClickWithCue = useCallback((token: LemmatizedToken) => {
      onTokenClick(token, cue);
    }, [cue, onTokenClick]);

    return (
      <div
        className={`lpv-cue ${isActive ? 'lpv-active' : ''}`}
        data-index={index}
        onClick={handleClick}
      >
        <div className="lpv-cue-body">
          <TokenizedLine
            text={cue.text}
            l2Code={l2Code}
            isActive={isActive}
            tokenizeAhead={tokenizeAhead}
            showPhonetics={showPhonetics}
            onClickLine={handleClick}
            onTokenClick={handleTokenClickWithCue}
            cacheVersion={cacheVersion}
            selectionDictionary={selectionDictionary}
            onSelectionLookup={onSelectionLookup}
          />
          {showTranslation && translation && (
            <div className="lpv-cue-translation">{translation}</div>
          )}
        </div>
        <div className="lpv-cue-menu" ref={menuRef}>
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
            className={`lpv-cue-menu-btn ${menuOpen ? 'lpv-cue-menu-btn-open' : ''}`}
            title={t('actions')}
          >
            <Ellipsis size={14} />
          </button>
          {menuOpen && (
            <div className="lpv-cue-menu-dropdown">
              <button onClick={handleCopy} className="lpv-cue-menu-item">{t('copy')}</button>
              <button onClick={handleSpeak} className="lpv-cue-menu-item">{t('speak')}</button>
              {/* Let DeepSeek Explain — ALWAYS shown. Non-Pro users get the
                  upgrade prompt from the line-explanation surface instead of a
                  hidden item (web parity, ADR-0034). */}
              {!explainLoading && (
                <button
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onExplainLine(cue); }}
                  className="lpv-cue-menu-item"
                >
                  {t('explain')}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  },
);
CueLine.displayName = 'CueLine';

// ── Empty State ────────────────────────────────────────────────────────────

const EmptyState: React.FC<{ loadingL2?: string }> = ({ loadingL2 }) => (
  <div className="lpv-empty">
    {loadingL2 ? (
      <span className="lpv-spinner" />
    ) : (
      t('startPlaying')
    )}
  </div>
);

// ── Transcript App ────────────────────────────────────────────────────────

/** Font size percentages for text scale levels 0–4. */
const TEXT_SCALE_SIZES = [87, 100, 112, 125, 150] as const;

export const TranscriptAppInner: React.FC<TranscriptAppProps> = ({
  cues,
  activeCueIdx,
  l2Code,
  l1Code,
  onSeekTo,
  loadingL2,
  localeVersion,
  videoTitle,
  pageUrl,
  onDictionaryOpen,
  onLineExplainOpen,
}) => {
  const listRef = useRef<HTMLDivElement>(null);
  const prevActiveRef = useRef(activeCueIdx);
  const [showTranslation, setShowTranslation] = useState(false);
  const [showPhonetics, setShowPhonetics] = useState(true);
  /** Text scale index: 0 (smallest) to 4 (largest). Maps to 87%–150%. */
  const [textScale, setTextScale] = useState(2);
  const [smoothScroll, setSmoothScroll] = useState(DEFAULT_PLAYBACK.smoothScroll);

  const { isPro } = useSubscription();
  const { preFetch } = useBatchLemmatize();

  // Shared lazy window: tokenization, batch lookup, and translation all work
  // on the rolling window around the active cue (lazy-window.ts).
  const cacheVersion = useDictionaryCacheVersion();
  const { isInWindow } = useLazyCueWindow(activeCueIdx, cues.length);

  // Translation between a language and itself is meaningless (l1 === l2),
  // so it is disabled entirely and the toggle is hidden in that case.
  const canTranslate = baseCode(l1Code) !== baseCode(l2Code);
  const effectiveShowTranslation = showTranslation && canTranslate;

  // Load saved preferences
  useEffect(() => {
    try {
      chrome.storage.local.get(['showPhonetics', 'showTranslation', 'textScale', 'extensionPlaybackSettings'], (result) => {
        log('[PAGE] loaded prefs:', JSON.stringify(result));
        log(`[FURIGANA] video mode prefs: showPhonetics=${result.showPhonetics === undefined ? 'default(true)' : result.showPhonetics}`);
        if (result.showPhonetics !== undefined) setShowPhonetics(result.showPhonetics);
        if (result.showTranslation !== undefined) setShowTranslation(result.showTranslation);
        if (result.textScale !== undefined) setTextScale(result.textScale);
        if (result.extensionPlaybackSettings?.smoothScroll !== undefined) setSmoothScroll(result.extensionPlaybackSettings.smoothScroll);
      });
    } catch {}
    const onChange = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
      if (area !== 'local') return;
      if (changes.showPhonetics) setShowPhonetics(changes.showPhonetics.newValue !== false);
      if (changes.showTranslation) setShowTranslation(changes.showTranslation.newValue === true);
      if (changes.textScale) setTextScale(Math.max(0, Math.min(4, Number(changes.textScale.newValue) || 0)));
      if (changes.extensionPlaybackSettings?.newValue?.smoothScroll !== undefined) setSmoothScroll(changes.extensionPlaybackSettings.newValue.smoothScroll);
    };
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, []);

  // Persist phonetics preference on change
  const handlePhoneticsToggle = useCallback((checked: boolean) => {
    setShowPhonetics(checked);
    try { chrome.storage.local.set({ showPhonetics: checked }); } catch {}
  }, []);

  // Persist translation preference on change
  const handleTranslationToggle = useCallback((checked: boolean) => {
    setShowTranslation(checked);
    try { chrome.storage.local.set({ showTranslation: checked }); } catch {}
  }, []);

  // Persist text scale
  const adjustTextScale = useCallback((delta: number) => {
    setTextScale(prev => {
      const next = Math.max(0, Math.min(4, prev + delta));
      try { chrome.storage.local.set({ textScale: next }); } catch {}
      return next;
    });
  }, []);

  const { translated, loading: translating, progress } = useTranslateLines(
    cues,
    l1Code,
    l2Code,
    activeCueIdx,
    effectiveShowTranslation,
  );

  const handleSeekTo = useCallback((timeSec: number) => {
    onDictionaryOpen?.(null);
    onLineExplainOpen?.(null);
    onSeekTo(timeSec);
  }, [onDictionaryOpen, onLineExplainOpen, onSeekTo]);

  const handleTokenClick = useCallback((token: LemmatizedToken, cue: SubtitleCue) => {
    log('Token clicked:', token.text, token.lemmas.map(l => l.lemma));
    onDictionaryOpen?.({
      token,
      l1Code,
      l2Code,
      contextText: cue.text,
      cueStartTime: cue.start,
      videoTitle,
      pageUrl,
    });
    onLineExplainOpen?.(null);
  }, [l1Code, l2Code, onDictionaryOpen, pageUrl, videoTitle]);

  const handleExplainLine = useCallback((cue: SubtitleCue) => {
    // Always open the explain surface. For non-Pro users the line-explanation
    // dialog shows the upgrade prompt (web parity, ADR-0034) rather than
    // silently ignoring the tap.
    onDictionaryOpen?.(null);
    onLineExplainOpen?.({ cue, l1Code, l2Code });
  }, [l1Code, l2Code, onDictionaryOpen, onLineExplainOpen]);

  // Drag-select → dictionary lookup (SPEC-033). The selected text is the
  // lookup term (no lemma); the context is the sentence containing the
  // selection within the line, matching the token-click path.
  const handleSelectionLookup = useCallback((selectedText: string, startOffset: number | null, sourceText: string) => {
    if (!selectedText.trim()) return;
    const contextText = startOffset !== null
      ? sentenceContaining(sourceText, startOffset, baseCode(l2Code))
      : sourceText;
    log('Selection lookup:', selectedText, '| context:', contextText.slice(0, 60));
    onDictionaryOpen?.({
      token: { text: selectedText, lemmas: [] },
      l1Code,
      l2Code,
      contextText,
      videoTitle,
      pageUrl,
    });
    onLineExplainOpen?.(null);
  }, [l1Code, l2Code, onDictionaryOpen, pageUrl, videoTitle, onLineExplainOpen]);

  // ── Pre-fetch window: only fire when activeCueIdx enters a new "page" ──
  // Throttles pre-fetch to avoid a batch call on every timeupdate (~250ms).
  const prefetchWindowRef = useRef(-1);

  // Reset the pre-fetch window when cues change (e.g., video navigation)
  // so the first visible cue of the new video triggers a fresh batch.
  useEffect(() => {
    prefetchWindowRef.current = -1;
  }, [cues]);

  useEffect(() => {
    const activeChanged = activeCueIdx !== prevActiveRef.current;
    prevActiveRef.current = activeCueIdx;

    const win = computeCueWindow(activeCueIdx, cues.length);

    // Before playback starts, tokenize the window so the panel isn't showing
    // raw text when the video begins.
    if (activeCueIdx < 0) {
      const texts = cues.slice(win.start, win.end + 1).map(c => c.text);
      if (texts.length > 0) preFetch(texts, l2Code);
      return;
    }

    if (!activeChanged) return;
    const el = listRef.current?.querySelector(
      `[data-index="${activeCueIdx}"]`,
    ) as HTMLElement | null;
    if (el) {
      el.scrollIntoView({ behavior: smoothScroll ? 'smooth' : 'auto', block: 'center' });
    }

    // Only pre-fetch when the active cue crosses into a new window boundary.
    // Window size = WINDOW_LOOKAHEAD_LINES / 2 so we re-fetch roughly when the
    // window has advanced by ~half its size (avoids a call every timeupdate).
    const windowSize = Math.max(1, Math.floor(WINDOW_LOOKAHEAD_LINES / 2));
    const windowIdx = Math.floor(activeCueIdx / windowSize);
    if (windowIdx === prefetchWindowRef.current) return;
    prefetchWindowRef.current = windowIdx;

    const texts: string[] = [];
    for (let i = win.start; i <= win.end; i++) {
      texts.push(cues[i].text);
    }
    if (texts.length > 0) {
      preFetch(texts, l2Code);
    }
  }, [activeCueIdx, cues, l2Code, preFetch]);

  if (cues.length === 0) {
    return <EmptyState loadingL2={loadingL2} />;
  }

  const visibleCues = isPro ? cues : cues.slice(0, FREE_TRANSCRIPT_LINES);

  return (
    <>
      {/* Scrollable cue list */}
      <div ref={listRef} className="lpv-cue-list" style={{ '--lpv-font-scale': TEXT_SCALE_SIZES[textScale] / 100 } as React.CSSProperties}>
        {visibleCues.map((cue, i) => (
          <CueLine
            key={i}
            cue={cue}
            index={i}
            isActive={i === activeCueIdx}
            tokenizeAhead={isInWindow(i)}
            isPro={isPro}
            l2Code={l2Code}
            showPhonetics={showPhonetics}
            onSeekTo={handleSeekTo}
            onTokenClick={handleTokenClick}
            translation={translated.get(i) || ''}
            showTranslation={effectiveShowTranslation}
            onExplainLine={handleExplainLine}
            explainLoading={false}
            localeVersion={localeVersion}
            cacheVersion={cacheVersion}
            selectionDictionary
            onSelectionLookup={handleSelectionLookup}
          />
        ))}

        {/* ADR-0034: free users get 10 lines, then an upgrade prompt. Rendered
            INSIDE the scrollable cue list so it sits immediately below the last
            line (and scrolls with it) rather than being pinned to the bottom of
            the side panel above the control bar. When playback reaches the last
            free line, the upgrade CTA pulses to draw the learner's eye. */}
        {!isPro && cues.length > FREE_TRANSCRIPT_LINES && (
          <div className="lpv-pro-banner">
            <span>{t('freeSubtitleLimitReached')} {t('upgradeToProBanner')}</span>
            <a
              href={`${WEB_APP_URL}/${encodeURIComponent(l1Code)}/${encodeURIComponent(l2Code)}/go-pro`}
              target="_blank"
              rel="noopener noreferrer"
              className={`lpv-pro-banner-link${activeCueIdx >= FREE_TRANSCRIPT_LINES - 1 ? ' lpv-cta-pulse' : ''}`}
            >
              {t('upgradeToPro')}
            </a>
          </div>
        )}
      </div>

      {/* Bottom bar — phonetics | translation | text size | progress */}
      <div className="lpv-bottom-bar">
        <label className="lpv-translate-switch" title={t('showPhonetics') || 'Show Phonetics'}>
          <input
            type="checkbox"
            checked={showPhonetics}
            onChange={(e) => handlePhoneticsToggle(e.target.checked)}
          />
          <span className="lpv-switch-slider" />
          <span className="lpv-switch-label">あ</span>
        </label>
        {canTranslate && (
          <label className="lpv-translate-switch" title={t('showTranslation')}>
            <input
              type="checkbox"
              checked={showTranslation}
              onChange={(e) => handleTranslationToggle(e.target.checked)}
            />
            <span className="lpv-switch-slider" />
            <span className="lpv-switch-label">{t('translate')}</span>
          </label>
        )}
        <div className="lpv-stepper">
          <button
            className="lpv-stepper-btn"
            onClick={() => adjustTextScale(-1)}
            disabled={textScale <= 0}
            title={t('zoomOut')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14"/></svg>
          </button>
          <span className="lpv-stepper-value">A</span>
          <button
            className="lpv-stepper-btn"
            onClick={() => adjustTextScale(1)}
            disabled={textScale >= 4}
            title={t('zoomIn')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
          </button>
        </div>
        {translating && (
          <span className="lpv-control-status">
            {t('translating')}{' '}
            <span className="lpv-progress-badge">{progress}/{cues.length}</span>
          </span>
        )}
      </div>
    </>
  );
};

// ── Page Panel (text mode) ────────────────────────────────────────────────

interface PagePanelProps {
  l1Code: string;
  l2Code: string;
  pageUrl: string;
  onFollowLink?: (href: string) => void;
  /** Latest token lookup pushed from the page content script. */
  lookup?: PageLookupDetail | null;
}

interface PageLookupDetail {
  token: LemmatizedToken;
  blockText: string;
  blockId?: string | null;
  href?: string | null;
}

export type { PageLookupDetail };

/** Side panel content for page mode: translated block + dictionary card.
 *  Shares the video mode's bottom bar, SavedWordsProvider, and DictionaryCard. */
export const PagePanel: React.FC<PagePanelProps> = ({ l1Code, l2Code, pageUrl, onFollowLink, lookup }) => {
  const [selectedToken, setSelectedToken] = useState<LemmatizedToken | null>(null);
  const [blockText, setBlockText] = useState('');
  const [blockId, setBlockId] = useState<string | null>(null);
  const [href, setHref] = useState<string | null>(null);
  const [translation, setTranslation] = useState('');
  const [translationLoading, setTranslationLoading] = useState(false);
  const translatedBlockIdRef = useRef<string | null>(null);
  const [showTranslation, setShowTranslation] = useState(false);
  const [showPhonetics, setShowPhonetics] = useState(true);
  const [textScale, setTextScale] = useState(2);
  const { isPro } = useSubscription();

  // Translation between a language and itself (l1 === l2) is disabled.
  const canTranslate = baseCode(l1Code) !== baseCode(l2Code);
  const effectiveShowTranslation = showTranslation && canTranslate;

  useEffect(() => {
    try {
      chrome.storage.local.get(['showPhonetics', 'showTranslation', 'textScale'], (result) => {
        log(`[FURIGANA] page mode prefs: showPhonetics=${result.showPhonetics === undefined ? 'default(true)' : result.showPhonetics} — page panel has no inline ruby surface; dictionary card shows pronunciation as text`);
        if (result.showPhonetics !== undefined) setShowPhonetics(result.showPhonetics);
        if (result.showTranslation !== undefined) setShowTranslation(result.showTranslation);
        if (result.textScale !== undefined) setTextScale(result.textScale);
      });
    } catch {}
  }, []);

  useEffect(() => {
    if (!lookup?.token) return;
    log(`[PAGE] lookup: "${lookup.token.text}", blockText chars=${(lookup.blockText || '').length}, href=${lookup.href || 'none'}`);
    log(`[FURIGANA] page mode lookup: token="${lookup.token.text}" pron="${lookup.token.pronunciation || 'none'}" — rendered as dictionary header text, not ruby`);
    const newBlockId = lookup.blockId || null;
    setSelectedToken(lookup.token);
    setBlockText(lookup.blockText || '');
    setBlockId(newBlockId);
    setHref(lookup.href || null);
    if (translatedBlockIdRef.current !== newBlockId) {
      setTranslation('');
    }
  }, [lookup]);

  useEffect(() => {
    if (!selectedToken || !effectiveShowTranslation || !blockText) {
      log(`[PAGE] translate skipped: token=${!!selectedToken}, showTranslation=${showTranslation}, canTranslate=${canTranslate}, blockText=${blockText.length} chars`);
      translatedBlockIdRef.current = null;
      setTranslation('');
      return;
    }
    const blockKey = blockId || blockText;
    if (blockKey === translatedBlockIdRef.current) {
      log('[PAGE] translate skipped: same paragraph already translated');
      return;
    }
    log(`[PAGE] translate block: ${blockText.length} chars, l1=${l1Code}, l2=${l2Code}`);
    translatedBlockIdRef.current = blockKey;
    const controller = new AbortController();
    setTranslationLoading(true);
    apiFetch(`${API_BASE}/translate_array`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts: [blockText], l1: l1Code, l2: l2Code }),
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const translated = data.translated_texts?.[0] || '';
        log(`[PAGE] translate response: status=${res.status}, translated chars=${translated.length}`);
        setTranslation(translated);
      })
      .catch((err: Error) => {
        if (err.name !== 'AbortError') {
          logwarn('[PAGE] translate failed:', err);
          translatedBlockIdRef.current = null;
          setTranslation('');
        }
      })
      .finally(() => setTranslationLoading(false));
    return () => controller.abort();
  }, [selectedToken, effectiveShowTranslation, blockText, blockId, l1Code, l2Code, canTranslate]);

  const handlePhoneticsToggle = (checked: boolean) => {
    log(`[FURIGANA] page mode phonetics toggle → ${checked}`);
    setShowPhonetics(checked);
    try { chrome.storage.local.set({ showPhonetics: checked }); } catch {}
  };

  const handleTranslationToggle = (checked: boolean) => {
    log('[PAGE] translation toggle:', checked);
    setShowTranslation(checked);
    try { chrome.storage.local.set({ showTranslation: checked }); } catch {}
  };

  const adjustTextScale = (delta: number) => {
    setTextScale(prev => {
      const next = Math.max(0, Math.min(4, prev + delta));
      try { chrome.storage.local.set({ textScale: next }); } catch {}
      return next;
    });
  };

  return (
    <>
      <div className="lpv-page-panel-scroll" style={{ '--lpv-font-scale': TEXT_SCALE_SIZES[textScale] / 100 } as React.CSSProperties}>
        {!selectedToken && (
          <div className="lpv-page-empty">{t('clickPageWord')}</div>
        )}
        {translationLoading && (
          <div className="lpv-page-translation lpv-page-translation-loading">
            <span className="lpv-spinner" /> {t('translating')}
          </div>
        )}
        {translation && !translationLoading && (
          <div className="lpv-page-translation">{translation}</div>
        )}
        {href && selectedToken && (
          <button
            className="lpv-page-follow-link"
            onClick={() => onFollowLink?.(href)}
          >
            {t('followLink')} →
          </button>
        )}
      </div>

      {/* Bottom bar — same controls as video mode */}
      <div className="lpv-bottom-bar">
        <label className="lpv-translate-switch" title={t('showPhonetics') || 'Show Phonetics'}>
          <input
            type="checkbox"
            checked={showPhonetics}
            onChange={(e) => handlePhoneticsToggle(e.target.checked)}
          />
          <span className="lpv-switch-slider" />
          <span className="lpv-switch-label">あ</span>
        </label>
        {canTranslate && (
          <label className="lpv-translate-switch" title={t('showTranslation')}>
            <input
              type="checkbox"
              checked={showTranslation}
              onChange={(e) => handleTranslationToggle(e.target.checked)}
            />
            <span className="lpv-switch-slider" />
            <span className="lpv-switch-label">{t('translate')}</span>
          </label>
        )}
        <div className="lpv-stepper">
          <button
            className="lpv-stepper-btn"
            onClick={() => adjustTextScale(-1)}
            disabled={textScale <= 0}
            title={t('zoomOut')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14"/></svg>
          </button>
          <span className="lpv-stepper-value">A</span>
          <button
            className="lpv-stepper-btn"
            onClick={() => adjustTextScale(1)}
            disabled={textScale >= 4}
            title={t('zoomIn')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
          </button>
        </div>
      </div>
    </>
  );
};

// ── Mounting ──────────────────────────────────────────────────────────────
// The transcript and page panels now render inside the extension's native
// side panel (src/sidepanel.jsx, chrome.sidePanel API). Content scripts no
// longer mount React into the page — they push state to the side panel via
// chrome.runtime messages. TranscriptAppInner and PagePanel are exported
// here for the side panel host to render.
