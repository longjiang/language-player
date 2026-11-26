'use client';

import ReactMarkdown from 'react-markdown';
import type { SubtitleLine, SubsSearchVideo } from '@langplayer/shared';
import { youtubeThumbnail } from '@/lib/video-service';
import { TranslationSkeleton } from '@/components/ui/translation-skeleton';
import { isLineInTranslationLookahead } from '@/hooks/use-subtitle-translation';
import { TokenizedText } from '@/components/tokenized-text';
import { useLanguage } from '@/providers/language-provider';
import { log } from '@/lib/logger';
import { HIGHLIGHT_CLASS } from '@/lib/highlight';

/** mm:ss clock label for a subtitle timestamp or video duration. */
export function formatTime(seconds: number): string {
  // Duration can arrive as a numeric string (e.g. "123") or empty/NaN from the
  // API; coerce to a number. Log non-numeric input so we can see what the API
  // actually sent.
  const n = typeof seconds === 'number' ? seconds : Number(seconds);
  if (!Number.isFinite(n) || n < 0) {
    log('[LP Web] formatTime received non-number', { seconds, type: typeof seconds, coerced: n });
    return '--:--';
  }
  const m = Math.floor(n / 60);
  const s = Math.floor(n % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** One matched-line segment: the original text plus whether it contains a
 *  search term (drives the muted/normal treatment and the server-side
 *  highlight form). */
export interface SubsSearchRowSegment {
  text: string;
  hasTerm: boolean;
}

interface SubsSearchRowProps {
  /** The search result video being rendered. */
  video: SubsSearchVideo;
  /** Index in the visible, filtered list. */
  index: number;
  /** Whether this row is the currently selected video. */
  isActive: boolean;
  /** Called when the row is clicked (open playback modal). */
  onSelect: () => void;
  /** Matched-line segments (original text + hasTerm flag). */
  segments: SubsSearchRowSegment[];
  /** Comma-split search terms used to highlight matches. */
  highlightTerms: string[];
  /** Whether translations are enabled (toggles the muted translation line). */
  showTranslation: boolean;
  /** Index of this row's first segment in the flat translation array. */
  translationStart: number;
  /** Translated lines for the visible rows (indexed by flat translation index). */
  translations: SubtitleLine[];
  /** Whether the translation loop is currently running. */
  translating: boolean;
  /** First visible line index — used to decide which rows show a skeleton. */
  firstLineIndex: number;
}

/**
 * A single subs-search result row: thumbnail + the matched subtitle line
 * (with search terms highlighted and note badges drawn) and, when
 * translations are enabled, the muted translation below. Clicking opens
 * playback for that result.
 *
 * SPEC-114: the L2 line renders through `TokenizedText` so Chinese
 * simplified↔traditional follows the learner's script preference
 * (ADR-0019, render-layer conversion) and phonetics follow their
 * `tokenSpan.phonetics` setting. The row is a *preview*, not an interactive
 * reading surface: the tokenized text is wrapped in `pointer-events-none`, so
 * taps fall through to the row (opening playback) instead of opening the
 * dictionary popup, saved words are not highlighted, and interlinear
 * definitions are suppressed so a row stays one line tall. Text size follows
 * SPEC-051's block-level rule — the user's zoom applies.
 */
export function SubsSearchRow({
  video,
  index,
  isActive,
  onSelect,
  segments,
  highlightTerms,
  showTranslation,
  translationStart,
  translations,
  translating,
  firstLineIndex,
}: SubsSearchRowProps) {
  const { l2 } = useLanguage();
  const ml = video.subs_l2[video.matchLineIndex];

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted/50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        isActive ? 'bg-primary/5 ring-1 ring-primary/30' : ''
      }`}
    >
      {/* Thumbnail */}
      <div className="relative h-12 w-20 flex-shrink-0 overflow-hidden rounded bg-muted">
        <img
          src={youtubeThumbnail(video.youtube_id)}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
        />
        {ml && (
          <span className="absolute bottom-0.5 right-0.5 rounded bg-black/70 px-1 py-0 text-[10px] text-white">
            {formatTime(ml.starttime)}
          </span>
        )}
      </div>

      {/* Original on top, translation (smaller, muted) below */}
      <div className="min-w-0 flex-1 overflow-x-auto">
        <div className="w-max">
          <div className="whitespace-nowrap text-base leading-snug">
            {segments.map((seg, j) => (
              <span
                key={j}
                className={seg.hasTerm ? '' : 'text-muted-foreground'}
              >
                {j > 0 ? ' ' : ''}
                {/* Display-only tokenized L2 line (SPEC-114). `pointer-events-none`
                    makes every token inert: the click reaches the row (playback),
                    never a dictionary popup. */}
                <span className="pointer-events-none">
                  <TokenizedText
                    text={seg.text}
                    l2Code={l2.code}
                    textColor={seg.hasTerm ? undefined : 'text-muted-foreground'}
                    highlightForms={highlightTerms}
                    notes={video.notes}
                    highlightSaved={false}
                    showDefinition={false}
                    disablePopup
                  />
                </span>
              </span>
            ))}
          </div>
          {showTranslation && (
            <div className="mt-1 whitespace-nowrap text-sm text-muted-foreground">
              {segments.map((seg, j) => {
                const flatIdx = (translationStart ?? 0) + j;
                const translated = translations[flatIdx]?.line;
                return (
                  <span
                    key={j}
                    className={seg.hasTerm ? '' : 'text-muted-foreground/50'}
                  >
                    {j > 0 ? ' ' : ''}
                    {translated ? (
                      <ReactMarkdown
                        components={{
                          p: ({ children }) => <span>{children}</span>,
                          strong: ({ children }) => (
                            <mark className={`rounded px-0.5 font-semibold ${HIGHLIGHT_CLASS}`}>
                              {children}
                            </mark>
                          ),
                        }}
                      >
                        {translated}
                      </ReactMarkdown>
                    ) : translating &&
                      isLineInTranslationLookahead(flatIdx, firstLineIndex) ? (
                      <TranslationSkeleton
                        text={seg.text}
                        className="inline-flex w-24 align-bottom"
                        barClassName="h-3"
                      />
                    ) : null}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
