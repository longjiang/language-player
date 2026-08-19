'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useLanguage } from '@/providers/language-provider';
import { useT } from '@/hooks/use-t';
import { Button } from '@/components/ui/button';
import { formatTime } from '@/components/video/subs-search-row';
import { YouTubePlayer, type YouTubePlayerHandle, PLAYER_STATES, type YouTubePlayerErrorInfo } from '@/components/video/youtube-player';
import { VideoControlBar } from '@/components/video/video-control-bar';
import { SubtitleDisplay } from '@/components/video/subtitle-display';
import { VideoSidebarPanel, type SidebarTabKey } from '@/components/video/video-sidebar-panel';
import { X, FileText, Info, Eye, Clock, Calendar, Play } from 'lucide-react';
import type { SubtitleLine, SubsSearchVideo } from '@langplayer/shared';

/** Compact number label (e.g. "12K") with a plain fallback. */
function formatNumber(n: number | undefined, locale: string): string {
  if (!n) return '';
  return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
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
  /** When provided, the singleline/multiline choice persists to this
   *  localStorage key (subs-search only). */
  persistModeKey?: string;
  /** Auto-skip hook for embed failures (subs-search skips unavailable videos;
   *  the AI-examples modal omits it). */
  onVideoError?: (error: Error, info?: YouTubePlayerErrorInfo) => void;
}

/**
 * Shared subs-search-style playback modal — the mini player + controls +
 * subtitles surface opened by a subs-search result row and by the DeepSeek
 * "Examples from Videos" chips. Rendered through a portal to document.body so
 * it always sizes against the viewport, even when the row lives inside a
 * transformed container (e.g. the dictionary popup dialog, whose centering
 * transform would otherwise trap a `position: fixed` child at the popup's
 * width — SPEC-082 parity).
 *
 * Mirrors the watch page: singleline (line follower) | multiline (tabbed subs
 * sidebar), wide screens show subtitles beside the player with the video info
 * below it, and the prev/next queue follows the passed `videos` order.
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
  persistModeKey,
  onVideoError,
}: SubsSearchPlaybackModalProps) {
  const { l1, l2 } = useLanguage();
  const t = useT();

  const currentVideo = index !== null ? (videos[index] ?? null) : null;

  const playerRef = useRef<YouTubePlayerHandle>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [paused, setPaused] = useState(true);

  // Wide = landscape (width > height), matching the watch page's definition.
  // When wide + multiline, the modal shows subtitles on the side and the video
  // info below the player, like the watch page — inside the modal.
  const [isWide, setIsWide] = useState(false);
  useEffect(() => {
    const check = () => setIsWide(window.innerWidth > window.innerHeight);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Subtitle display mode in the modal: follow playback one line at a time
  // (singleline), or show the full transcript (multiline — tabbed subs | info
  // sidebar). Mirrors the watch page's subtitles/transcript modes. When
  // `persistModeKey` is set, the choice persists in localStorage (client-only):
  // read after mount to avoid a hydration mismatch, written on every toggle.
  const [subtitleMode, setSubtitleMode] = useState<'singleline' | 'multiline'>('singleline');
  const [panelTab, setPanelTab] = useState<SidebarTabKey>('subs');
  const sidebarContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!persistModeKey) return;
    try {
      const saved = window.localStorage.getItem(persistModeKey);
      if (saved === 'singleline' || saved === 'multiline') setSubtitleMode(saved);
    } catch {
      /* localStorage unavailable (private mode etc.) — keep default */
    }
  }, [persistModeKey]);

  const handleToggleSubtitleMode = useCallback(() => {
    setSubtitleMode((m) => {
      const next = m === 'singleline' ? 'multiline' : 'singleline';
      if (persistModeKey) {
        try {
          window.localStorage.setItem(persistModeKey, next);
        } catch {
          /* localStorage unavailable — mode still applies for this session */
        }
      }
      return next;
    });
    // Mirror the watch page: reopening the sidebar (multiline) starts on the
    // subs tab, like the watch page's sidebar remount.
    setPanelTab('subs');
  }, [persistModeKey]);

  const handleTimeUpdate = useCallback((time: number) => setCurrentTime(time), []);
  const handleDuration = useCallback((d: number) => setDuration(d), []);
  const handleStateChange = useCallback((state: number) => {
    setPaused(state === PLAYER_STATES.PAUSED || state === PLAYER_STATES.ENDED);
  }, []);

  const currentMatchLine = currentVideo?.subs_l2[currentVideo.matchLineIndex] ?? null;
  // Show the search-match line immediately, even before the video plays.
  const defaultSubtitleLine = currentMatchLine
    ? { starttime: currentMatchLine.starttime, line: currentMatchLine.line }
    : undefined;

  // The subtitle lines the player uses: the provider's lines (e.g. the full
  // transcript once loaded), otherwise the limited range that came with the
  // search.
  const playerSubLines = useMemo(() => {
    if (!currentVideo) return [] as SubtitleLine[];
    return getLines ? getLines(currentVideo) : currentVideo.subs_l2;
  }, [currentVideo, getLines]);

  // Memoize initialLines for SubtitleDisplay so it doesn't re-trigger on every
  // render. Uses `playerSubLines` so "Load Full Subtitles" flows straight into
  // the subtitle display.
  const subtitleInitialLines = useMemo(() => {
    const lines = playerSubLines.map((l) => ({
      starttime: l.starttime,
      l1Line: '',
      l2Line: l.line,
    }));
    // Sort by starttime ascending — SubtitleDisplay's activeIndex logic
    // iterates sequentially and breaks on the first line > currentTime,
    // so lines MUST be in chronological order.
    lines.sort((a, b) => a.starttime - b.starttime);
    return lines;
  }, [playerSubLines]);

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

  // Pause once when the playhead leaves the covered range.
  const wasInRangeRef = useRef(true);
  useEffect(() => {
    if (!isOutOfRange) {
      wasInRangeRef.current = true;
      return;
    }
    if (wasInRangeRef.current) {
      wasInRangeRef.current = false;
      playerRef.current?.pause();
      setPaused(true);
    }
  }, [isOutOfRange, currentTime, subsCoverage]);

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

  // Lightweight current-video info (SubsSearchVideo has no
  // likes/comments/difficulty, so a full VideoMeta isn't possible). Shown in
  // the info tab (narrow) and below the player on wide screens in multiline
  // mode (watch-page layout).
  const videoInfoContent = currentVideo ? (
    <div className="space-y-3">
      <h2 className="text-base font-bold leading-tight">{currentVideo.title}</h2>
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        {currentVideo.views != null && (
          <span className="flex items-center gap-1">
            <Eye className="h-4 w-4" />
            {t('label.views_count', { count: formatNumber(currentVideo.views, l1.code) })}
          </span>
        )}
        {currentVideo.duration != null && (
          <span className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            {formatTime(currentVideo.duration)}
          </span>
        )}
        {currentVideo.date && (
          <span className="flex items-center gap-1">
            <Calendar className="h-4 w-4" />
            {new Date(currentVideo.date).toLocaleDateString(l1.code)}
          </span>
        )}
      </div>
      <Link
        href={`/${l1.code}/${l2.code}/watch/${currentVideo.youtube_id}`}
        className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-primary hover:bg-muted transition-colors"
      >
        <Play className="h-3.5 w-3.5" />
        {t('action.watch')}
      </Link>
    </div>
  ) : null;

  const modal =
    currentVideo && index !== null ? (
      <div
        // pointer-events-auto: while a Radix modal dialog (e.g. the dictionary
        // popup) is open, react-remove-scroll (used by Radix's scroll lock)
        // puts `pointer-events: none` on <body> and only re-enables events on
        // the dialog content itself. This modal portals to document.body, so
        // without explicitly re-enabling pointer events here it would render
        // on top but be click-transparent — clicks would pass through it to
        // the popup behind.
        className="pointer-events-auto fixed inset-0 z-50 flex items-end justify-center sm:items-center"
        onClick={() => onIndexChange(null)}
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/50" />
        {/* Sheet — width matches the SRS review page's content (max-w-2xl);
            wider on wide screens in multiline mode so the side-by-side
            player + subtitles layout fits. */}
        <div
          className={`relative z-10 flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-border bg-background shadow-xl sm:m-4 sm:rounded-2xl ${
            subtitleMode === 'multiline' && isWide ? 'sm:max-w-5xl' : ''
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header — video title + close */}
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <h3 className="min-w-0 truncate text-sm font-semibold">{currentVideo.title}</h3>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 flex-shrink-0"
              onClick={() => onIndexChange(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Player + controls + subtitles — the player lives in a stable
              tree position (the first grid/flex child), so toggling
              singleline/multiline or wide/narrow never remounts the YouTube
              iframe. On wide screens in multiline mode, subtitles sit beside
              the player and the video info sits below it, like the watch
              page — but inside the modal. */}
          <div
            className={
              subtitleMode === 'multiline' && isWide
                ? 'grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_320px]'
                : 'flex min-h-0 flex-1 flex-col'
            }
          >
            {/* Column 1 — player + controls (+ info below on wide multiline) */}
            <div
              className={
                subtitleMode === 'multiline' && isWide
                  ? 'min-w-0 overflow-y-auto border-r border-border'
                  : 'shrink-0'
              }
            >
              {/* Mini player */}
              <div className="aspect-video w-full bg-black">
                <YouTubePlayer
                  ref={playerRef}
                  youtubeId={currentVideo.youtube_id}
                  autoplay={autoplay}
                  startTime={currentMatchLine?.starttime}
                  onTimeUpdate={handleTimeUpdate}
                  onDuration={handleDuration}
                  onStateChange={handleStateChange}
                  onError={onVideoError}
                />
              </div>

              {/* Controls */}
              <div className="flex items-center justify-center border-b border-border px-2 py-1">
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
                  onTogglePanel={handleToggleSubtitleMode}
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
              </div>

              {/* Out-of-range notice — the playhead left the loaded subtitle
                  range (shown in both singleline and multiline modes). */}
              {isOutOfRange && onLoadFullSubtitles && (
                <div className="flex items-center justify-between gap-2 border-b border-border bg-amber-50 px-3 py-2 dark:bg-amber-950">
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    {t('msg.subs_out_of_range')}
                  </p>
                  <Button
                    size="sm"
                    className="shrink-0"
                    onClick={onLoadFullSubtitles}
                    disabled={loadingFullSubs}
                  >
                    {loadingFullSubs ? t('msg.loading') : t('action.load_full_subtitles')}
                  </Button>
                </div>
              )}

              {/* Video info below the player on wide multiline (watch page) —
                  padded (the controls row above already provides the divider). */}
              {subtitleMode === 'multiline' && isWide && (
                <div className="px-4 py-3">{videoInfoContent}</div>
              )}
            </div>

            {/* Column 2 — subtitles: singleline line-follower, or multiline
                tabbed sidebar (subs | info). On wide multiline the info tab
                is dropped (info lives below the player) and the sidebar is
                the subs transcript. */}
            <div
              className={
                subtitleMode === 'multiline' && isWide
                  ? 'min-h-0 min-w-0'
                  : 'min-h-0 flex-1'
              }
            >
              {subtitleMode === 'singleline' ? (
                // Padding around the single-line subtitle so the text never
                // touches the modal's edge; text renders at 1× the user zoom
                // (singleline elsewhere keeps the 1.33× band scale).
                <div className="h-full min-h-0 overflow-y-auto px-4 py-3">
                  <SubtitleDisplay
                    mode="singleline"
                    singlelineTextScale={1}
                    youtubeId={currentVideo.youtube_id}
                    currentTime={currentTime}
                    videoTitle={currentVideo.title}
                    initialLines={subtitleInitialLines}
                    highlightTerms={highlightTerms}
                    defaultLine={defaultSubtitleLine}
                    onSeekToLine={(t) => playerRef.current?.seekTo(t)}
                  />
                </div>
              ) : (
                <VideoSidebarPanel
                  tabs={
                    subtitleMode === 'multiline' && isWide
                      ? [
                          { key: 'subs', label: t('label.subtitles'), icon: <FileText className="h-4 w-4" /> },
                        ]
                      : [
                          { key: 'subs', label: t('label.subtitles'), icon: <FileText className="h-4 w-4" /> },
                          { key: 'info', label: t('title.info'), icon: <Info className="h-4 w-4" /> },
                        ]
                  }
                  activeTab={panelTab}
                  onTabChange={setPanelTab}
                  contentRef={sidebarContentRef}
                  className="h-full min-h-0"
                >
                  {(tab) => {
                    if (tab === 'subs') {
                      return (
                        <SubtitleDisplay
                          mode="multiline"
                          youtubeId={currentVideo.youtube_id}
                          currentTime={currentTime}
                          videoTitle={currentVideo.title}
                          initialLines={subtitleInitialLines}
                          highlightTerms={highlightTerms}
                          defaultLine={defaultSubtitleLine}
                          scrollContainerRef={sidebarContentRef}
                          onSeekToLine={(t) => playerRef.current?.seekTo(t)}
                        />
                      );
                    }
                    return videoInfoContent;
                  }}
                </VideoSidebarPanel>
              )}
            </div>
          </div>
        </div>
      </div>
    ) : null;

  if (!modal) return null;
  // Portal to the body so a transformed ancestor (e.g. the dictionary popup's
  // centering transform) can't constrain the fixed overlay to its own box.
  return createPortal(modal, document.body);
}
