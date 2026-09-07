import React, { useMemo } from 'react';
import { View, Text, Image, ScrollView } from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import type { SubtitleLine, SubsSearchVideo } from '@langplayer/shared';
import { extractNoteMarkers } from '@langplayer/utils';
import { renderInlineMarkdown } from '@/lib/inline-markdown';

/** mm:ss clock label for a subtitle timestamp or video duration. */
export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function youtubeThumbnail(id: string): string {
  return `https://img.youtube.com/vi/${id}/mqdefault.jpg`;
}

/** One matched-line segment: the original text plus whether it contains a
 *  search term (drives the muted/normal treatment and the server-side
 *  highlight form). */
export interface SubsSearchRowSegment {
  text: string;
  hasTerm: boolean;
}

/** Highlight every search-term match in a line, preferring the longest term
 *  on a tie (web subs-search-row fidelity, SPEC-082 Task 7). Also strips `[n]`
 *  note markers (SPEC-093) and draws a small circled number where each marker
 *  was, so the annotation is visible in the preview without leaking raw
 *  brackets. The circled numbers are non-interactive here — the row opens the
 *  playback modal, where the full interactive (tap-to-open) note line renders.
 */
function HighlightTerms({ line, terms }: { line: string; terms: string[] }) {
  const active = terms.map((t) => t.trim()).filter(Boolean);
  const { cleanText, markers } = useMemo(() => extractNoteMarkers(line), [line]);
  if (active.length === 0 && markers.length === 0) return <Text>{cleanText}</Text>;

  const lowerLine = cleanText.toLowerCase();
  const nodes: React.ReactNode[] = [];
  // Boundaries where a note badge is drawn (operate on the clean text).
  const markerBoundaries = new Map<number, number>();
  for (const mk of markers) markerBoundaries.set(mk.index, mk.id);

  const emitBadge = (at: number) => {
    const id = markerBoundaries.get(at);
    if (id != null) {
      nodes.push(
        <Text key={`note-${at}-${id}`} className="bg-primary text-primary-foreground rounded-full text-center text-[10px] font-semibold">
          {' '}{id}{' '}
        </Text>,
      );
    }
  };

  let pos = 0;
  while (pos < cleanText.length) {
    emitBadge(pos);
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
      nodes.push(<Text key={`tail-${pos}`}>{cleanText.slice(pos)}</Text>);
      break;
    }
    if (bestIdx > pos) nodes.push(<Text key={`pre-${pos}`}>{cleanText.slice(pos, bestIdx)}</Text>);
    nodes.push(
      <Text key={`hit-${bestIdx}-${bestLen}`} className="font-semibold text-primary">
        {cleanText.slice(bestIdx, bestIdx + bestLen)}
      </Text>,
    );
    pos = bestIdx + bestLen;
  }
  emitBadge(cleanText.length);

  return <Text>{nodes}</Text>;
}

interface SubsSearchRowProps {
  /** The search result video being rendered. */
  video: SubsSearchVideo;
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
}

/**
 * A single subs-search result row: thumbnail + the matched subtitle line
 * (with search terms highlighted) and, when translations are enabled, the
 * muted translation below. Clicking opens playback for that result.
 * The parent owns list state, grouping, and the player queue (SPEC-082 Task 16).
 */
export function SubsSearchRow({
  video,
  isActive,
  onSelect,
  segments,
  highlightTerms,
  showTranslation,
  translationStart,
  translations,
}: SubsSearchRowProps) {
  const ml = video.subs_l2[video.matchLineIndex];

  return (
    <Pressable
      onPress={onSelect}
      className={`mb-2 flex-row gap-3 rounded-lg p-2 ${isActive ? 'bg-primary/5' : ''}`}
    >
      {/* Thumbnail */}
      <View className="h-12 w-20 overflow-hidden rounded bg-muted">
        <Image
          source={{ uri: youtubeThumbnail(video.youtube_id) }}
          className="h-full w-full"
          resizeMode="cover"
        />
        {ml && (
          <View className="absolute bottom-0.5 right-0.5 rounded bg-black/70 px-1">
            <Text className="text-[10px] text-white">{formatTime(ml.starttime)}</Text>
          </View>
        )}
      </View>

      {/* Info — matched line on top, translation below, horizontal scroll for long lines.
          No video title/duration — matches web subs-search-row (SPEC-082). */}
      <View className="min-w-0 flex-1">
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View>
            <View className="flex-row">
              {segments.map((seg, j) => (
                <Text
                  key={j}
                  className={`text-base ${seg.hasTerm ? 'text-foreground' : 'text-muted-foreground'}`}
                >
                  {j > 0 ? ' ' : ''}
                  <HighlightTerms line={seg.text} terms={highlightTerms} />
                </Text>
              ))}
            </View>
            {showTranslation && (
              <View className="mt-1 flex-row">
                {segments.map((seg, j) => {
                  const flatIdx = (translationStart ?? 0) + j;
                  const translated = translations[flatIdx]?.line;
                  if (!translated) return null;
                  return (
                    <Text key={j} className="text-sm text-muted-foreground">
                      {j > 0 ? ' ' : ''}
                      {renderInlineMarkdown(translated, { markBold: true })}
                    </Text>
                  );
                })}
              </View>
            )}
          </View>
        </ScrollView>
      </View>
    </Pressable>
  );
}
