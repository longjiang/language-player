'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/providers/language-provider';
import { useSettingsContext } from '@/providers/settings-provider';
import { useSubscriptionContext } from '@/providers/subscription-provider';
import { useT } from '@/hooks/use-t';
import { useSubtitleTranslation } from '@/hooks/use-subtitle-translation';
import { baseCode } from '@/lib/language-data';
import { PYTHON_API_URL } from '@/lib/api-url';
import { log } from '@/lib/logger';
import {
  YouTubePlayer,
  type YouTubePlayerHandle,
  type YouTubePlayerErrorInfo,
  PLAYER_STATES,
} from './youtube-player';
import { SubtitleDisplay } from './subtitle-display';
import { VideoSidebarPanel, type SidebarTabKey } from './video-sidebar-panel';
import { VideoQueuePanel } from './video-queue-panel';
import { Button } from '@/components/ui/button';
import { VideoControlBar } from './video-control-bar';
import { SubsSearchRow, formatTime } from './subs-search-row';
import type { SubtitleLine, SubsSearchVideo } from '@langplayer/shared';
import { parseSubsL2, findMatchLine } from '@langplayer/utils';
import {
  Play,
  X,
  Search,
  Eye,
  Clock,
  Calendar,
  FileText,
  Info,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';

// ── Types ──────────────────────────────────────

interface SubsSearchResultsProps {
  term: string;
  /** The dictionary head form — shown as the "exact form" pill label. */
  headTerm?: string;
  /** When true, removes outer card styling so the component fills its parent container. */
  embedded?: boolean;
  /** When true, search only the exact head form. Default: false (fuzzy, all forms). */
  exactMatch?: boolean;
  /** Called when the exact-match toggle is clicked. */
  onExactToggle?: (exact: boolean) => void;
  /** Number of distinct forms being searched. 0 or undefined hides the indicator. */
  formCount?: number;
}

/** ADR-0034: free users see the first 5 subs-search hits. */
const FREE_SUBS_SEARCH_HITS = 5;

/** Persisted subtitle display mode for the playback modal. Stored in
 *  localStorage only — deliberately no API sync (matches the flipped
 *  list → modal design: the mode is a per-device UI preference). */
const SUBTITLE_MODE_KEY = 'lp_subs_search_subtitle_mode';

type SortKey = 'views' | 'likes' | 'date' | 'length' | 'leftContext' | 'rightContext';

/** Content filter pills shown in the nav bar next to the forms toggle. */
type VideoFilterKey = 'all' | 'nonMusic' | 'music' | 'tvShows';

const FILTER_PILLS: { key: VideoFilterKey; labelKey: string }[] = [
  { key: 'all', labelKey: 'filter.all' },
  { key: 'nonMusic', labelKey: 'filter.non_music' },
  { key: 'music', labelKey: 'filter.music' },
  { key: 'tvShows', labelKey: 'title.tv_shows' },
];

// ── Helpers ────────────────────────────────────

function formatNumber(n: number | undefined, locale: string): string {
  if (!n) return '';
  return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

function lineHasAnyTerm(line: string, terms: string[]): boolean {
  const lower = line.toLowerCase();
  return terms.some((f) => lower.includes(f.trim().toLowerCase()));
}

/** The character immediately before (side='left') or after (side='right') the
 *  first occurrence of `term` in a video's matched line. Empty string when the
 *  term is at the line edge. Used as the grouping key for left/right context sorts. */
function contextChar(video: SubsSearchVideo, term: string, side: 'left' | 'right'): string {
  const line = video.subs_l2[video.matchLineIndex]?.line ?? '';
  const idx = line.toLowerCase().indexOf(term.toLowerCase());
  if (idx < 0) return '';
  if (side === 'left') {
    return idx > 0 ? (line[idx - 1] ?? '') : '';
  }
  return idx + term.length < line.length ? (line[idx + term.length] ?? '') : '';
}

/** Convert an ISO 8601 duration (e.g. "PT6M52S", "PT1H30M", "P1DT2H3M4S") to
 *  seconds. Returns `undefined` for values that aren't parseable. Plain numbers
 *  (already in seconds) pass through unchanged. */
function durationToSeconds(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  const num = typeof value === 'string' ? Number(value) : NaN;
  if (Number.isFinite(num)) return num; // numeric string, e.g. "123"
  if (typeof value !== 'string') return undefined;
  const iso = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(value);
  if (!iso) return undefined;
  const d = Number(iso[1] ?? 0);
  const h = Number(iso[2] ?? 0);
  const m = Number(iso[3] ?? 0);
  const s = Number(iso[4] ?? 0);
  return ((d * 24 + h) * 60 + m) * 60 + s;
}

/** Shared filter+sort for the result list. Both the rendered list and the
 *  player's prev/next queue use this, so the queue matches what's displayed. */
function applyFilterAndSort(
  videos: SubsSearchVideo[],
  listSearch: string,
  listSort: SortKey,
  term: string,
): SubsSearchVideo[] {
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

  // For left/right-context sorts, order groups by their size (descending) so
  // the biggest groups land at the top. Within a group, keep the boundary
  // character alphabetical for a stable, legible order.
  let contextCounts: Map<string, number> | undefined;
  if (listSort === 'leftContext' || listSort === 'rightContext') {
    const side = listSort === 'leftContext' ? 'left' : 'right';
    contextCounts = new Map();
    for (const v of result) {
      const key = contextChar(v, term, side) || '—';
      contextCounts.set(key, (contextCounts.get(key) ?? 0) + 1);
    }
  }

  result.sort((a, b) => {
    switch (listSort) {
      case 'likes':
        return (b.views ?? 0) - (a.views ?? 0);
      case 'date':
        return new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime();
      case 'length': {
        const la = getMatchLine(a)?.line.length ?? 0;
        const lb = getMatchLine(b)?.line.length ?? 0;
        return la - lb;
      }
      case 'leftContext':
      case 'rightContext': {
        const side = listSort === 'leftContext' ? 'left' : 'right';
        const ka = contextChar(a, term, side) || '—';
        const kb = contextChar(b, term, side) || '—';
        // Largest group first, then alphabetical by boundary char.
        const diff = (contextCounts?.get(kb) ?? 0) - (contextCounts?.get(ka) ?? 0);
        if (diff !== 0) return diff;
        return ka.localeCompare(kb);
      }
      case 'views':
      default:
        return (b.views ?? 0) - (a.views ?? 0);
    }
  });
  return result;
}

/** The first search form that appears in this line (used as the server-side
 *  highlight term so the emphasis lands on the right word in the translation). */
function firstMatchingForm(line: string, terms: string[]): string | undefined {
  const lower = line.toLowerCase();
  return terms
    .map((f) => f.trim())
    .filter(Boolean)
    .find((f) => lower.includes(f.toLowerCase()));
}

// ── Main Component ─────────────────────────────

export function SubsSearchResults({ term, headTerm = '', embedded = false, exactMatch = false, onExactToggle, formCount = 0 }: SubsSearchResultsProps) {
  const { l1, l2 } = useLanguage();
  const t = useT();
  const { display, search } = useSettingsContext();
  const { isPro } = useSubscriptionContext();
  const playerRef = useRef<YouTubePlayerHandle>(null);

  // Full fetched result pool + the youtube_ids skipped for failed embeds.
  // `videos` below is derived from these so a skipped video can be replaced
  // by the next pool entry without losing its free quota slot.
  const [pool, setPool] = useState<SubsSearchVideo[]>([]);
  const [skippedIds, setSkippedIds] = useState<ReadonlySet<string>>(() => new Set());
  const skippedIdsRef = useRef<ReadonlySet<string>>(skippedIds);
  const [totalHits, setTotalHits] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Player state
  const [currentIndex, setCurrentIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Autoplay policy:
  //  - Initial page load / mount: never autoplay (even when the term resolves
  //    right after mount, e.g. inflections loading).
  //  - Everything after that autoplays: a fresh search while the component is
  //    already mounted (e.g. navigating to another word), and opening a result
  //    from the list or advancing to another result (prev/next buttons).
  const [autoplayEnabled, setAutoplayEnabled] = useState(false);
  const autoplayRef = useRef(autoplayEnabled);
  useEffect(() => {
    autoplayRef.current = autoplayEnabled;
  }, [autoplayEnabled]);

  // Whether the first search after mount has completed. The initial load never
  // autoplays; only activity after mount (new search or result navigation) may.
  const initialLoadRef = useRef(true);
  const prevTermRef = useRef(term);
  const prevExactRef = useRef(exactMatch);

  // Sidebar tabs (subs | info) inside the playback modal's multiline mode.
  const [panelTab, setPanelTab] = useState<SidebarTabKey>('subs');
  // Playback modal — the result list is the default surface; clicking a result
  // opens the player + subtitles in this modal. Independent of singleline/multiline mode.
  const [videoOpen, setVideoOpen] = useState(false);
  // Scroll container for the page list (lazy-translation observer).
  const listRef = useRef<HTMLDivElement>(null);
  // Scroll container for the multiline sidebar's subs tab — the modal's
  // SubtitleDisplay uses it for smart scrolling (only scrolls when a line
  // leaves the viewport).
  const sidebarContentRef = useRef<HTMLDivElement>(null);
  // List: filter + sort
  const [listSearch, setListSearch] = useState('');
  const [listSort, setListSort] = useState<SortKey>('views');
  // Content filter pill (All / Non-Music / Music / TV Shows).
  const [videoFilter, setVideoFilter] = useState<VideoFilterKey>('all');

  // Subtitle display mode in the playback modal: follow playback one line at a
  // time (singleline), or show the full transcript (multiline — tabbed subs |
  // info sidebar). Mirrors the watch page's subtitles/transcript modes.
  // The choice persists in localStorage (client-only): read after mount to
  // avoid a hydration mismatch, written on every toggle. No API sync.
  const [subtitleMode, setSubtitleMode] = useState<'singleline' | 'multiline'>('singleline');

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(SUBTITLE_MODE_KEY);
      if (saved === 'singleline' || saved === 'multiline') setSubtitleMode(saved);
    } catch {
      /* localStorage unavailable (private mode etc.) — keep default */
    }
  }, []);

  const handleToggleSubtitleMode = useCallback(() => {
    setSubtitleMode((m) => {
      const next = m === 'singleline' ? 'multiline' : 'singleline';
      try {
        window.localStorage.setItem(SUBTITLE_MODE_KEY, next);
      } catch {
        /* localStorage unavailable — mode still applies for this session */
      }
      return next;
    });
    // Mirror the watch page: reopening the sidebar (multiline) starts on the
    // subs tab, like the watch page's sidebar remount.
    setPanelTab('subs');
  }, []);

  // Content filter: narrows the fetched pool by category / TV-show membership.
  // Client-side over the already-fetched results, like the exact-match toggle
  // (the server has no NOT-IN filter, so "Non-Music" can't be expressed there).
  const applyVideoFilter = useCallback(
    (list: SubsSearchVideo[]): SubsSearchVideo[] => {
      switch (videoFilter) {
        case 'music':
          return list.filter((v) => v.category === 10 || v.category === 24);
        case 'nonMusic':
          return list.filter((v) => v.category !== 10 && v.category !== 24);
        case 'tvShows':
          return list.filter((v) => !!v.tv_show);
        case 'all':
        default:
          return list;
      }
    },
    [videoFilter],
  );

  // Visible results: drop videos whose embeds failed, apply the content
  // filter pill, then apply the free quota (first 5) to the *playable* list so
  // skipped videos don't consume a free member's slot.
  const videos = useMemo(() => {
    const playable = pool.filter((v) => !skippedIds.has(v.youtube_id));
    const filtered = applyVideoFilter(playable);
    return isPro ? filtered : filtered.slice(0, FREE_SUBS_SEARCH_HITS);
  }, [pool, skippedIds, isPro, applyVideoFilter]);

  // ── Result list / player queue: filter + sort ──
  // This same ordering drives both the rendered list and the player's prev/next
  // queue, so moving through the player follows the displayed order.
  const filteredVideos = useMemo(
    () => applyFilterAndSort(videos, listSearch, listSort, term),
    [videos, listSearch, listSort, term],
  );

  const currentVideo = filteredVideos[currentIndex] ?? null;
  const matchLine = currentVideo?.subs_l2[currentVideo.matchLineIndex] ?? null;
  // Show the search-match line immediately, even before the video plays.
  const defaultSubtitleLine = matchLine
    ? { starttime: matchLine.starttime, line: matchLine.line }
    : undefined;

  // Split comma-separated search terms for highlighting
  const highlightTerms = useMemo(
    () => term.split(',').map((t) => t.trim()).filter(Boolean),
    [term],
  );

  const applyVideos = useCallback((all: SubsSearchVideo[]) => {
    setTotalHits(all.length);
    // A new search starts with a clean skip list.
    const freshSkips = new Set<string>();
    skippedIdsRef.current = freshSkips;
    setSkippedIds(freshSkips);
    setPool(all);
  }, []);

  // Memoize initialLines for SubtitleDisplay so it doesn't re-trigger on every render
  const subtitleInitialLines = useMemo(
    () => {
      const lines = currentVideo?.subs_l2.map((l) => ({
        starttime: l.starttime,
        l1Line: '',
        l2Line: l.line,
      })) ?? [];
      // Sort by starttime ascending — SubtitleDisplay's activeIndex logic
      // iterates sequentially and breaks on the first line > currentTime,
      // so lines MUST be in chronological order.
      lines.sort((a, b) => a.starttime - b.starttime);
      return lines;
    },
    [currentVideo?.id, currentVideo?.subs_l2],
  );

  // ── Fetch ────────────────────────────────────

  // Cache of the most recent all-forms search (keyed by its term string), so
  // toggling exact-match can filter locally instead of re-querying the server.
  const allFormVideosRef = useRef<SubsSearchVideo[]>([]);
  const allFormTermRef = useRef('');

  useEffect(() => {
    if (!term) return;

    // Only user-initiated changes (a different word, or toggling exact match)
    // may autoplay. Dependency re-runs — e.g. `isPro` finishing loading right
    // after the first fetch — must keep the current autoplay policy, not
    // suddenly start the video on a page refresh.
    const termChanged = prevTermRef.current !== term;
    const exactToggled = prevExactRef.current !== exactMatch;
    prevTermRef.current = term;
    prevExactRef.current = exactMatch;
    const userInitiated = termChanged || exactToggled;

    // A new search (new word, or exact-match toggle) returns to the list —
    // close the playback modal so it never shows a stale result.
    if (userInitiated) setVideoOpen(false);

    const searchForms = term.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);

    // Exact-match switch: the all-forms results were already fetched and
    // contain this exact form → filter them client-side, no new request.
    // Only applies when the exact term belongs to the cached all-forms search
    // (i.e. this is a mode toggle on the same word, not a new word search).
    const cachedForms = allFormTermRef.current
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    const isSameWord =
      cachedForms.length > 0 && searchForms.every((f) => cachedForms.includes(f));

    if (exactMatch && isSameWord && allFormVideosRef.current.length > 0) {
      const exactVideos = allFormVideosRef.current
        .filter((v) =>
          v.subs_l2.some((l) =>
            searchForms.some((f) => l.line.toLowerCase().includes(f)),
          ),
        )
        .map((v) => ({ ...v, matchLineIndex: findMatchLine(v.subs_l2, term) }));
      if (exactVideos.length > 0) {
        applyVideos(exactVideos);
        setCurrentIndex(0);
        setAutoplayEnabled(userInitiated);
        setLoading(false);
        setError(null);
        return;
      }
    }

    // Back to all forms: restore the cached all-forms results.
    if (
      !exactMatch &&
      allFormTermRef.current === term &&
      allFormVideosRef.current.length > 0
    ) {
      applyVideos(allFormVideosRef.current);
      setCurrentIndex(0);
      setAutoplayEnabled(userInitiated);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    const firstLoad = initialLoadRef.current;
    setLoading(true);
    setError(null);

    fetch(
      `${PYTHON_API_URL}/subs-search?terms=${encodeURIComponent(term)}&l2=${baseCode(l2.code)}&limit=${search.expandSubsSearch && isPro ? 500 : 50}&context=3`,
    )
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: any[]) => {
        if (cancelled) return;
        const parsed: SubsSearchVideo[] = (Array.isArray(data) ? data : [])
          .map((v: any) => {
            const lines = parseSubsL2(v.subs_l2 ?? '');
            const duration = durationToSeconds(v.duration);
            if (v.duration != null && duration == null) {
              log('[subsSearch] raw duration value is null/NaN/empty', {
                youtube_id: v.youtube_id,
                duration: v.duration,
                type: typeof v.duration,
              });
            }
            return {
              id: v.id,
              title: v.title ?? t('label.untitled_video'),
              youtube_id: v.youtube_id,
              subs_l2: lines,
              views: v.views,
              duration,
              date: v.date,
              category: v.category != null ? Number(v.category) : null,
              tv_show: v.tv_show != null ? Number(v.tv_show) : null,
              matchLineIndex: findMatchLine(lines, term),
            };
          })
          .filter((v) =>
            v.subs_l2.some((l) =>
              searchForms.some((f) => l.line.toLowerCase().includes(f)),
            ),
          );
        // Only the fetch that actually applies results may flip the flag —
        // flipping it at effect start makes StrictMode's second effect pass
        // treat the initial load as a "later search" and autoplay.
        initialLoadRef.current = false;
        const autoplay = !firstLoad && userInitiated;
        applyVideos(parsed);
        if (!exactMatch) {
          allFormVideosRef.current = parsed;
          allFormTermRef.current = term;
        }
        setCurrentIndex(0);
        setAutoplayEnabled(autoplay);
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
  }, [term, l2.code, exactMatch, search.expandSubsSearch, isPro]);

  // ── Seek to match when video changes ─────────
  // startTime is also passed to YouTubePlayer for reliable seeking during onReady.

  useEffect(() => {
    if (currentVideo && playerRef.current) {
      const matchTime = matchLine?.starttime ?? 0;
      const timer = setTimeout(() => {
        if (autoplayRef.current) {
          playerRef.current?.seekTo(matchTime);
          playerRef.current?.play();
        }
        // When autoplay is off, onReady already cued the video at the exact
        // match time (paused). Seeking again here would restart playback from
        // the cued state, so we intentionally don't seek in that case.
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [currentIndex, currentVideo?.youtube_id]);

  // ── Player callbacks ─────────────────────────

  const handleTimeUpdate = useCallback((time: number) => setCurrentTime(time), []);

  const handleDuration = useCallback((d: number) => setDuration(d), []);

  const handleStateChange = useCallback((state: number) => {
    setPaused(state === PLAYER_STATES.PAUSED || state === PLAYER_STATES.ENDED);
  }, []);

  // Auto-skip videos whose embeds fail (private, embed-disabled, removed…).
  // Each youtube_id is skipped at most once per search (skippedIdsRef guard),
  // so a run of broken results simply advances through the pool once and then
  // shows the empty state — no skipping loop.
  const handleVideoError = useCallback(
    (_error: Error, info?: YouTubePlayerErrorInfo) => {
      if (!info?.skippable || !currentVideo) return;
      const erroredId = currentVideo.youtube_id;
      if (skippedIdsRef.current.has(erroredId)) return;

      const nextSkipped = new Set(skippedIdsRef.current);
      nextSkipped.add(erroredId);
      skippedIdsRef.current = nextSkipped;

      // Recompute the full pipeline (content filter → quota → filter/sort) that
      // `filteredVideos` produces after this skip, so the queue stays in the
      // displayed order and the index clamp is exact.
      const playable = pool.filter((v) => !nextSkipped.has(v.youtube_id));
      const contentFiltered = applyVideoFilter(playable);
      const base = isPro ? contentFiltered : contentFiltered.slice(0, FREE_SUBS_SEARCH_HITS);
      const nextVideos = applyFilterAndSort(base, listSearch, listSort, term);

      setSkippedIds(nextSkipped);
      // The video after the errored one slides into its slot, so keep the
      // same index; only clamp when the errored video was the last one.
      setCurrentIndex((i) => {
        let nextIndex = i;
        if (nextIndex >= nextVideos.length) nextIndex = Math.max(0, nextVideos.length - 1);
        return nextIndex;
      });

      log('[subsSearch] skipped unavailable video', {
        youtubeId: erroredId,
        remaining: nextVideos.length,
      });
    },
    [currentVideo, pool, isPro, applyVideoFilter, listSearch, listSort, term],
  );

  const goToPrevious = useCallback(() => {
    if (currentIndex > 0) {
      setAutoplayEnabled(true);
      setCurrentIndex((i) => i - 1);
    }
  }, [currentIndex]);

  const goToNext = useCallback(() => {
    if (currentIndex < filteredVideos.length - 1) {
      setAutoplayEnabled(true);
      setCurrentIndex((i) => i + 1);
    }
  }, [currentIndex, filteredVideos.length]);

  // Changing the sort or the text filter reorders/shrinks the queue, so the
  // current index may now point at a different (or missing) video. Reset to
  // the top of the newly-ordered list. (The content-filter pills reset eagerly
  // in their own click handler.)
  useEffect(() => {
    setCurrentIndex(0);
  }, [listSort, listSearch]);

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

  // Derived: are there lines before/after the current position?
  const { hasPreviousLine, hasNextLine } = useMemo(() => {
    if (!currentVideo) return { hasPreviousLine: false, hasNextLine: false };
    const subs = currentVideo.subs_l2;
    let prev = false;
    let next = false;
    for (let i = subs.length - 1; i >= 0; i--) {
      if (subs[i]!.starttime < currentTime - 0.3) { prev = true; break; }
    }
    for (let i = 0; i < subs.length; i++) {
      if (subs[i]!.starttime > currentTime + 0.3) { next = true; break; }
    }
    return { hasPreviousLine: prev, hasNextLine: next };
  }, [currentTime, currentVideo]);

  // Grouping key for left/right-context sorts: the character immediately
  // before (left) or after (right) the term in each matched line. Other sorts
  // don't group. Consecutive runs of the same key become a single group.
  // When the term sits at the line edge there is no boundary char, so fall
  // back to a placeholder key so every row still belongs to a group.
  const contextGroupKey = useMemo(() => {
    if (listSort !== 'leftContext' && listSort !== 'rightContext') return undefined;
    const side = listSort === 'leftContext' ? 'left' : 'right';
    return (v: SubsSearchVideo) => contextChar(v, term, side) || '—';
  }, [listSort, term]);

  // Collapsed context groups (rows hidden, header stays). Reset whenever the
  // sort mode changes so a fresh sort starts fully expanded.
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    setCollapsedGroups(new Set());
  }, [listSort]);

  const toggleGroup = useCallback((key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Every distinct group key present in the filtered list, so "Collapse All" /
  // "Expand All" can flip them in one go. Only defined when grouping applies.
  const allGroupKeys = useMemo(() => {
    if (!contextGroupKey) return undefined;
    return [...new Set(filteredVideos.map((v) => contextGroupKey(v)))].filter(Boolean);
  }, [contextGroupKey, filteredVideos]);

  const collapseAll = useCallback(() => {
    if (!allGroupKeys) return;
    setCollapsedGroups(new Set(allGroupKeys));
  }, [allGroupKeys]);

  const expandAll = useCallback(() => {
    setCollapsedGroups(new Set());
  }, []);

  // Per-row segments — the matched line only (no prev/next context in the
  // list), flagged with whether it contains a search term. Translations are
  // requested per segment so the translation can mirror the muted/normal
  // treatment of the original.
  const rowSegments = useMemo(
    () =>
      filteredVideos.map((video) => {
        const ml = video.subs_l2[video.matchLineIndex];
        const segs: { text: string; hasTerm: boolean }[] = [];
        const match = ml?.line ?? '';
        if (match) segs.push({ text: match, hasTerm: lineHasAnyTerm(match, highlightTerms) });
        return segs;
      }),
    [filteredVideos, highlightTerms],
  );

  // Flat per-segment translation input plus each row's starting index into
  // that flat array. The matched term per line is sent as the server-side
  // highlight form (the review page pattern), which bolds it in the output.
  const translationInput = useMemo(() => {
    const lines: SubtitleLine[] = [];
    const forms: (string | undefined)[] = [];
    const rowStarts: number[] = [];
    for (const segs of rowSegments) {
      rowStarts.push(lines.length);
      for (const seg of segs) {
        lines.push({ line: seg.text, starttime: 0 });
        forms.push(seg.hasTerm ? firstMatchingForm(seg.text, highlightTerms) : undefined);
      }
    }
    return { lines, forms, rowStarts };
  }, [rowSegments, highlightTerms]);

  // ── Page list: lazy row translations ──
  // Like the watch page, only rows near what's visible get translated
  // (visible rows + lookahead chunks). Scrolling feeds a new anchor index.
  // The list is the default surface, so the observer runs whenever rows exist.
  const visibleIndexesRef = useRef<Set<number>>(new Set());
  const [listFirstVisible, setListFirstVisible] = useState(0);

  useEffect(() => {
    visibleIndexesRef.current.clear();
    setListFirstVisible(0);
    const contentDiv = listRef.current;
    if (!contentDiv) return;

    // The content ref div sits inside the list's scrollable container
    // (overflow-y-auto). Walk up to the actual scroller and use it as the
    // observer root, so rows stay "visible" only while inside the viewport.
    let scroller: HTMLElement | null = contentDiv;
    while (scroller && scroller.scrollHeight <= scroller.clientHeight) {
      scroller = scroller.parentElement;
    }
    if (!scroller) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const idx = Number((entry.target as HTMLElement).dataset.rowIndex);
          if (entry.isIntersecting) visibleIndexesRef.current.add(idx);
          else visibleIndexesRef.current.delete(idx);
        }
        const visible = [...visibleIndexesRef.current];
        if (visible.length > 0) setListFirstVisible(Math.min(...visible));
      },
      { root: scroller, rootMargin: '100px 0px 100px 0px' },
    );

    scroller
      .querySelectorAll<HTMLElement>('[data-row-index]')
      .forEach((row) => observer.observe(row));
    return () => observer.disconnect();
  }, [filteredVideos, collapsedGroups, listRef]);

  const listFirstLineIndex = translationInput.rowStarts[listFirstVisible] ?? 0;
  const listTranslationsEnabled = display.translation;
  const {
    translatedLines: listTranslations,
    loading: listTranslating,
  } = useSubtitleTranslation(
    translationInput.lines,
    l1.code,
    baseCode(l2.code),
    listTranslationsEnabled && translationInput.lines.length > 0,
    listFirstLineIndex,
    translationInput.forms,
  );

  const selectFromList = useCallback(
    (idx: number) => {
      // idx is already the filtered/sorted list index, which is also the
      // player-queue index — no remap needed.
      setAutoplayEnabled(true);
      setCurrentIndex(idx);
      // Open the playback modal — the list stays mounted underneath.
      setVideoOpen(true);
      setPanelTab('subs');
    },
    [],
  );

  // Shared row renderer for the page list — thumbnail + matched-line +
  // translation layout, lazy translations via the IntersectionObserver above.
  // The row itself lives in SubsSearchRow; this wrapper only supplies the
  // per-row data and navigation callback.
  const renderQueueRow = useCallback(
    (video: SubsSearchVideo, i: number) => {
      const isActive = i === currentIndex;
      return (
        <SubsSearchRow
          video={video}
          index={i}
          isActive={isActive}
          onSelect={() => selectFromList(i)}
          segments={rowSegments[i] ?? []}
          highlightTerms={highlightTerms}
          showTranslation={display.translation}
          translationStart={translationInput.rowStarts[i] ?? 0}
          translations={listTranslations}
          translating={listTranslating}
          firstLineIndex={listFirstLineIndex}
        />
      );
    },
    [currentIndex, selectFromList, rowSegments, highlightTerms, display.translation, translationInput, listTranslations, listTranslating, listFirstLineIndex],
  );

  // Group header bar for left/right-context sorts: a tappable bar showing the
  // boundary character (one immediately before/after the term), a label
  // recalling which side of the term we're grouping by, and the group's result
  // count. Clicking toggles the group's collapsed state.
  const renderGroupHeader = useCallback(
    (group: {
      key: string;
      count: number;
      collapsed: boolean;
      isFirst: boolean;
      onToggle: () => void;
    }) => {
      const label = listSort === 'leftContext' ? t('title.leftContext') : t('title.rightContext');
      const hasBulkControls = group.isFirst && allGroupKeys && allGroupKeys.length > 1;
      const controls = hasBulkControls ? (
        <span
          className="ml-auto flex shrink-0 items-center gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={collapseAll}
            className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-primary hover:bg-primary/10"
          >
            {t('action.collapse_all')}
          </button>
          <button
            type="button"
            onClick={expandAll}
            className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-primary hover:bg-primary/10"
          >
            {t('action.expand_all')}
          </button>
          <span className="shrink-0 rounded-full bg-foreground/5 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {group.count}
          </span>
        </span>
      ) : (
        <span className="ml-auto shrink-0 rounded-full bg-foreground/5 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          {group.count}
        </span>
      );
      return (
        <div
          role="button"
          tabIndex={0}
          onClick={group.onToggle}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              group.onToggle();
            }
          }}
          aria-expanded={!group.collapsed}
          className="flex w-full cursor-pointer items-center gap-2 rounded-lg border border-border bg-muted/60 px-2 py-1 text-left transition-colors hover:bg-muted"
        >
          {group.collapsed ? (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="flex h-5 min-w-5 items-center justify-center rounded bg-primary/15 px-1 text-[11px] font-semibold text-primary">
            {group.key}
          </span>
          <span className="truncate text-[11px] font-medium text-muted-foreground">
            {label}
          </span>
          {controls}
        </div>
      );
    },
    [listSort, t, allGroupKeys, collapseAll, expandAll],
  );

  // Content-filter pills (All / Non-Music / Music / TV Shows), rendered in the
  // nav bar next to the forms toggle. Switching a pill resets to the first
  // result (the list may shrink, so the current index could go stale).
  const filterPills = (
    <div className="inline-flex items-center rounded-full bg-muted p-0.5">
      {FILTER_PILLS.map((pill) => (
        <button
          key={pill.key}
          onClick={() => {
            setVideoFilter(pill.key);
            setCurrentIndex(0);
          }}
          className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
            videoFilter === pill.key
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {t(pill.labelKey)}
        </button>
      ))}
    </div>
  );

  // ── Loading / Error / Empty ──────────────────

  if (loading) {
    return (
      <div className={embedded ? '' : 'rounded-xl border border-border bg-card shadow-sm overflow-hidden'}>
        {/* Nav bar — pills are clickable while loading; toggle shown as skeleton */}
        <div className="flex items-center justify-center gap-2 py-2">
          {formCount > 1 && (
            <div className="inline-flex items-center gap-0.5 rounded-full bg-muted p-0.5">
              <div className="h-4 w-14 animate-pulse rounded-full bg-muted/70" />
              <div className="h-4 w-14 animate-pulse rounded-full bg-muted/70" />
            </div>
          )}
          {filterPills}
        </div>
        {/* List skeleton — filter toolbar + rows */}
        <div className="space-y-3 p-3">
          <div className="flex items-center gap-2">
            <div className="h-8 flex-1 animate-pulse rounded-md bg-muted" />
            <div className="h-8 w-24 animate-pulse rounded-md bg-muted" />
          </div>
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg px-3 py-2">
              <div className="h-12 w-20 animate-pulse rounded bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-muted/50" />
              </div>
            </div>
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
      <div className={embedded ? '' : 'rounded-xl border border-border bg-card shadow-sm overflow-hidden'}>
        {/* Nav bar — keep toggle + pills accessible even when empty */}
        <div className="flex items-center justify-center gap-2 py-2">
          {formCount > 1 && (
            <div className="inline-flex items-center rounded-full bg-muted p-0.5">
              <button
                onClick={() => onExactToggle?.(true)}
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                  exactMatch
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title={t('msg.exact_match_searching_only', { term: headTerm || term, n: formCount })}
              >
                {headTerm || term}
              </button>
              <button
                onClick={() => onExactToggle?.(false)}
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                  !exactMatch
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title={t('msg.exact_match_searching', { n: formCount })}
              >
                {t('msg.all_forms')}
              </button>
            </div>
          )}
          {filterPills}
        </div>

        {/* Empty list */}
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
          <Search className="h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm">{t('msg.no_results')}</p>
        </div>
      </div>
    );
  }

  // ── Render ───────────────────────────────────

  return (
    <div className={embedded ? '' : 'rounded-xl border border-border bg-card shadow-sm overflow-hidden'}>
      {/* ── Nav bar (above list) — forms toggle + content-filter pills ── */}
      <div className="flex items-center justify-center gap-2 py-2">
        {formCount > 1 && (
          <div className="inline-flex items-center rounded-full bg-muted p-0.5">
            <button
              onClick={() => onExactToggle?.(true)}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                exactMatch
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title={t('msg.exact_match_searching_only', { term: headTerm || term, n: formCount })}
            >
              {headTerm || term}
            </button>
            <button
              onClick={() => onExactToggle?.(false)}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                !exactMatch
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title={t('msg.exact_match_searching', { n: formCount })}
            >
              {t('msg.all_forms')}
            </button>
          </div>
        )}
        {filterPills}
      </div>

      {!isPro && totalHits > FREE_SUBS_SEARCH_HITS && (
        <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/30 px-3 py-2">
          <p className="text-xs text-muted-foreground">
            {t('msg.upgrade_to_pro_banner')}
          </p>
          <Link
            href={`/${l1.code}/${l2.code}/go-pro`}
            className="shrink-0 text-xs font-semibold text-primary underline"
          >
            {t('action.upgrade_to_pro')}
          </Link>
        </div>
      )}

      {/* ── Result list — the default surface ── */}
      <div ref={listRef} className="max-h-[70vh] overflow-y-auto p-2">
        <VideoQueuePanel
          items={filteredVideos}
          keyFor={(v) => `${v.id}`}
          emptyText={t('msg.no_results')}
          filterValue={listSearch}
          onFilterChange={setListSearch}
          filterPlaceholder={t('placeholder.filter')}
          sortValue={listSort}
          onSortChange={(v) => setListSort(v as SortKey)}
          toolbarBorder={false}
          sortOptions={[
            { value: 'views', label: t('sort.most_viewed') },
            { value: 'likes', label: t('title.likes') },
            { value: 'date', label: t('title.date') },
            { value: 'length', label: t('title.length') },
            { value: 'leftContext', label: t('title.leftContext') },
            { value: 'rightContext', label: t('title.rightContext') },
          ]}
          renderRow={renderQueueRow}
          groupKeyFor={contextGroupKey}
          renderGroupHeader={renderGroupHeader}
          collapsedGroups={collapsedGroups}
          onToggleGroup={toggleGroup}
        />
      </div>

      {/* ── Playback modal — opens when a result is clicked ── */}
      {videoOpen && currentVideo && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          onClick={() => setVideoOpen(false)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50" />
          {/* Sheet — width matches the SRS review page's content (max-w-2xl) */}
          <div
            className="relative z-10 flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-border bg-background shadow-xl sm:m-4 sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header — video title + close */}
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
              <h3 className="min-w-0 truncate text-sm font-semibold">{currentVideo.title}</h3>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 flex-shrink-0"
                onClick={() => setVideoOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Mini player */}
            <div className="aspect-video w-full bg-black">
              <YouTubePlayer
                ref={playerRef}
                youtubeId={currentVideo.youtube_id}
                autoplay={autoplayEnabled}
                startTime={matchLine?.starttime}
                onTimeUpdate={handleTimeUpdate}
                onDuration={handleDuration}
                onStateChange={handleStateChange}
                onError={handleVideoError}
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
                onPreviousVideo={goToPrevious}
                onNextVideo={goToNext}
                onTogglePanel={handleToggleSubtitleMode}
                panelOpen={subtitleMode === 'multiline'}
                hasPreviousLine={hasPreviousLine}
                hasNextLine={hasNextLine}
                hasPreviousVideo={currentIndex > 0}
                hasNextVideo={currentIndex < filteredVideos.length - 1}
                videoCountText={t('msg.video_n_of_total', {
                  n: currentIndex + 1,
                  total: filteredVideos.length,
                })}
              />
            </div>

            {/* Subtitles — singleline line-follower, or multiline tabbed
                sidebar (subs | info). The mode persists in localStorage. */}
            {subtitleMode === 'singleline' ? (
              <div className="min-h-0 flex-1 overflow-y-auto py-2">
                <SubtitleDisplay
                  mode="singleline"
                  youtubeId={currentVideo?.youtube_id}
                  currentTime={currentTime}
                  videoTitle={currentVideo?.title}
                  initialLines={subtitleInitialLines}
                  highlightTerms={highlightTerms}
                  defaultLine={defaultSubtitleLine}
                  onSeekToLine={(t) => playerRef.current?.seekTo(t)}
                />
              </div>
            ) : (
              <VideoSidebarPanel
                tabs={[
                  { key: 'subs', label: t('label.subtitles'), icon: <FileText className="h-4 w-4" /> },
                  { key: 'info', label: t('title.info'), icon: <Info className="h-4 w-4" /> },
                ]}
                activeTab={panelTab}
                onTabChange={setPanelTab}
                contentRef={sidebarContentRef}
                className="min-h-0 flex-1"
              >
                {(tab) => {
                  if (tab === 'subs') {
                    return (
                      <SubtitleDisplay
                        mode="multiline"
                        youtubeId={currentVideo?.youtube_id}
                        currentTime={currentTime}
                        videoTitle={currentVideo?.title}
                        initialLines={subtitleInitialLines}
                        highlightTerms={highlightTerms}
                        defaultLine={defaultSubtitleLine}
                        scrollContainerRef={sidebarContentRef}
                        onSeekToLine={(t) => playerRef.current?.seekTo(t)}
                      />
                    );
                  }
                  // info tab — lightweight current-video info (SubsSearchVideo has no
                  // likes/comments/difficulty, so a full VideoMeta isn't possible).
                  return currentVideo ? (
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
                }}
              </VideoSidebarPanel>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
