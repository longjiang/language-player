import React from 'react';
import { View, Text, Image, ScrollView } from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import type { SubtitleLine, SubsSearchVideo } from '@langplayer/shared';
import { renderInlineMarkdown } from '@/lib/inline-markdown';
import { TokenizedText } from '@/components/TokenizedText';
import { useLanguage } from '@/contexts/LanguageContext';

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
 *
 * SPEC-114: the L2 line renders through `TokenizedText` so Chinese
 * simplified↔traditional follows the learner's script preference
 * (ADR-0019, render-layer conversion) and phonetics follow their
 * `tokenSpan.phonetics` setting. The row is a *preview*, not an interactive
 * reading surface: the tokenized text is wrapped in `pointerEvents="none"`, so
 * taps fall through to the row (opening playback) instead of opening the
 * dictionary popup, saved words are not highlighted, and interlinear
 * definitions are suppressed so a row stays one line tall. Text size follows
 * SPEC-051's block-level rule — the user's zoom applies.
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
  const { l2Lang } = useLanguage();
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
                <View key={j} className="flex-row">
                  {j > 0 ? <Text> </Text> : null}
                  {/* Display-only tokenized L2 line (SPEC-114). `pointerEvents="none"`
                      makes every token inert: the tap reaches the row (playback),
                      never a dictionary popup. */}
                  <View pointerEvents="none">
                    <TokenizedText
                      text={seg.text}
                      l2Code={l2Lang.code}
                      textColor={seg.hasTerm ? 'text-foreground' : 'text-muted-foreground'}
                      highlightTerms={highlightTerms}
                      notes={video.notes}
                      highlightSaved={false}
                      showDefinition={false}
                      disablePopup
                    />
                  </View>
                </View>
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
