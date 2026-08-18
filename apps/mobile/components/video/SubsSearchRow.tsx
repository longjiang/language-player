import React from 'react';
import { View, Text, Image, ScrollView } from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import type { SubtitleLine, SubsSearchVideo } from '@langplayer/shared';
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
 *  on a tie (web subs-search-row fidelity, SPEC-082 Task 7). */
function HighlightTerms({ line, terms }: { line: string; terms: string[] }) {
  const active = terms.map((t) => t.trim()).filter(Boolean);
  if (active.length === 0) return <Text>{line}</Text>;

  const lowerLine = line.toLowerCase();
  const nodes: React.ReactNode[] = [];
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
      nodes.push(<Text key={`tail-${pos}`}>{line.slice(pos)}</Text>);
      break;
    }
    if (bestIdx > pos) nodes.push(<Text key={`pre-${pos}`}>{line.slice(pos, bestIdx)}</Text>);
    nodes.push(
      <Text key={`hit-${bestIdx}-${bestLen}`} className="font-semibold text-primary">
        {line.slice(bestIdx, bestIdx + bestLen)}
      </Text>,
    );
    pos = bestIdx + bestLen;
  }

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

      {/* Info — original on top, translation below, horizontal scroll for long lines */}
      <View className="min-w-0 flex-1">
        <View className="flex-row items-center gap-1.5">
          <Text className="min-w-0 flex-1 text-xs font-medium text-foreground" numberOfLines={1}>
            {video.title}
          </Text>
          {video.duration != null && (
            <Text className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
              {formatTime(video.duration)}
            </Text>
          )}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-0.5">
          <View>
            <View className="flex-row">
              {segments.map((seg, j) => (
                <Text
                  key={j}
                  className={`text-sm ${seg.hasTerm ? 'text-foreground' : 'text-muted-foreground'}`}
                >
                  {j > 0 ? ' ' : ''}
                  <HighlightTerms line={seg.text} terms={highlightTerms} />
                </Text>
              ))}
            </View>
            {showTranslation && (
              <View className="mt-0.5 flex-row">
                {segments.map((seg, j) => {
                  const flatIdx = (translationStart ?? 0) + j;
                  const translated = translations[flatIdx]?.line;
                  if (!translated) return null;
                  return (
                    <Text key={j} className="text-xs text-muted-foreground">
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
