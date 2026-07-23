'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/providers/language-provider';
import { useT } from '@/hooks/use-t';
import { baseCode } from '@/lib/language-data';
import { PYTHON_API_URL } from '@/lib/api-url';
import { youtubeThumbnail } from '@/lib/video-service';
import { YouTubePlayer, type YouTubePlayerHandle, PLAYER_STATES } from './youtube-player';
import { SubtitleDisplay } from './subtitle-display';
import { Button } from '@/components/ui/button';
import type { SubsSearchVideo } from '@langplayer/shared';
import { parseSubsL2, findMatchLine } from '@langplayer/utils';
import {
  Loader2,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ChevronUp,
  ChevronDown,
  List,
  X,
  Search,
} from 'lucide-react';

// ── Types ──────────────────────────────────────

interface SubsSearchResultsProps {
  term: string;
  /** When true, removes outer card styling so the component fills its parent container. */
  embedded?: boolean;
  /** When true, search only the exact head form. Default: false (fuzzy, all forms). */
  exactMatch?: boolean;
  /** Called when the exact-match toggle is clicked. */
  onExactToggle?: (exact: boolean) => void;
  /** Number of distinct forms being searched. 0 or undefined hides the indicator. */
  formCount?: number;
}

type SortKey = 'views' | 'likes' | 'date' | 'length' | 'leftContext' | 'rightContext';

// ── Helpers ────────────────────────────────────

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function HighlightLine({ line, term }: { line: string; term: string }) {
  const lowerLine = line.toLowerCase();
  const lowerTerm = term.toLowerCase();
  const idx = lowerLine.indexOf(lowerTerm);
  if (idx === -1) return <span>{line}</span>;

  return (
    <span>
      {line.substring(0, idx)}
      <mark className="rounded-sm bg-yellow-200 px-0.5 dark:bg-yellow-800">
        {line.substring(idx, idx + term.length)}
      </mark>
      {line.substring(idx + term.length)}
    </span>
  );
}

// ── Main Component ─────────────────────────────

export function SubsSearchResults({ term, embedded = false, exactMatch = false, onExactToggle, formCount = 0 }: SubsSearchResultsProps) {
  const { l1, l2 } = useLanguage();
  const t = useT();
  const playerRef = useRef<YouTubePlayerHandle>(null);

  const [videos, setVideos] = useState<SubsSearchVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Player state
  const [currentIndex, setCurrentIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  // Modal state
  const [listOpen, setListOpen] = useState(false);
  const [listSearch, setListSearch] = useState('');
  const [listSort, setListSort] = useState<SortKey>('views');

  const currentVideo = videos[currentIndex] ?? null;
  const matchLine = currentVideo?.subs_l2[currentVideo.matchLineIndex] ?? null;

  // Split comma-separated search terms for highlighting
  const highlightTerms = useMemo(
    () => term.split(',').map((t) => t.trim()).filter(Boolean),
    [term],
  );

  // Memoize initialLines for SubtitleDisplay so it doesn't re-trigger on every render
  const subtitleInitialLines = useMemo(
    () =>
      currentVideo?.subs_l2.map((l) => ({
        starttime: l.starttime,
        l1Line: '',
        l2Line: l.line,
      })) ?? [],
    [currentVideo?.id, currentVideo?.subs_l2],
  );

  // ── Fetch ────────────────────────────────────

  useEffect(() => {
    if (!term) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(
      `${PYTHON_API_URL}/subs-search?terms=${encodeURIComponent(term)}&l2=${baseCode(l2.code)}&limit=500&context=3`,
    )
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: any[]) => {
        if (cancelled) return;
        const searchForms = term.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
        const parsed: SubsSearchVideo[] = (Array.isArray(data) ? data : [])
          .map((v: any) => {
            const lines = parseSubsL2(v.subs_l2 ?? '');
            return {
              id: v.id,
              title: v.title ?? t('label.untitled_video'),
              youtube_id: v.youtube_id,
              subs_l2: lines,
              views: v.views,
              duration: v.duration,
              date: v.date,
              matchLineIndex: findMatchLine(lines, term),
            };
          })
          .filter((v) =>
            // Only keep videos where at least one subtitle line actually
            // contains one of the inflected/script-variant search forms
            v.subs_l2.some((l) =>
              searchForms.some((f) => l.line.toLowerCase().includes(f)),
            ),
          );
        setVideos(parsed);
        setCurrentIndex(0);
        setLoading(false);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.message ?? t('error.subs_search_failed'));
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [term, l2.code]);

  // ── Seek to match when video changes ─────────

  useEffect(() => {
    if (currentVideo && playerRef.current) {
      const matchTime = matchLine?.starttime ?? 0;
      const timer = setTimeout(() => {
        playerRef.current?.seekTo(matchTime);
        playerRef.current?.play();
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [currentIndex, currentVideo?.youtube_id]);

  // ── Player callbacks ─────────────────────────

  const handleTimeUpdate = useCallback((time: number) => setCurrentTime(time), []);

  const handleStateChange = useCallback((state: number) => {
    setPaused(state === PLAYER_STATES.PAUSED || state === PLAYER_STATES.ENDED);
  }, []);

  const handlePlayPause = useCallback(() => {
    if (paused) {
      playerRef.current?.play();
      setPaused(false);
    } else {
      playerRef.current?.pause();
      setPaused(true);
    }
  }, [paused]);

  const goToPrevious = useCallback(() => {
    if (currentIndex > 0) setCurrentIndex((i) => i - 1);
  }, [currentIndex]);

  const goToNext = useCallback(() => {
    if (currentIndex < videos.length - 1) setCurrentIndex((i) => i + 1);
  }, [currentIndex, videos.length]);

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

  // ── Modal: filter + sort ─────────────────────

  const filteredVideos = (() => {
    let result = [...videos];
    if (listSearch.trim()) {
      const q = listSearch.toLowerCase();
      result = result.filter(
        (v) =>
          v.title.toLowerCase().includes(q) ||
          v.subs_l2.some((l) => l.line.toLowerCase().includes(q)),
      );
    }

    const getMatchLine = (v: SubsSearchVideo) => v.subs_l2[v.matchLineIndex];

    result.sort((a, b) => {
      switch (listSort) {
        case 'likes':
          return (b.views ?? 0) - (a.views ?? 0);
        case 'date':
          return (
            new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime()
          );
        case 'length': {
          const la = getMatchLine(a)?.line.length ?? 0;
          const lb = getMatchLine(b)?.line.length ?? 0;
          return la - lb;
        }
        case 'leftContext': {
          const la =
            a.subs_l2[a.matchLineIndex]?.line
              .toLowerCase()
              .indexOf(term.toLowerCase()) ?? -1;
          const lb =
            b.subs_l2[b.matchLineIndex]?.line
              .toLowerCase()
              .indexOf(term.toLowerCase()) ?? -1;
          const ca =
            la > 0
              ? (a.subs_l2[a.matchLineIndex]!.line[la - 1] ?? '')
              : '';
          const cb =
            lb > 0
              ? (b.subs_l2[b.matchLineIndex]!.line[lb - 1] ?? '')
              : '';
          return ca.localeCompare(cb);
        }
        case 'rightContext': {
          const la =
            a.subs_l2[a.matchLineIndex]?.line
              .toLowerCase()
              .indexOf(term.toLowerCase()) ?? -1;
          const lb =
            b.subs_l2[b.matchLineIndex]?.line
              .toLowerCase()
              .indexOf(term.toLowerCase()) ?? -1;
          const ca =
            la >= 0 &&
            la + term.length <
              (a.subs_l2[a.matchLineIndex]?.line.length ?? 0)
              ? (a.subs_l2[a.matchLineIndex]!.line[la + term.length] ?? '')
              : '';
          const cb =
            lb >= 0 &&
            lb + term.length <
              (b.subs_l2[b.matchLineIndex]?.line.length ?? 0)
              ? (b.subs_l2[b.matchLineIndex]!.line[lb + term.length] ?? '')
              : '';
          return ca.localeCompare(cb);
        }
        case 'views':
        default:
          return (b.views ?? 0) - (a.views ?? 0);
      }
    });
    return result;
  })();

  const selectFromList = useCallback(
    (idx: number) => {
      const realIdx = videos.indexOf(filteredVideos[idx]!);
      if (realIdx >= 0) {
        setCurrentIndex(realIdx);
        setListOpen(false);
      }
    },
    [videos, filteredVideos],
  );

  // ── Loading / Error / Empty ──────────────────

  if (loading) {
    return (
      <div className={embedded ? '' : 'rounded-xl border border-border bg-card shadow-sm overflow-hidden'}>
        {/* Nav bar skeleton */}
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <div className="h-3.5 w-24 animate-pulse rounded bg-muted" />
          <div className="flex items-center gap-1">
            <div className="h-6 w-16 animate-pulse rounded-full bg-muted" />
            <div className="h-8 w-20 animate-pulse rounded-md bg-muted" />
          </div>
        </div>
        {/* Player skeleton */}
        <div className="aspect-video w-full bg-black/80 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-white/40" />
        </div>
        {/* Subtitle skeleton */}
        <div className="min-h-[5rem] px-6 py-4 flex flex-col items-center justify-center gap-2">
          <div className="h-5 w-3/4 animate-pulse rounded bg-muted" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-muted/50" />
        </div>
        {/* Controls skeleton */}
        <div className="flex items-center justify-center gap-1 border-t border-border px-2 py-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-8 w-8 animate-pulse rounded bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <p className="py-4 text-sm text-muted-foreground">{error}</p>
    );
  }

  if (videos.length === 0) {
    return (
      <p className="py-4 text-sm text-muted-foreground">
        {t('msg.no_results')}
      </p>
    );
  }

  // ── Render ───────────────────────────────────

  return (
    <div className={embedded ? '' : 'rounded-xl border border-border bg-card shadow-sm overflow-hidden'}>
      {/* ── Nav bar (above video) ── */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <span className="text-xs text-muted-foreground">
          {t('msg.video_n_of_total', { n: currentIndex + 1, total: videos.length })}
        </span>
        <div className="flex items-center gap-1">
          {/* Exact-match toggle — only visible when formCount > 1 */}
          {formCount > 1 && (
            <button
              onClick={() => onExactToggle?.(!exactMatch)}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                exactMatch
                  ? 'bg-primary/10 text-primary'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
              title={
                exactMatch
                  ? `Searching only "${term}" — click to search ${formCount} forms`
                  : `Searching ${formCount} forms — click for exact match only`
              }
            >
              {exactMatch ? term : `${formCount} forms`}
            </button>
          )}
          {currentVideo && (
            <Link
              href={`/${l1.code}/${l2.code}/watch/${currentVideo.youtube_id}`}
              className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <Play className="h-3.5 w-3.5" />
              Watch
            </Link>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1 text-xs"
            onClick={() => setListOpen(true)}
          >
            <List className="h-3.5 w-3.5" />
            List All
          </Button>
        </div>
      </div>

      {/* ── Mini player ── */}
      <div className="aspect-video w-full bg-black">
        {currentVideo && (
          <YouTubePlayer
            ref={playerRef}
            youtubeId={currentVideo.youtube_id}
            autoplay
            onTimeUpdate={handleTimeUpdate}
            onStateChange={handleStateChange}
          />
        )}
      </div>

      {/* ── Controls ── */}
      <div className="flex items-center justify-center gap-1 border-b border-border px-2 py-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={goToPrevious}
          disabled={currentIndex <= 0}
          title="Previous video (Shift + ←)"
        >
          <SkipBack className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={goToPreviousLine}
          title="Previous line (←)"
        >
          <ChevronUp className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9"
          onClick={handlePlayPause}
        >
          {paused ? (
            <Play className="h-4 w-4" />
          ) : (
            <Pause className="h-4 w-4" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={goToNextLine}
          title="Next line (→)"
        >
          <ChevronDown className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={goToNext}
          disabled={currentIndex >= videos.length - 1}
          title="Next video (Shift + →)"
        >
          <SkipForward className="h-4 w-4" />
        </Button>
      </div>

      {/* ── Single-line subtitle display (follows playback) ── */}
      <SubtitleDisplay
        mode="singleline"
        youtubeId={currentVideo?.youtube_id}
        currentTime={currentTime}
        videoTitle={currentVideo?.title}
        initialLines={subtitleInitialLines}
        highlightTerms={highlightTerms}
      />

      {/* ── Modal: result list ── */}
      {listOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          onClick={() => setListOpen(false)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50" />
          {/* Sheet */}
          <div
            className="relative z-10 flex max-h-[80vh] w-full max-w-2xl flex-col rounded-t-2xl border border-border bg-background shadow-xl sm:m-4 sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h3 className="text-sm font-semibold">
                Videos matching "{term}"
              </h3>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setListOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Toolbar */}
            <div className="flex items-center gap-2 border-b border-border px-4 py-2">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={listSearch}
                  onChange={(e) => setListSearch(e.target.value)}
                  placeholder={t('placeholder.filter')}
                  className="h-8 w-full rounded-md border border-border bg-muted/50 pl-7 pr-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <select
                value={listSort}
                onChange={(e) => setListSort(e.target.value as SortKey)}
                className="h-8 rounded-md border border-border bg-muted/50 px-2 text-xs focus:outline-none"
              >
                <option value="views">{t('sort.most_viewed')}</option>
                <option value="likes">{t('title.likes')}</option>
                <option value="date">{t('title.date')}</option>
                <option value="length">{t('title.length')}</option>
                <option value="leftContext">{t('title.leftContext')}</option>
                <option value="rightContext">{t('title.rightContext')}</option>
              </select>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-2">
              {filteredVideos.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground">
                  {t('msg.no_results')}
                </p>
              ) : (
                <div className="space-y-1">
                  {filteredVideos.map((video, i) => {
                    const ml = video.subs_l2[video.matchLineIndex];
                    const isActive = videos.indexOf(video) === currentIndex;
                    return (
                      <button
                        key={`${video.id}`}
                        onClick={() => selectFromList(i)}
                        className={`flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted/50 ${
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

                        {/* Info */}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium">
                            {video.title}
                          </p>
                          <div className="mt-0.5 space-y-0.5">
                            {video.matchLineIndex > 0 && (
                              <p className="line-clamp-1 text-[11px] text-muted-foreground/50">
                                {
                                  video.subs_l2[video.matchLineIndex - 1]
                                    ?.line
                                }
                              </p>
                            )}
                            {ml && (
                              <p className="line-clamp-2 text-xs">
                                <HighlightLine
                                  line={ml.line}
                                  term={term}
                                />
                              </p>
                            )}
                            {video.matchLineIndex <
                              video.subs_l2.length - 1 && (
                              <p className="line-clamp-1 text-[11px] text-muted-foreground/50">
                                {
                                  video.subs_l2[video.matchLineIndex + 1]
                                    ?.line
                                }
                              </p>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
