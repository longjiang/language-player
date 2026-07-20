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

// ── Types ──────────────────────────────────────────────────────────────────

interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

interface TranscriptAppProps {
  cues: SubtitleCue[];
  activeCueIdx: number;
  /** ISO 639-1 language code for the subtitle language (e.g. "ja", "zh", "ko") */
  l2Code: string;
  /** ISO 639-1 language code for the UI / native language (e.g. "en") */
  l1Code: string;
  /** Called when the user clicks a subtitle line to seek the video */
  onSeekTo: (timeSec: number) => void;
}

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
    // Structural tokens
    if (token.text === '\n' || token.text === '\r') {
      return <br />;
    }

    const isWord = token.lemmas.length > 0;

    // Punctuation, spaces — raw text
    if (!isWord) {
      return <>{token.text}</>;
    }

    // Build ruby segments
    const hasPhonetics = !!token.pronunciation && token.pronunciation !== token.text;
    const rubySegments: RubySegment[] | null = hasPhonetics
      ? buildRuby(token.text, token.pronunciation!, l2Code)
      : null;

    const lemmaTitle = token.lemmas.map((l) => l.lemma).join(', ');

    return (
      <span
        className={`lpv-token ${isActive ? 'lpv-token-active' : ''}`}
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
}

const CueLine: React.FC<CueLineProps> = React.memo(
  ({ cue, index, isActive, l2Code, onSeekTo, onTokenClick }) => {
    const handleClick = useCallback(() => {
      onSeekTo(cue.start);
    }, [cue.start, onSeekTo]);

    const minutes = Math.floor(cue.start / 60);
    const seconds = Math.floor(cue.start % 60);
    const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;

    return (
      <div
        className={`lpv-cue ${isActive ? 'lpv-active' : ''}`}
        data-index={index}
        onClick={handleClick}
      >
        <span className="lpv-cue-time">{timeStr}</span>
        <TokenizedLine
          text={cue.text}
          l2Code={l2Code}
          isActive={isActive}
          onClickLine={handleClick}
          onTokenClick={onTokenClick}
        />
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

const TranscriptApp: React.FC<TranscriptAppProps> = ({
  cues,
  activeCueIdx,
  l2Code,
  l1Code,
  onSeekTo,
}) => {
  const listRef = useRef<HTMLDivElement>(null);
  const prevActiveRef = useRef(activeCueIdx);
  const [selectedToken, setSelectedToken] = useState<LemmatizedToken | null>(null);

  // When seeking to a line (clicking a line or arrow keys), close the dictionary card
  const handleSeekTo = useCallback((timeSec: number) => {
    setSelectedToken(null);
    onSeekTo(timeSec);
  }, [onSeekTo]);

  const handleTokenClick = useCallback((token: LemmatizedToken) => {
    console.log('[LPV] Token clicked:', token.text, token.lemmas.map(l => l.lemma));
    setSelectedToken(token);
  }, []);

  // Auto-scroll to active cue
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
        />
      ))}

      {/* Dictionary card: shown inline when a word is clicked */}
      {selectedToken && (
        <DictionaryCard
          token={selectedToken}
          l1Code={l1Code}
          l2Code={l2Code}
          onClose={() => setSelectedToken(null)}
        />
      )}
    </div>
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
    <TranscriptApp
      cues={cues}
      activeCueIdx={activeCueIdx}
      l2Code={l2Code}
      l1Code={l1Code}
      onSeekTo={onSeekTo}
    />,
  );
}

export function unmountTranscript(): void {
  if (root) {
    root.unmount();
    root = null;
  }
}
