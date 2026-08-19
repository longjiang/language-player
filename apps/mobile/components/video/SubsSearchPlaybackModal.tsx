import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Image, ScrollView, ActivityIndicator, useWindowDimensions, LayoutChangeEvent } from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import { Button, buttonTextClass } from '@/components/ui/button';
import * as Dialog from '@/components/ui/dialog';
import { useRouter } from 'expo-router';
import { useLanguage } from '@/contexts/LanguageContext';
import { useT } from '@/hooks/use-t';
import { useResponsive } from '@/hooks/use-responsive';
import { useActiveLineIndex } from '@/hooks/use-active-line-index';
import { log } from '@/lib/logger';
import { YouTubePlayer, type YouTubePlayerHandle } from '@/components/video/YouTubePlayer';
import { VideoControlBar } from '@/components/video/VideoControlBar';
import { SubtitleDisplay } from '@/components/video/SubtitleDisplay';
import { TranscriptQueuePanel } from '@/components/video/TranscriptQueuePanel';
import { SubsSearchRow, formatTime, youtubeThumbnail } from '@/components/video/SubsSearchRow';
import { X, Eye, Clock, Calendar, Play } from 'lucide-react-native';
import { ICON_MUTED } from '@/lib/theme-colors';
import type { SubtitleLine, SubsSearchVideo } from '@langplayer/shared';

/** Compact number label (e.g. "12K") with a plain fallback. */
function formatNumber(n: number | undefined, locale: string): string {
  if (!n) return '';
  try {
    return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
  } catch {
    return String(n);
  }
}

interface SubsSearchPlaybackModalProps {
  /** The queue of videos; the modal navigates prev/next through it. */
  videos: SubsSearchVideo[];
  /** Current video index, or null when closed. */
  index: number | null;
  /** Sets the current index; null closes the modal. */
  onIndexChange: (index: number | null) => void;
  /** Word forms to highlight in the subtitles (e.g. the search terms). */
  highlightTerms: string[];
  /** Never autoplay by default — videos are cued/paused at the match line. */
  autoplay?: boolean;
  /** Per-video subtitle-line provider (e.g. the full transcript once loaded).
   *  Defaults to the video's own subs_l2 range. */
  getLines?: (video: SubsSearchVideo) => SubtitleLine[];
  /** When provided, renders the "Load Full Subtitles" out-of-range notice. */
  onLoadFullSubtitles?: () => void;
  loadingFullSubs?: boolean;
  /** Auto-skip hook for embed failures (subs-search skips unavailable videos;
   *  the AI-examples modal omits it). */
  onVideoError?: (error: Error, info?: { messageKey: string; skippable: boolean }) => void;
}

/**
 * Shared subs-search-style playback modal — the mini player + controls +
 * subtitles surface opened by a subs-search result row and by the DeepSeek
 * "Examples from Videos" chips (web parity: same component, same behavior,
 * same modal). Rendered through the native Dialog portal so it always sizes
 * against the screen, even when the row lives inside the dictionary popup.
 *
 * Mirrors the watch page: singleline (line follower) | multiline (transcript |
 * queue | info tabs), wide screens show subtitles beside the player with the
 * video info below it, and the prev/next queue follows the passed `videos`
 * order.
 */
export function SubsSearchPlaybackModal({
  videos,
  index,
  onIndexChange,
  highlightTerms,
  autoplay = false,
  getLines,
  onLoadFullSubtitles,
  loadingFullSubs = false,
  onVideoError,
}: SubsSearchPlaybackModalProps) {
  const { l1Lang, l2Lang } = useLanguage();
  const t = useT();
  const router = useRouter();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const { isMd } = useResponsive();
  // Wide = landscape (width > height), matching the watch page's definition.
  // When wide + multiline, the modal shows subtitles beside the player and the
  // video info below it, like the watch page — inside the modal.
  const isWide = screenWidth > screenHeight;

  const currentVideo = index !== null ? (videos[index] ?? null) : null;

  const playerRef = useRef<YouTubePlayerHandle>(null);
  const [containerWidth, setContainerWidth] = useState(screenWidth);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [paused, setPaused] = useState(true);

  // Subtitle display mode: follow playback one line at a time (singleline), or
  // show the full transcript (multiline — transcript | queue | info tabs).
  // Mirrors the watch page's subtitles/transcript modes.
  const [subtitleMode, setSubtitleMode] = useState<'singleline' | 'multiline'>('singleline');

  const handleTimeUpdate = useCallback((time: number) => setCurrentTime(time), []);
  const handleDuration = useCallback((d: number) => setDuration(d), []);
  const handleStateChange = useCallback((state: string) => {
    setPaused(state !== 'playing');
  }, []);
  const toggleSubtitleMode = useCallback(() => {
    setSubtitleMode((m) => (m === 'singleline' ? 'multiline' : 'singleline'));
  }, []);

  const matchLine = currentVideo?.subs_l2[currentVideo.matchLineIndex] ?? null;
  // Show the search-match line immediately, even before the video plays.
  const defaultSubtitleLine = matchLine
    ? { starttime: matchLine.starttime, l2Line: matchLine.line, l1Line: '' }
    : undefined;

  // The subtitle lines the player uses: the provider's lines (e.g. the full
  // transcript once loaded), otherwise the limited range from the search.
  const playerSubLines = useMemo(() => {
    if (!currentVideo) return [] as SubtitleLine[];
    return getLines ? getLines(currentVideo) : currentVideo.subs_l2;
  }, [currentVideo, getLines]);

  // Covered interval of the available lines (chronological), for the
  // out-of-range detection. Durations: explicit duration → gap to the next
  // line → 5s fallback for the last line.
  const subsCoverage = useMemo(() => {
    if (playerSubLines.length === 0) return null;
    const sorted = [...playerSubLines].sort((a, b) => a.starttime - b.starttime);
    const first = sorted[0]!.starttime;
    let lastEnd = -Infinity;
    for (let i = 0; i < sorted.length; i++) {
      const l = sorted[i]!;
      const next = sorted[i + 1];
      const dur = l.duration ?? (next ? next.starttime - l.starttime : 5);
      lastEnd = Math.max(lastEnd, l.starttime + dur);
    }
    return { first, lastEnd };
  }, [playerSubLines]);

  const isOutOfRange =
    subsCoverage !== null &&
    (currentTime < subsCoverage.first - 0.3 || currentTime > subsCoverage.lastEnd);

  // Pause once when the playhead leaves the covered range (programmatic pause
  // is a no-op on iOS — the notice still appears).
  const wasInRangeRef = useRef(true);
  useEffect(() => {
    if (!isOutOfRange) {
      wasInRangeRef.current = true;
      return;
    }
    if (wasInRangeRef.current) {
      wasInRangeRef.current = false;
      log('[subsSearch] playhead left loaded subtitle range', {
        youtubeId: currentVideo?.youtube_id,
        currentTime,
        coverage: subsCoverage,
      });
      playerRef.current?.pause();
      setPaused(true);
    }
  }, [isOutOfRange, currentVideo?.youtube_id, currentTime, subsCoverage]);

  // Pre-parsed subtitle lines for SubtitleDisplay. Uses `playerSubLines` (the
  // full transcript once "Load Full Subtitles" runs, otherwise the limited
  // search range) so the loaded full subs flow straight into the display.
  const subtitleInitialLines = useMemo(
    () =>
      playerSubLines.map((l) => ({
        starttime: l.starttime,
        l2Line: l.line,
        l1Line: '',
      })) ?? [],
    [playerSubLines],
  );

  // Compute active line index from currentTime
  const subtitleStartTimes = useMemo(
    () => subtitleInitialLines.map((l) => l.starttime),
    [subtitleInitialLines],
  );
  const activeLineIndex = useActiveLineIndex(subtitleStartTimes, currentTime);

  const goToPreviousVideo = useCallback(() => {
    if (index !== null && index > 0) onIndexChange(index - 1);
  }, [index, onIndexChange]);

  const goToNextVideo = useCallback(() => {
    if (index !== null && index < videos.length - 1) onIndexChange(index + 1);
  }, [index, videos.length, onIndexChange]);

  const goToPreviousLine = useCallback(() => {
    if (!currentVideo) return;
    const subs = currentVideo.subs_l2;
    for (let i = subs.length - 1; i >= 0; i--) {
      if (subs[i]!.starttime < currentTime - 0.3) {
        playerRef.current?.seekTo(subs[i]!.starttime);
        return;
      }
    }
  }, [currentTime, currentVideo]);

  const goToNextLine = useCallback(() => {
    if (!currentVideo) return;
    const subs = currentVideo.subs_l2;
    for (let i = 0; i < subs.length; i++) {
      if (subs[i]!.starttime > currentTime + 0.3) {
        playerRef.current?.seekTo(subs[i]!.starttime);
        return;
      }
    }
  }, [currentTime, currentVideo]);

  const hasPreviousLine = useMemo(() => {
    if (!currentVideo) return false;
    return currentVideo.subs_l2.some((l) => l.starttime < currentTime - 0.3);
  }, [currentVideo, currentTime]);

  const hasNextLine = useMemo(() => {
    if (!currentVideo) return false;
    return currentVideo.subs_l2.some((l) => l.starttime > currentTime + 0.3);
  }, [currentVideo, currentTime]);

  // Lightweight current-video info (SubsSearchVideo has no likes/comments/
  // difficulty). Shown in the info tab (narrow) and below the player on wide
  // screens in multiline mode (watch-page layout).
  const videoInfoContent = currentVideo ? (
    <View className="gap-3">
      <Text className="text-base font-bold leading-tight text-foreground">
        {currentVideo.title}
      </Text>
      <View className="flex-row flex-wrap items-center gap-3">
        {currentVideo.views != null && (
          <View className="flex-row items-center gap-1">
            <Eye size={14} color={ICON_MUTED} />
            <Text className="text-xs text-muted-foreground">
              {t('label.views_count', { count: formatNumber(currentVideo.views, l1Lang.code) })}
            </Text>
          </View>
        )}
        {currentVideo.duration != null && (
          <View className="flex-row items-center gap-1">
            <Clock size={14} color={ICON_MUTED} />
            <Text className="text-xs text-muted-foreground">
              {formatTime(currentVideo.duration)}
            </Text>
          </View>
        )}
        {currentVideo.date && (
          <View className="flex-row items-center gap-1">
            <Calendar size={14} color={ICON_MUTED} />
            <Text className="text-xs text-muted-foreground">
              {new Date(currentVideo.date).toLocaleDateString(l1Lang.code)}
            </Text>
          </View>
        )}
      </View>
      <Button
        onPress={() => router.push(`/(tabs)/(media)/watch/${currentVideo.youtube_id}` as any)}
        variant="ghost"
        size="sm"
        className="mt-1 self-start"
        accessibilityRole="button"
      >
        <Play size={14} color={ICON_MUTED} />
        <Text className={buttonTextClass('ghost')}>{t('action.watch')}</Text>
      </Button>
    </View>
  ) : null;

  const content = currentVideo && index !== null ? (
    <View>
      {/* Header — video title + close */}
      <View className="flex-row items-center justify-between gap-2 border-b border-border px-4 py-3">
        <Text numberOfLines={1} className="min-w-0 flex-1 text-sm font-semibold text-foreground">
          {currentVideo.title}
        </Text>
        <Dialog.Close className="rounded-full bg-muted p-2">
          <X size={16} color={ICON_MUTED} />
        </Dialog.Close>
      </View>

      {/* Player + controls + subtitles — the player lives in a stable tree
          position (the first flex child), so toggling singleline/multiline or
          wide/narrow never remounts the YouTube iframe. On wide screens in
          multiline mode, subtitles sit beside the player and the video info
          sits below it, like the watch page — but inside the modal. */}
      <View className={isWide && subtitleMode === 'multiline' ? 'flex-row min-h-0' : 'min-h-0'}>
        {/* Column 1 — player + controls (+ info below on wide multiline) */}
        <View className={isWide && subtitleMode === 'multiline' ? 'min-w-0 flex-1' : ''}>
          {/* Mini player */}
          <View
            className="w-full bg-black"
            style={{ aspectRatio: 16 / 9 }}
            onLayout={(e: LayoutChangeEvent) => setContainerWidth(e.nativeEvent.layout.width)}
          >
            <YouTubePlayer
              ref={playerRef}
              youtubeId={currentVideo.youtube_id}
              onTimeUpdate={handleTimeUpdate}
              onDuration={handleDuration}
              onStateChange={handleStateChange}
              onError={onVideoError}
              autoplay={autoplay}
              startTime={matchLine?.starttime}
              containerWidth={containerWidth}
            />
          </View>

          {/* Controls — centered; result count between prev/next line buttons;
              the panel toggle flips singleline ↔ multiline. */}
          <View className="flex-row justify-center border-b border-border py-1">
            <VideoControlBar
              reduced
              playerRef={playerRef}
              currentTime={currentTime}
              duration={duration}
              paused={paused}
              onPauseToggle={() => {}}
              onPreviousLine={goToPreviousLine}
              onNextLine={goToNextLine}
              onPreviousVideo={goToPreviousVideo}
              onNextVideo={goToNextVideo}
              onTogglePanel={toggleSubtitleMode}
              panelOpen={subtitleMode === 'multiline'}
              hasPreviousLine={hasPreviousLine}
              hasNextLine={hasNextLine}
              hasPreviousVideo={index > 0}
              hasNextVideo={index < videos.length - 1}
              videoCountText={t('msg.video_n_of_total', {
                n: index + 1,
                total: videos.length,
              })}
            />
          </View>

          {/* Video info below the player on wide multiline (watch page) */}
          {isWide && subtitleMode === 'multiline' && (
            <View className="px-4 py-3">{videoInfoContent}</View>
          )}

          {/* Out-of-range notice — the playhead left the loaded subtitle
              range (shown in both singleline and multiline modes). */}
          {isOutOfRange && onLoadFullSubtitles && (
            <View className="flex-row items-center justify-between gap-2 border-b border-border bg-amber-50 px-3 py-2 dark:bg-amber-950">
              <Text className="flex-1 text-xs text-amber-700 dark:text-amber-300">
                {t('msg.subs_out_of_range')}
              </Text>
              <Button
                onPress={onLoadFullSubtitles}
                disabled={loadingFullSubs}
                variant="default"
                size="sm"
                className="shrink-0"
                accessibilityRole="button"
              >
                <Text className={buttonTextClass('default')}>
                  {loadingFullSubs ? t('msg.loading') : t('action.load_full_subtitles')}
                </Text>
              </Button>
            </View>
          )}
        </View>

        {/* Column 2 — subtitles: singleline line-follower, or multiline
            tabbed sidebar (transcript | queue | info). On wide multiline the
            info tab is dropped (info lives below the player). Remount on mode
            change so the sidebar starts on the transcript tab, like the watch
            page's sidebar remount. */}
        <View
          className={
            isWide && subtitleMode === 'multiline'
              ? 'min-h-0 w-[320px] border-l border-border'
              : 'min-h-0 flex-1'
          }
        >
          {subtitleMode === 'singleline' ? (
            // Padding around the single-line subtitle so the text never
            // touches the modal's edge; text renders at 1× the user zoom
            // (singleline elsewhere keeps the 1.33× band scale).
            <View className="min-h-32 w-full px-4 py-3">
              <SubtitleDisplay
                singleLine
                singlelineTextScale={1}
                lines={subtitleInitialLines}
                activeLineIndex={activeLineIndex}
                currentTime={currentTime}
                highlightTerms={highlightTerms}
                defaultLine={defaultSubtitleLine}
                onSeekToLine={(t) => playerRef.current?.seekTo(t)}
              />
            </View>
          ) : (
            <View
              style={
                isWide && subtitleMode === 'multiline'
                  ? undefined
                  : { height: Math.min(screenHeight * 0.4, 320) }
              }
              className={isWide && subtitleMode === 'multiline' ? 'flex-1' : ''}
            >
              <TranscriptQueuePanel
                key={subtitleMode}
                transcript={
                  <SubtitleDisplay
                    lines={subtitleInitialLines}
                    activeLineIndex={activeLineIndex}
                    currentTime={currentTime}
                    highlightTerms={highlightTerms}
                    defaultLine={defaultSubtitleLine}
                    onSeekToLine={(t) => playerRef.current?.seekTo(t)}
                  />
                }
                queue={
                  <ScrollView className="flex-1">
                    {videos.map((v, i) => {
                      const ml = v.subs_l2[v.matchLineIndex];
                      const isActive = i === index;
                      return (
                        <Pressable
                          key={v.id}
                          onPress={() => onIndexChange(i)}
                          className={`mb-1.5 flex-row items-center gap-2 rounded-lg p-1.5 ${isActive ? 'bg-primary/5' : ''}`}
                        >
                          <View className="h-9 w-16 overflow-hidden rounded bg-muted">
                            <Image
                              source={{ uri: youtubeThumbnail(v.youtube_id) }}
                              className="h-full w-full"
                              resizeMode="cover"
                            />
                          </View>
                          <View className="min-w-0 flex-1">
                            <Text className="text-xs font-medium text-foreground" numberOfLines={1}>
                              {v.title}
                            </Text>
                            <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                              {ml?.line}
                            </Text>
                          </View>
                          {ml && (
                            <Text className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                              {formatTime(ml.starttime)}
                            </Text>
                          )}
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                }
                info={isWide && subtitleMode === 'multiline' ? undefined : videoInfoContent}
              />
            </View>
          )}
        </View>
      </View>
    </View>
  ) : null;

  return (
    <Dialog.Root open={index !== null} onOpenChange={(v) => { if (!v) onIndexChange(null); }}>
      <Dialog.Portal>
        {isMd ? (
          // pointerEvents="auto": explicit so this dialog stays interactive
          // when opened from inside another dialog (e.g. the dictionary popup
          // bottom sheet) — the popup's sheet must never swallow touches.
          <View pointerEvents="auto" className="absolute inset-0 items-center justify-center px-4">
            <View
              className={`w-full overflow-hidden rounded-xl border border-border bg-background ${
                isWide && subtitleMode === 'multiline' ? 'max-w-4xl' : 'max-w-2xl'
              }`}
              style={{
                // Inline shadow — see NavBar workaround for the css-interop crash.
                shadowColor: ICON_MUTED,
                shadowOpacity: 0.3,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 4 },
                elevation: 8,
              }}
            >
              {content}
            </View>
          </View>
        ) : (
          <Dialog.SheetContent className="max-h-[90%]">
            {content}
          </Dialog.SheetContent>
        )}
      </Dialog.Portal>
    </Dialog.Root>
  );
}
