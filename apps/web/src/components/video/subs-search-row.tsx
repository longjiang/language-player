'use client';

import type { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import type { SubtitleLine, SubsSearchVideo } from '@langplayer/shared';
import { youtubeThumbnail } from '@/lib/video-service';
import { TranslationSkeleton } from '@/components/ui/translation-skeleton';
import { isLineInTranslationLookahead } from '@/hooks/use-subtitle-translation';

/** mm:ss clock label for a subtitle timestamp or video duration. */
export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
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

/** Highlight the earliest search-term match in a line, preferring the longest
 *  term on a tie. Renders the rest of the line verbatim. */
function HighlightTerms({ line, terms }: { line: string; terms: string[] }) {
  const active = terms.map((t) => t.trim()).filter(Boolean);
  if (active.length === 0) return <span>{line}</span>;

  const lowerLine = line.toLowerCase();
  const nodes: ReactNode[] = [];
  let pos = 0;

  while (pos < line.length) {
    // Find the earliest match of any term; prefer the longest term on ties.
    let bestIdx = -1;
    let bestLen = 0;
    for (const term of active) {
      const idx = lowerLine.indexOf(term.toLowerCase(), pos);
      if (
        idx !== -1 &&
        (bestIdx === -1 || idx < bestIdx || (idx === bestIdx && term.length > bestLen))
      ) {
        bestIdx = idx;
        bestLen = term.length;
      }
    }
    if (bestIdx === -1) {
      nodes.push(line.slice(pos));
      break;
    }
    if (bestIdx > pos) nodes.push(line.slice(pos, bestIdx));
    nodes.push(
      <mark
        key={`${bestIdx}-${bestLen}`}
        className="rounded bg-primary/15 px-0.5 font-semibold text-primary ring-1 ring-primary/30"
      >
        {line.slice(bestIdx, bestIdx + bestLen)}
      </mark>,
    );
    pos = bestIdx + bestLen;
  }

  return <span>{nodes}</span>;
}

/**
 * A single subs-search result row: thumbnail + the matched subtitle line
 * (with search terms highlighted) and, when translations are enabled, the
 * muted translation below. Clicking opens playback for that result.
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
  const ml = video.subs_l2[video.matchLineIndex];

  return (
    <button
      onClick={onSelect}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted/50 ${
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
                <HighlightTerms line={seg.text} terms={highlightTerms} />
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
                            <mark className="rounded bg-primary/15 px-0.5 font-semibold text-primary ring-1 ring-primary/30">
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
    </button>
  );
}
