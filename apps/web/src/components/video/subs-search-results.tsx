'use client';

import { useEffect, useState, useRef, useCallback, useMemo, type ReactNode } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import { useLanguage } from '@/providers/language-provider';
import { useSettingsContext } from '@/providers/settings-provider';
import { useSubscriptionContext } from '@/providers/subscription-provider';
import { useT } from '@/hooks/use-t';
import { useSubtitleTranslation, isLineInTranslationLookahead } from '@/hooks/use-subtitle-translation';
import { baseCode } from '@/lib/language-data';
import { PYTHON_API_URL } from '@/lib/api-url';
import { log } from '@/lib/logger';
import { youtubeThumbnail } from '@/lib/video-service';
import {
  YouTubePlayer,
  type YouTubePlayerHandle,
  type YouTubePlayerErrorInfo,
  PLAYER_STATES,
} from './youtube-player';
import { SubtitleDisplay } from './subtitle-display';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TranslationSkeleton } from '@/components/ui/translation-skeleton';
import { VideoControlBar } from './video-control-bar';
import type { SubtitleLine, SubsSearchVideo } from '@langplayer/shared';
import { parseSubsL2, findMatchLine } from '@langplayer/utils';
import {
  Loader2,
  Play,
  List,
  X,
  Search,
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

type SortKey = 'views' | 'likes' | 'date' | 'length' | 'leftContext' | 'rightContext';

// ── Helpers ────────────────────────────────────

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function lineHasAnyTerm(line: string, terms: string[]): boolean {
  const lower = line.toLowerCase();
  return terms.some((f) => lower.includes(f.trim().toLowerCase()));
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
  //    already mounted (e.g. navigating to another word), and advancing to
  //    another result (prev/next buttons or the list-all menu).
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

  // Modal state
  const [listOpen, setListOpen] = useState(false);
  const [listSearch, setListSearch] = useState('');
  const [listSort, setListSort] = useState<SortKey>('views');

  // Subtitle display mode: follow playback one line at a time, or show the
  // full transcript (scrollable, with click-to-seek).
  const [subtitleMode, setSubtitleMode] = useState<'singleline' | 'multiline'>('singleline');
  // Scroll container for the multiline transcript — keeps auto-scroll inside
  // the card instead of scrolling the whole page.
  const subtitleScrollRef = useRef<HTMLDivElement>(null);
  const handleToggleSubtitleMode = useCallback(() => {
    setSubtitleMode((m) => (m === 'singleline' ? 'multiline' : 'singleline'));
  }, []);

  // Visible results: drop videos whose embeds failed, then apply the free
  // quota (first 5) to the *playable* list so skipped videos don't consume a
  // free member's slot.
  const videos = useMemo(() => {
    const playable = pool.filter((v) => !skippedIds.has(v.youtube_id));
    return isPro ? playable : playable.slice(0, FREE_SUBS_SEARCH_HITS);
  }, [pool, skippedIds, isPro]);

  const currentVideo = videos[currentIndex] ?? null;
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

  // Truncated display: "a, b, c" or "a, b, c, and X other forms" (localized)
  const termDisplay = useMemo(() => {
    const forms = highlightTerms;
    if (forms.length <= 3) return forms.join(', ');
    const shown = forms.slice(0, 3).join(', ');
    const remaining = forms.length - 3;
    return `${shown} ${t('msg.and_n_other_forms', { n: remaining })}`;
  }, [highlightTerms, t]);

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

      const erroredIndex = videos.findIndex((v) => v.youtube_id === erroredId);
      const playable = pool.filter((v) => !nextSkipped.has(v.youtube_id));
      const nextVideos = isPro ? playable : playable.slice(0, FREE_SUBS_SEARCH_HITS);

      setSkippedIds(nextSkipped);
      // The video after the errored one slides into its slot, so keep the
      // same index; only clamp when the errored video was the last one.
      setCurrentIndex((i) => {
        let nextIndex = i;
        if (erroredIndex !== -1 && i > erroredIndex) nextIndex = i - 1;
        if (nextIndex >= nextVideos.length) nextIndex = Math.max(0, nextVideos.length - 1);
        return nextIndex;
      });

      log('[subsSearch] skipped unavailable video', {
        youtubeId: erroredId,
        remaining: nextVideos.length,
      });
    },
    [currentVideo, videos, pool, isPro],
  );

  const goToPrevious = useCallback(() => {
    if (currentIndex > 0) {
      setAutoplayEnabled(true);
      setCurrentIndex((i) => i - 1);
    }
  }, [currentIndex]);

  const goToNext = useCallback(() => {
    if (currentIndex < videos.length - 1) {
      setAutoplayEnabled(true);
      setCurrentIndex((i) => i + 1);
    }
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

  // ── Modal: filter + sort ─────────────────────

  const filteredVideos = useMemo(() => {
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
  }, [videos, listSearch, listSort, term]);

  // Per-row context segments (prev + match + next), each flagged with whether
  // it contains a search term. Translations are requested per segment so the
  // translation can mirror the muted/normal treatment of the original.
  const rowSegments = useMemo(
    () =>
      filteredVideos.map((video) => {
        const ml = video.subs_l2[video.matchLineIndex];
        const segs: { text: string; hasTerm: boolean }[] = [];
        if (video.matchLineIndex > 0) {
          const prev = video.subs_l2[video.matchLineIndex - 1]?.line ?? '';
          if (prev) segs.push({ text: prev, hasTerm: lineHasAnyTerm(prev, highlightTerms) });
        }
        const match = ml?.line ?? '';
        if (match) segs.push({ text: match, hasTerm: lineHasAnyTerm(match, highlightTerms) });
        if (video.matchLineIndex < video.subs_l2.length - 1) {
          const next = video.subs_l2[video.matchLineIndex + 1]?.line ?? '';
          if (next) segs.push({ text: next, hasTerm: lineHasAnyTerm(next, highlightTerms) });
        }
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

  // ── Modal: lazy row translations ──
  // Like the watch page, only rows near what's visible get translated
  // (visible rows + lookahead chunks). Scrolling feeds a new anchor index.
  const listRef = useRef<HTMLDivElement>(null);
  const visibleIndexesRef = useRef<Set<number>>(new Set());
  const [listFirstVisible, setListFirstVisible] = useState(0);

  useEffect(() => {
    if (!listOpen) return;
    visibleIndexesRef.current.clear();
    setListFirstVisible(0);
    const container = listRef.current;
    if (!container) return;

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
      { root: container, rootMargin: '100px 0px 100px 0px' },
    );

    container
      .querySelectorAll<HTMLElement>('[data-row-index]')
      .forEach((row) => observer.observe(row));
    return () => observer.disconnect();
  }, [listOpen, filteredVideos]);

  const listFirstLineIndex = translationInput.rowStarts[listFirstVisible] ?? 0;
  const listTranslationsEnabled = listOpen && display.translation;
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
      const realIdx = videos.indexOf(filteredVideos[idx]!);
      if (realIdx >= 0) {
        setAutoplayEnabled(true);
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
        <div className="flex items-center justify-center border-b border-border py-2">
          <div className="flex items-center gap-1">
            {formCount > 1 && (
              <div className="inline-flex items-center gap-0.5 rounded-full bg-muted p-0.5">
                <div className="h-4 w-14 animate-pulse rounded-full bg-muted/70" />
                <div className="h-4 w-14 animate-pulse rounded-full bg-muted/70" />
              </div>
            )}
            <div className="h-8 w-20 animate-pulse rounded-md bg-muted" />
            <div className="h-8 w-20 animate-pulse rounded-md bg-muted" />
          </div>
        </div>
        {/* Player skeleton */}
        <div className="aspect-video w-full bg-black flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-white/40" />
        </div>
        {/* Controls skeleton */}
        <div className="flex items-center justify-center gap-0.5 border-b border-border px-2 py-1">
          <div className="h-7 w-7 animate-pulse rounded bg-muted" />
          <div className="h-7 w-7 animate-pulse rounded bg-muted" />
          <div className="h-3 w-12 animate-pulse rounded bg-muted" />
          <div className="h-7 w-7 animate-pulse rounded bg-muted" />
          <div className="h-7 w-7 animate-pulse rounded bg-muted" />
        </div>
        {/* Subtitle skeleton — centered like the singleline display */}
        <div className="min-h-[5rem] py-4 flex flex-col items-center justify-center gap-2">
          <div className="h-6 w-3/4 animate-pulse rounded bg-muted" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-muted/50" />
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
        {/* Nav bar — keep toggle accessible even when empty */}
        <div className="flex items-center justify-between border-b border-border py-2">
          <span className="text-xs text-muted-foreground">
            {t('msg.video_n_of_total', { n: 0, total: 0 })}
          </span>
          <div className="flex items-center gap-1">
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
            <span className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground/50">
              <Play className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t('action.watch')}</span>
            </span>
            <button
              disabled
              onClick={() => setListOpen(true)}
              className="inline-flex h-8 items-center justify-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground/50 transition-colors disabled:pointer-events-none"
            >
              <List className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t('action.list_all')}</span>
            </button>
          </div>
        </div>

        {/* Player placeholder */}
        <div className="aspect-video w-full bg-black/90 flex flex-col items-center justify-center gap-2 text-muted-foreground">
          <Search className="h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm">{t('msg.no_results')}</p>
        </div>
      </div>
    );
  }

  // ── Render ───────────────────────────────────

  return (
    <div className={embedded ? '' : 'rounded-xl border border-border bg-card shadow-sm overflow-hidden'}>
      {/* ── Nav bar (above video) ── */}
      <div className="flex items-center justify-center border-b border-border py-2">
        <div className="flex items-center gap-1">
          {/* Exact-match toggle — only visible when formCount > 1 */}
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
          {currentVideo && (
            <Link
              href={`/${l1.code}/${l2.code}/watch/${currentVideo.youtube_id}`}
              className="inline-flex h-8 items-center justify-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <Play className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t('action.watch')}</span>
            </Link>
          )}
          <button
            onClick={() => setListOpen(true)}
            className="inline-flex h-8 items-center justify-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <List className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t('action.list_all')}</span>
          </button>
        </div>
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

      {/* ── Mini player ── */}
      <div className="aspect-video w-full bg-black">
        {currentVideo && (
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
        )}
      </div>

      {/* ── Controls ── */}
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
          hasNextVideo={currentIndex < videos.length - 1}
          videoCountText={t('msg.video_n_of_total', {
            n: currentIndex + 1,
            total: videos.length,
          })}
        />
      </div>

      {/* ── Subtitle display (single-line follows playback / full transcript) ── */}
      <div
        ref={subtitleScrollRef}
        className={subtitleMode === 'multiline' ? 'max-h-96 overflow-y-auto' : ''}
      >
        <SubtitleDisplay
          mode={subtitleMode}
          youtubeId={currentVideo?.youtube_id}
          currentTime={currentTime}
          videoTitle={currentVideo?.title}
          initialLines={subtitleInitialLines}
          highlightTerms={highlightTerms}
          defaultLine={defaultSubtitleLine}
          scrollContainerRef={subtitleMode === 'multiline' ? subtitleScrollRef : undefined}
          onSeekToLine={(t) => playerRef.current?.seekTo(t)}
        />
      </div>

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
                {t('msg.videos_matching', { searchTerm: termDisplay })}
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
              <Select value={listSort} onValueChange={(v) => setListSort(v as SortKey)}>
                <SelectTrigger size="sm" className="h-8 rounded-md bg-muted/50 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="views">{t('sort.most_viewed')}</SelectItem>
                  <SelectItem value="likes">{t('title.likes')}</SelectItem>
                  <SelectItem value="date">{t('title.date')}</SelectItem>
                  <SelectItem value="length">{t('title.length')}</SelectItem>
                  <SelectItem value="leftContext">{t('title.leftContext')}</SelectItem>
                  <SelectItem value="rightContext">{t('title.rightContext')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* List */}
            <div ref={listRef} className="flex-1 overflow-y-auto p-2">
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
                        data-row-index={i}
                        onClick={() => selectFromList(i)}
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
                              {rowSegments[i]?.map((seg, j) => (
                                <span
                                  key={j}
                                  className={seg.hasTerm ? '' : 'text-muted-foreground'}
                                >
                                  {j > 0 ? ' ' : ''}
                                  <HighlightTerms line={seg.text} terms={highlightTerms} />
                                </span>
                              ))}
                            </div>
                            {display.translation && (
                              <div className="mt-1 whitespace-nowrap text-sm text-muted-foreground">
                              {rowSegments[i]?.map((seg, j) => {
                                const flatIdx = (translationInput.rowStarts[i] ?? 0) + j;
                                const translated = listTranslations[flatIdx]?.line;
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
                                    ) : listTranslating &&
                                      isLineInTranslationLookahead(flatIdx, listFirstLineIndex) ? (
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
