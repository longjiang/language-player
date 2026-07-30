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
import { SavedWordsProvider, useSavedWords } from './components/SavedWordsProvider';
import { useTranslateLines } from './use-translate-lines';
import { useBatchLemmatize } from './use-batch-lemmatize';
import { useSubscription } from './use-subscription';
import type { SubCue } from './use-translate-lines';
import { t, getLocaleVersion } from './i18n';

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
}

// Re-export SubCue type for content-entry.js
export type { SubCue };

// ── Note: token cache lives in use-batch-lemmatize.ts ──────────────────────

// ── Tokenized Line Component ───────────────────────────────────────────────

interface TokenizedLineProps {
  text: string;
  l2Code: string;
  isActive: boolean;
  onClickLine: () => void;
  onTokenClick: (token: LemmatizedToken) => void;
}

const TokenizedLine: React.FC<TokenizedLineProps> = React.memo(
  ({ text, l2Code, isActive, onClickLine, onTokenClick }) => {
    const [visible, setVisible] = useState(false);
    const containerRef = useRef<HTMLSpanElement>(null);
    const { getTokens } = useBatchLemmatize();

    const tokens = visible ? getTokens(text, l2Code) : null;

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
    }, [visible]);

    // ── Render: three visual states ──
    const renderState = tokens ? 'TOKENS' : visible ? 'LOADING' : 'HIDDEN';
    if (renderState === 'TOKENS') {
      console.log(`[LPV] [RENDER] Tokenized line: "${text.substring(0, 40)}" (${tokens.length} tokens)`);
    } else if (renderState === 'LOADING') {
      console.log(`[LPV] [RENDER] Waiting for tokens: "${text.substring(0, 40)}"`);
    }
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
              onClickLine={onClickLine}
              onTokenClick={onTokenClick}
            />
          ))
        ) : (
          <span className="lpv-cue-loading">{text}</span>
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
  onClickLine: () => void;
  onTokenClick: (token: LemmatizedToken) => void;
}

const TokenSpan: React.FC<TokenSpanProps> = React.memo(
  ({ token, l2Code, isActive, onClickLine, onTokenClick }) => {
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

    // Build ruby segments
    const hasPhonetics = token.pronunciation && token.pronunciation !== token.text;
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
  l2Code: string;
  onSeekTo: (timeSec: number) => void;
  onTokenClick: (token: LemmatizedToken) => void;
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
  ({ cue, index, isActive, l2Code, onSeekTo, onTokenClick, translation, showTranslation, onExplainLine, explainLoading, localeVersion }) => {
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
            onClickLine={handleClick}
            onTokenClick={onTokenClick}
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
            …
          </button>
          {menuOpen && (
            <div className="lpv-cue-menu-dropdown">
              <button onClick={handleCopy} className="lpv-cue-menu-item">{t('copy')}</button>
              <button onClick={handleSpeak} className="lpv-cue-menu-item">{t('speak')}</button>
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
      <>
        <span className="lpv-spinner" />
        {t('loadingLanguage', [loadingL2])}
      </>
    ) : (
      <>
        {t('waitingForSubtitles')}
        <br />
        {t('startPlaying')}
      </>
    )}
  </div>
);

// ── Transcript App ────────────────────────────────────────────────────────

/** Number of cues ahead of the active cue to pre-fetch tokens for. */
const PRE_FETCH_LOOKAHEAD = 15;

const TranscriptAppInner: React.FC<TranscriptAppProps> = ({
  cues,
  activeCueIdx,
  l2Code,
  l1Code,
  onSeekTo,
  loadingL2,
  localeVersion,
}) => {
  const listRef = useRef<HTMLDivElement>(null);
  const prevActiveRef = useRef(activeCueIdx);
  const [selectedToken, setSelectedToken] = useState<LemmatizedToken | null>(null);
  const [showTranslation, setShowTranslation] = useState(false);
  const [explainLoading, setExplainLoading] = useState(false);
  const [explainText, setExplainText] = useState<string | null>(null);
  const [explainError, setExplainError] = useState<string | null>(null);
  const [explainCue, setExplainCue] = useState<SubtitleCue | null>(null);

  const { isPro } = useSubscription();
  const { preFetch } = useBatchLemmatize();

  const { translated, loading: translating, progress } = useTranslateLines(
    cues,
    l1Code,
    l2Code,
    showTranslation,
  );

  const handleSeekTo = useCallback((timeSec: number) => {
    setSelectedToken(null);
    onSeekTo(timeSec);
  }, [onSeekTo]);

  const handleTokenClick = useCallback((token: LemmatizedToken) => {
    console.log('[LPV] Token clicked:', token.text, token.lemmas.map(l => l.lemma));
    setSelectedToken(token);
    setExplainCue(null);
  }, []);

  const handleExplainLine = useCallback(async (cue: SubtitleCue) => {
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

      const res = await fetch('https://pythonvps.zerotohero.ca/chatgpt', {
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
  }, [l1Code, l2Code]);

  const closeExplain = useCallback(() => {
    setExplainCue(null);
    setExplainText(null);
    setExplainError(null);
  }, []);

  // ── Pre-fetch window: only fire when activeCueIdx enters a new "page" ──
  // Throttles pre-fetch to avoid a batch call on every timeupdate (~250ms).
  const prefectWindowRef = useRef(-1);

  useEffect(() => {
    if (activeCueIdx === prevActiveRef.current) return;
    prevActiveRef.current = activeCueIdx;
    if (activeCueIdx < 0) return;
    const el = listRef.current?.querySelector(
      `[data-index="${activeCueIdx}"]`,
    ) as HTMLElement | null;
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // Only pre-fetch when the active cue crosses into a new window boundary.
    // Window size = PRE_FETCH_LOOKAHEAD / 2 so we re-fetch roughly when
    // the "next 15" window has advanced by ~7-8 cues.
    const windowSize = Math.max(1, Math.floor(PRE_FETCH_LOOKAHEAD / 2));
    const windowIdx = Math.floor(activeCueIdx / windowSize);
    if (windowIdx === prefectWindowRef.current) return;
    prefectWindowRef.current = windowIdx;

    const start = Math.max(0, activeCueIdx);
    const end = Math.min(cues.length, activeCueIdx + PRE_FETCH_LOOKAHEAD);
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

  return (
    <>
      {/* Control bar */}
      <div className="lpv-control-bar">
        <label className="lpv-translate-switch" title={t('showTranslation')}>
          <input
            type="checkbox"
            checked={showTranslation}
            onChange={(e) => setShowTranslation(e.target.checked)}
          />
          <span className="lpv-switch-slider" />
          <span className="lpv-switch-label">{t('translate')}</span>
        </label>
        {translating && (
          <span className="lpv-control-status">
            {t('translating', [String(progress), String(cues.length)])}
          </span>
        )}
      </div>

      <div ref={listRef}>
        {cues.map((cue, i) => (
          <CueLine
            key={i}
            cue={cue}
            index={i}
            isActive={i === activeCueIdx}
            l2Code={l2Code}
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

      {selectedToken && (
        <div className="lpv-dict-overlay">
          <DictionaryCard
            token={selectedToken}
            l1Code={l1Code}
            l2Code={l2Code}
            onClose={() => setSelectedToken(null)}
          />
        </div>
      )}

      {/* Line-level AI explain overlay */}
      {explainCue && (
        <div className="lpv-dict-overlay">
          <div className="lpv-dict-card" onClick={(e) => e.stopPropagation()}>
            <div className="lpv-dict-card-header">
              <div className="lpv-dict-card-header-left">
                <span className="lpv-dict-card-word">{t('explainTitle')}</span>
                {explainLoading && <span className="lpv-dict-card-pron">{t('thinking')}</span>}
              </div>
              <button onClick={closeExplain} className="lpv-dict-card-close" title="Close">✕</button>
            </div>
            <div className="lpv-dict-card-body">
              <div className="lpv-explain-section" style={{ borderBottom: 'none' }}>
                {explainLoading && (
                  <div className="lpv-explain-loading">{t('aiThinking')}</div>
                )}
                {explainError && (
                  <div className="lpv-explain-error">{explainError}</div>
                )}
                {explainText && (
                  <Markdown text={explainText} />
                )}
              </div>
            </div>
          </div>
        </div>
      )}
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
): void {
  if (!root) {
    root = createRoot(container);
  }
  root.render(
    <SavedWordsProvider>
      <TranscriptAppInner
        cues={cues}
        activeCueIdx={activeCueIdx}
        l2Code={l2Code}
        l1Code={l1Code}
        onSeekTo={onSeekTo}
        loadingL2={loadingL2}
        localeVersion={localeVersion}
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
