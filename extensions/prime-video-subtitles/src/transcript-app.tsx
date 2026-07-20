/**
 * TranscriptApp — React component that renders tokenized subtitle lines.
 *
 * Replaces the vanilla JS renderCues() in content-entry.js.
 * Each subtitle line is tokenized via the Python API and displayed with
 * clickable words, furigana/pinyin ruby text, and lemma tooltips.
 */

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import type { LemmatizedToken } from '@langplayer/shared';
import { buildRuby, baseCode } from '@langplayer/utils';
import type { RubySegment } from '@langplayer/utils';
import { DictionaryCard } from './components/DictionaryCard';
import { SavedWordsProvider, useSavedWords } from './components/SavedWordsProvider';
import { useTranslateLines } from './use-translate-lines';
import { useSubscription } from './use-subscription';
import type { SubCue } from './use-translate-lines';

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
}

// Re-export SubCue type for content-entry.js
export type { SubCue };

// ── In-memory token cache ──────────────────────────────────────────────────

const tokenCache = new Map<string, LemmatizedToken[]>();

/** Production Python API URL — used when running on primevideo.com.
 *  Localhost won't work from an injected content script on a third-party domain. */
const API_BASE = 'https://pythonvps.zerotohero.ca';

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
    const [tokens, setTokens] = useState<LemmatizedToken[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);
    const [hasBeenVisible, setHasBeenVisible] = useState(false);
    const aborterRef = useRef<AbortController | null>(null);
    const containerRef = useRef<HTMLSpanElement>(null);

    const base = baseCode(l2Code);

    // ── Lazy tokenization: only fetch when visible (IntersectionObserver) ──
    useEffect(() => {
      if (hasBeenVisible) return;
      const el = containerRef.current;
      if (!el) return;

      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry?.isIntersecting) {
            setHasBeenVisible(true);
            observer.disconnect();
          }
        },
        { rootMargin: '200px' },
      );

      observer.observe(el);
      return () => observer.disconnect();
    }, [hasBeenVisible]);

    // ── Fetch tokens (only when visible) ──
    useEffect(() => {
      if (!hasBeenVisible) return;

      let cancelled = false;

      const cacheKey = `${base}:${text}`;
      const cached = tokenCache.get(cacheKey);
      if (cached) {
        setTokens(cached);
        return;
      }

      setLoading(true);

      const controller = new AbortController();
      aborterRef.current = controller;

      fetch(`${API_BASE}/lemmatize-normalized`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, l2: base }),
        signal: controller.signal,
      })
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then((data) => {
          if (!cancelled) {
            tokenCache.set(cacheKey, data.tokens);
            setTokens(data.tokens);
            setLoading(false);
          }
        })
        .catch((err) => {
          if (err.name !== 'AbortError' && !cancelled) {
            console.warn('[LPV] Tokenization failed for:', text, err);
            setError(true);
            setLoading(false);
          }
        });

      return () => {
        cancelled = true;
        controller.abort();
      };
    }, [text, base, hasBeenVisible]);

    // ── Render: three visual states ──
    return (
      <span
        ref={containerRef}
        className={`lpv-cue-text ${isActive ? 'lpv-active-text' : ''}`}
        onClick={(e) => { e.stopPropagation(); onClickLine(); }}
      >
        {tokens && !error ? (
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
        ) : loading ? (
          <span className="lpv-cue-loading">{text}</span>
        ) : (
          text
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
}

const CueLine: React.FC<CueLineProps> = React.memo(
  ({ cue, index, isActive, l2Code, onSeekTo, onTokenClick, translation, showTranslation, onExplainLine, explainLoading }) => {
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
            title="Actions"
          >
            …
          </button>
          {menuOpen && (
            <div className="lpv-cue-menu-dropdown">
              <button onClick={handleCopy} className="lpv-cue-menu-item">📋 Copy</button>
              <button onClick={handleSpeak} className="lpv-cue-menu-item">🔊 Speak</button>
              {!explainLoading && (
                <button
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onExplainLine(cue); }}
                  className="lpv-cue-menu-item"
                >
                  🤖 Explain
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

const EmptyState: React.FC = () => (
  <div className="lpv-empty">
    Waiting for subtitles...
    <br />
    Start playing a video on Prime Video.
  </div>
);

// ── Transcript App ────────────────────────────────────────────────────────

const TranscriptAppInner: React.FC<TranscriptAppProps> = ({
  cues,
  activeCueIdx,
  l2Code,
  l1Code,
  onSeekTo,
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
  }, [activeCueIdx]);

  if (cues.length === 0) {
    return <EmptyState />;
  }

  return (
    <>
      {/* Control bar */}
      <div className="lpv-control-bar">
        <button
          onClick={() => setShowTranslation(!showTranslation)}
          className={`lpv-control-btn ${showTranslation ? 'lpv-control-btn-active' : ''}`}
          title="Toggle translation (L1)"
        >
          {showTranslation ? '🌐 Translation ON' : '🌐 Translate'}
        </button>
        {translating && (
          <span className="lpv-control-status">
            Translating… {progress}/{cues.length}
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
                <span className="lpv-dict-card-word">🤖 Explain</span>
                {explainLoading && <span className="lpv-dict-card-pron">thinking…</span>}
              </div>
              <button onClick={closeExplain} className="lpv-dict-card-close" title="Close">✕</button>
            </div>
            <div className="lpv-dict-card-body">
              <div className="lpv-explain-section" style={{ borderBottom: 'none' }}>
                {explainLoading && (
                  <div className="lpv-explain-loading">🤖 AI is thinking…</div>
                )}
                {explainError && (
                  <div className="lpv-explain-error">{explainError}</div>
                )}
                {explainText && (
                  <div
                    className="lpv-markdown"
                    dangerouslySetInnerHTML={{
                      __html: explainText
                        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
                        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
                        .replace(/\n\n/g, '</p><p>')
                        .replace(/\n/g, '<br/>')
                        .replace(/^<p>/, '<p style="margin:0 0 8px;font-size:13px;color:#ccc;line-height:1.7">')
                    }}
                  />
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
