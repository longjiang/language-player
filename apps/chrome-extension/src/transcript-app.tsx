/**
 * TranscriptApp — React component that renders tokenized subtitle lines.
 *
 * Replaces the vanilla JS renderCues() in content-entry.js.
 * Each subtitle line is tokenized via the Python API and displayed with
 * clickable words, furigana/pinyin ruby text, and lemma tooltips.
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import type { LemmatizedToken } from '@langplayer/shared';
import { buildRuby } from '@langplayer/utils';
import type { RubySegment } from '@langplayer/utils';
import { DictionaryCard } from './components/DictionaryCard';
import { Markdown } from './components/Markdown';
import { X, Ellipsis } from './components/Icons';
import { SavedWordsProvider, useSavedWords } from './components/SavedWordsProvider';
import { API_BASE } from './api-config';
import { apiFetch } from './api-fetch';
import { useTranslateLines } from './use-translate-lines';
import { useBatchLemmatize } from './use-batch-lemmatize';
import { useSubscription } from './use-subscription';
import type { SubCue } from './use-translate-lines';
import { t, getLocaleVersion, log, logwarn } from './i18n';

/** ADR-0034: free users see the first 10 transcript lines. */
const FREE_TRANSCRIPT_LINES = 10;

const WEB_APP_URL = 'https://language-player.netlify.app';

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
}

const TokenizedLine: React.FC<TokenizedLineProps> = React.memo(
  ({ text, l2Code, isActive, tokenizeAhead, showPhonetics, onClickLine, onTokenClick }) => {
    const [visible, setVisible] = useState(false);
    const containerRef = useRef<HTMLSpanElement>(null);
    const { getTokens, isQueued, enqueue } = useBatchLemmatize();

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
        ref={containerRef}
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
}

const TokenSpan: React.FC<TokenSpanProps> = React.memo(
  ({ token, l2Code, isActive, showPhonetics, onClickLine, onTokenClick }) => {
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

    const lemmaTitle = token.lemmas.map((l) => l.lemma).join(', ');

    return (
      <span
        className={`lpv-token ${isActive ? 'lpv-token-active' : ''} ${isSaved ? 'lpv-token-saved' : ''}`}
        title={lemmaTitle}
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
                  <rt>{seg.reading}</rt>
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
}

const CueLine: React.FC<CueLineProps> = React.memo(
  ({ cue, index, isActive, tokenizeAhead, isPro, l2Code, showPhonetics, onSeekTo, onTokenClick, translation, showTranslation, onExplainLine, explainLoading, localeVersion }) => {
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
      utterance.lang = l2Code;
      speechSynthesis.cancel();
      speechSynthesis.speak(utterance);
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
              {isPro && !explainLoading && (
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

/** Number of cues ahead of the active cue to tokenize/render proactively. */
const TOKENIZE_LOOKAHEAD = 5;

/** Font size percentages for text scale levels 0–4. */
const TEXT_SCALE_SIZES = [87, 100, 112, 125, 150] as const;

const TranscriptAppInner: React.FC<TranscriptAppProps> = ({
  cues,
  activeCueIdx,
  l2Code,
  l1Code,
  onSeekTo,
  loadingL2,
  localeVersion,
  videoTitle,
  pageUrl,
}) => {
  const listRef = useRef<HTMLDivElement>(null);
  const prevActiveRef = useRef(activeCueIdx);
  const [selectedToken, setSelectedToken] = useState<LemmatizedToken | null>(null);
  /** The cue from which the selectedToken was clicked — used for save context. */
  const [selectedCue, setSelectedCue] = useState<SubtitleCue | null>(null);
  const [showTranslation, setShowTranslation] = useState(false);
  const [showPhonetics, setShowPhonetics] = useState(true);
  /** Text scale index: 0 (smallest) to 4 (largest). Maps to 87%–150%. */
  const [textScale, setTextScale] = useState(2);
  const [explainLoading, setExplainLoading] = useState(false);
  const [explainText, setExplainText] = useState<string | null>(null);
  const [explainError, setExplainError] = useState<string | null>(null);
  const [explainCue, setExplainCue] = useState<SubtitleCue | null>(null);

  const { isPro, loading: subLoading } = useSubscription();
  const { preFetch } = useBatchLemmatize();

  // Load saved preferences
  useEffect(() => {
    try {
      chrome.storage.local.get(['showPhonetics', 'showTranslation', 'textScale'], (result) => {
        log('[PAGE] loaded prefs:', JSON.stringify(result));
        if (result.showPhonetics !== undefined) setShowPhonetics(result.showPhonetics);
        if (result.showTranslation !== undefined) setShowTranslation(result.showTranslation);
        if (result.textScale !== undefined) setTextScale(result.textScale);
      });
    } catch {}
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
    showTranslation,
  );

  const handleSeekTo = useCallback((timeSec: number) => {
    setSelectedToken(null);
    setSelectedCue(null);
    onSeekTo(timeSec);
  }, [onSeekTo]);

  const handleTokenClick = useCallback((token: LemmatizedToken, cue: SubtitleCue) => {
    log('Token clicked:', token.text, token.lemmas.map(l => l.lemma));
    setSelectedToken(token);
    setSelectedCue(cue);
    setExplainCue(null);
  }, []);

  const handleExplainLine = useCallback(async (cue: SubtitleCue) => {
    if (!isPro) return; // ADR-0034 D3: AI explanations are hard Pro-only
    setSelectedToken(null);
    setExplainCue(cue);
    setExplainLoading(true);
    setExplainText(null);
    setExplainError(null);

    try {
      const l1Name = l1Code.toUpperCase();
      const prompt = `Provide a clear breakdown of the following ${l2Code} text. Include:
1. Its overall meaning in ${l1Name}
2. A phrase-by-phrase breakdown explaining how the text is constructed

Text: ${cue.text}`;

      const res = await apiFetch(`${API_BASE}/chatgpt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setExplainText(data.response || data.text || data.result || JSON.stringify(data));
    } catch (err: any) {
      setExplainError(err?.message || 'Explain failed');
    } finally {
      setExplainLoading(false);
    }
  }, [isPro, l1Code, l2Code]);

  const closeExplain = useCallback(() => {
    setExplainCue(null);
    setExplainText(null);
    setExplainError(null);
  }, []);

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

    // Before playback starts, tokenize the first few cues so the panel isn't
    // showing raw text when the video begins.
    if (activeCueIdx < 0) {
      const texts = cues.slice(0, TOKENIZE_LOOKAHEAD).map(c => c.text);
      if (texts.length > 0) preFetch(texts, l2Code);
      return;
    }

    if (!activeChanged) return;
    const el = listRef.current?.querySelector(
      `[data-index="${activeCueIdx}"]`,
    ) as HTMLElement | null;
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // Only pre-fetch when the active cue crosses into a new window boundary.
    // Window size = TOKENIZE_LOOKAHEAD / 2 so we re-fetch roughly when
    // the "next 5" window has advanced by ~2-3 cues.
    const windowSize = Math.max(1, Math.floor(TOKENIZE_LOOKAHEAD / 2));
    const windowIdx = Math.floor(activeCueIdx / windowSize);
    if (windowIdx === prefetchWindowRef.current) return;
    prefetchWindowRef.current = windowIdx;

    const start = Math.max(0, activeCueIdx);
    const end = Math.min(cues.length, activeCueIdx + TOKENIZE_LOOKAHEAD);
    const texts: string[] = [];
    for (let i = start; i < end; i++) {
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
            tokenizeAhead={activeCueIdx < 0 ? i < TOKENIZE_LOOKAHEAD : i >= activeCueIdx && i <= activeCueIdx + TOKENIZE_LOOKAHEAD}
            isPro={isPro}
            l2Code={l2Code}
            showPhonetics={showPhonetics}
            onSeekTo={handleSeekTo}
            onTokenClick={handleTokenClick}
            translation={translated.get(i) || ''}
            showTranslation={showTranslation}
            onExplainLine={handleExplainLine}
            explainLoading={explainLoading}
            localeVersion={localeVersion}
          />
        ))}
      </div>

      {/* ADR-0034: free users get 10 lines, then an upgrade prompt */}
      {!isPro && cues.length > FREE_TRANSCRIPT_LINES && (
        <div className="lpv-pro-banner">
          <span>{t('upgradeToProBanner')}</span>
          <a
            href={`${WEB_APP_URL}/${encodeURIComponent(l1Code)}/${encodeURIComponent(l2Code)}/go-pro`}
            target="_blank"
            rel="noopener noreferrer"
            className="lpv-pro-banner-link"
          >
            {t('upgradeToPro')}
          </a>
        </div>
      )}

      {/* Shared dictionary dock — renders above bottom bar */}
      <DictionaryDock
        token={selectedToken}
        l1Code={l1Code}
        l2Code={l2Code}
        contextText={selectedCue?.text}
        cueStartTime={selectedCue?.start}
        videoTitle={videoTitle}
        pageUrl={pageUrl}
        isPro={isPro}
        subLoading={subLoading}
        onClose={() => { setSelectedToken(null); setSelectedCue(null); }}
      />

      {explainCue && (
        <div className="lpv-dict-overlay">
          <div className="lpv-dict-card" onClick={(e) => e.stopPropagation()}>
            <div className="lpv-dict-card-header">
              <div className="lpv-dict-card-header-left">
                <span className="lpv-dict-card-word">{t('explainTitle')}</span>
              </div>
              <button onClick={closeExplain} className="lpv-dict-card-close" title={t('close')}><X size={14} /></button>
            </div>
            <div className="lpv-dict-card-body">
              {explainLoading && (
                <div className="lpv-explain-loading"><span className="lpv-spinner" /></div>
              )}
              {explainError && (
                <div className="lpv-explain-error">{explainError}</div>
              )}
              {explainText && (
                <div className="lpv-explain-section" style={{ borderBottom: 'none' }}>
                  <Markdown text={explainText} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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
        <label className="lpv-translate-switch" title={t('showTranslation')}>
          <input
            type="checkbox"
            checked={showTranslation}
            onChange={(e) => handleTranslationToggle(e.target.checked)}
          />
          <span className="lpv-switch-slider" />
          <span className="lpv-switch-label">{t('translate')}</span>
        </label>
        <div className="lpv-stepper">
          <button
            className="lpv-stepper-btn"
            onClick={() => adjustTextScale(-1)}
            disabled={textScale <= 0}
            title={t('action.zoom_out') || 'Smaller'}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14"/></svg>
          </button>
          <span className="lpv-stepper-value">A</span>
          <button
            className="lpv-stepper-btn"
            onClick={() => adjustTextScale(1)}
            disabled={textScale >= 4}
            title={t('action.zoom_in') || 'Larger'}
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

// ── Shared Dictionary Dock ────────────────────────────────────────────────

interface DictionaryDockProps {
  token: LemmatizedToken | null;
  l1Code: string;
  l2Code: string;
  contextText?: string;
  cueStartTime?: number;
  videoTitle?: string;
  pageUrl?: string;
  isPro: boolean;
  subLoading: boolean;
  onClose: () => void;
}

/** Dictionary card pinned to the bottom of both video and page sidebars. */
const DictionaryDock: React.FC<DictionaryDockProps> = ({
  token,
  l1Code,
  l2Code,
  contextText,
  cueStartTime,
  videoTitle,
  pageUrl,
  isPro,
  subLoading,
  onClose,
}) => {
  if (!token) return null;
  return (
    <div className="lpv-dict-overlay">
      <DictionaryCard
        token={token}
        l1Code={l1Code}
        l2Code={l2Code}
        contextText={contextText}
        cueStartTime={cueStartTime}
        videoTitle={videoTitle}
        pageUrl={pageUrl}
        isPro={isPro}
        subLoading={subLoading}
        onClose={onClose}
      />
    </div>
  );
};

// ── Page Panel (text mode) ────────────────────────────────────────────────

interface PagePanelProps {
  l1Code: string;
  l2Code: string;
  pageUrl: string;
  onFollowLink?: (href: string) => void;
}

interface PageLookupDetail {
  token: LemmatizedToken;
  blockText: string;
  blockId?: string | null;
  href?: string | null;
}

/** Side panel content for page mode: translated block + dictionary card.
 *  Shares the video mode's bottom bar, SavedWordsProvider, and DictionaryCard. */
const PagePanel: React.FC<PagePanelProps> = ({ l1Code, l2Code, pageUrl, onFollowLink }) => {
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
  const { isPro, loading: subLoading } = useSubscription();

  useEffect(() => {
    try {
      chrome.storage.local.get(['showPhonetics', 'showTranslation', 'textScale'], (result) => {
        if (result.showPhonetics !== undefined) setShowPhonetics(result.showPhonetics);
        if (result.showTranslation !== undefined) setShowTranslation(result.showTranslation);
        if (result.textScale !== undefined) setTextScale(result.textScale);
      });
    } catch {}
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<PageLookupDetail>).detail;
      if (!detail?.token) return;
      log(`[PAGE] lookup: "${detail.token.text}", blockText chars=${(detail.blockText || '').length}, href=${detail.href || 'none'}`);
      const newBlockId = detail.blockId || null;
      setSelectedToken(detail.token);
      setBlockText(detail.blockText || '');
      setBlockId(newBlockId);
      setHref(detail.href || null);
      if (translatedBlockIdRef.current !== newBlockId) {
        setTranslation('');
      }
    };
    window.addEventListener('lpv-page-lookup', handler);
    return () => window.removeEventListener('lpv-page-lookup', handler);
  }, []);

  useEffect(() => {
    if (!selectedToken || !showTranslation || !blockText) {
      log(`[PAGE] translate skipped: token=${!!selectedToken}, showTranslation=${showTranslation}, blockText=${blockText.length} chars`);
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
  }, [selectedToken, showTranslation, blockText, blockId, l1Code, l2Code]);

  const handlePhoneticsToggle = (checked: boolean) => {
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

      <DictionaryDock
        token={selectedToken}
        l1Code={l1Code}
        l2Code={l2Code}
        contextText={blockText}
        pageUrl={pageUrl}
        isPro={isPro}
        subLoading={subLoading}
        onClose={() => setSelectedToken(null)}
      />

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
        <label className="lpv-translate-switch" title={t('showTranslation')}>
          <input
            type="checkbox"
            checked={showTranslation}
            onChange={(e) => handleTranslationToggle(e.target.checked)}
          />
          <span className="lpv-switch-slider" />
          <span className="lpv-switch-label">{t('translate')}</span>
        </label>
        <div className="lpv-stepper">
          <button
            className="lpv-stepper-btn"
            onClick={() => adjustTextScale(-1)}
            disabled={textScale <= 0}
            title={t('action.zoom_out') || 'Smaller'}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14"/></svg>
          </button>
          <span className="lpv-stepper-value">A</span>
          <button
            className="lpv-stepper-btn"
            onClick={() => adjustTextScale(1)}
            disabled={textScale >= 4}
            title={t('action.zoom_in') || 'Larger'}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
          </button>
        </div>
      </div>
    </>
  );
};

// ── Mount function — called by content-entry.js ────────────────────────────

let root: ReturnType<typeof createRoot> | null = null;

export function mountTranscript(
  container: HTMLElement,
  cues: SubtitleCue[],
  activeCueIdx: number,
  l2Code: string,
  l1Code: string,
  onSeekTo: (timeSec: number) => void,
  loadingL2?: string,
  localeVersion?: number,
  videoTitle?: string,
  pageUrl?: string,
): void {
  if (!root) {
    root = createRoot(container);
  }
  root.render(
    <SavedWordsProvider l2Code={l2Code}>
      <TranscriptAppInner
        cues={cues}
        activeCueIdx={activeCueIdx}
        l2Code={l2Code}
        l1Code={l1Code}
        onSeekTo={onSeekTo}
        loadingL2={loadingL2}
        localeVersion={localeVersion}
        videoTitle={videoTitle}
        pageUrl={pageUrl}
      />
    </SavedWordsProvider>,
  );
}

export function unmountTranscript(): void {
  if (root) {
    root.unmount();
    root = null;
  }
}

let pageRoot: ReturnType<typeof createRoot> | null = null;

export function mountPagePanel(container: HTMLElement, props: PagePanelProps): void {
  if (!pageRoot) pageRoot = createRoot(container);
  pageRoot.render(
    <SavedWordsProvider l2Code={props.l2Code}>
      <PagePanel {...props} />
    </SavedWordsProvider>,
  );
}

export function unmountPagePanel(): void {
  if (pageRoot) {
    pageRoot.unmount();
    pageRoot = null;
  }
}
