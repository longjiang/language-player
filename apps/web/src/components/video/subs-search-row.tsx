'use client';

import { useMemo, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import type { SubtitleLine, SubsSearchVideo, VideoNote, SubtitleNoteMarker } from '@langplayer/shared';
import { extractNoteMarkers } from '@langplayer/utils';
import { youtubeThumbnail } from '@/lib/video-service';
import { TranslationSkeleton } from '@/components/ui/translation-skeleton';
import { isLineInTranslationLookahead } from '@/hooks/use-subtitle-translation';
import { NoteBadge, NotePopup } from '@/components/note-popup';
import { log } from '@/lib/logger';

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

/** Highlight the earliest search-term match in a line, preferring the longest
 *  term on a tie. Also strips `[n]` note markers (SPEC-093) and draws a badge
 *  where each marker was, so the annotation is visible in the preview without
 *  leaking raw brackets. */
function HighlightLine({
  line,
  terms,
  notes,
  onNote,
}: {
  line: string;
  terms: string[];
  notes?: VideoNote[];
  onNote: (marker: SubtitleNoteMarker) => void;
}) {
  const active = terms.map((t) => t.trim()).filter(Boolean);
  const noteById = useMemo(() => new Map((notes ?? []).map((n) => [n.id, n])), [notes]);

  const { cleanText, markers } = useMemo(() => extractNoteMarkers(line), [line]);
  const markerByBoundary = useMemo(() => {
    const m = new Map<number, SubtitleNoteMarker>();
    for (const mk of markers) {
      m.set(mk.index, { id: mk.id, index: mk.index, note: noteById.get(mk.id)?.note ?? '' });
    }
    return m;
  }, [markers, noteById]);

  // Build [start, end, highlighted] runs over the clean text.
  const segs = useMemo(() => {
    const out: Array<{ start: number; end: number; highlight: boolean }> = [];
    const push = (start: number, end: number, highlight: boolean) => {
      if (end > start) out.push({ start, end, highlight });
    };
    if (cleanText.length === 0) return out;
    if (active.length === 0) {
      push(0, cleanText.length, false);
      return out;
    }
    const lower = cleanText.toLowerCase();
    let pos = 0;
    while (pos < cleanText.length) {
      let bestIdx = -1;
      let bestLen = 0;
      for (const term of active) {
        const idx = lower.indexOf(term.toLowerCase(), pos);
        if (
          idx !== -1 &&
          (bestIdx === -1 || idx < bestIdx || (idx === bestIdx && term.length > bestLen))
        ) {
          bestIdx = idx;
          bestLen = term.length;
        }
      }
      if (bestIdx === -1) {
        push(pos, cleanText.length, false);
        break;
      }
      push(pos, bestIdx, false);
      push(bestIdx, bestIdx + bestLen, true);
      pos = bestIdx + bestLen;
    }
    return out;
  }, [cleanText, active]);

  // Flatten: text runs (search-highlighted) interleaved with note badges at
  // the marker boundaries.
  const nodes: ReactNode[] = [];
  let cursor = 0;
  const emitMarker = (boundary: number) => {
    const mk = markerByBoundary.get(boundary);
    if (mk) {
      nodes.push(
        <NoteBadge
          key={`note-${boundary}-${mk.id}`}
          id={mk.id}
          muted={!mk.note}
          onClick={() => onNote(mk)}
        />,
      );
    }
  };
  for (const seg of segs) {
    emitMarker(cursor);
    const text = cleanText.slice(seg.start, seg.end);
    if (seg.highlight) {
      nodes.push(
        <mark
          key={`hl-${seg.start}-${seg.end}`}
          className="rounded bg-primary/15 px-0.5 font-semibold text-primary ring-1 ring-primary/30"
        >
          {text}
        </mark>,
      );
    } else {
      nodes.push(text);
    }
    cursor = seg.end;
  }
  emitMarker(cleanText.length);

  return <span>{nodes}</span>;
}

/**
 * A single subs-search result row: thumbnail + the matched subtitle line
 * (with search terms highlighted and note badges drawn) and, when
 * translations are enabled, the muted translation below. Clicking opens
 * playback for that result.
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
  const [selectedNote, setSelectedNote] = useState<SubtitleNoteMarker | null>(null);

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
                <HighlightLine
                  line={seg.text}
                  terms={highlightTerms}
                  notes={video.notes}
                  onNote={(m) => setSelectedNote(m)}
                />
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

      {selectedNote && (
        <NotePopup note={selectedNote} onClose={() => setSelectedNote(null)} />
      )}
    </div>
  );
}
