'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { useLanguage } from '@/providers/language-provider';
import { useSettingsContext } from '@/providers/settings-provider';
import { useSubscriptionContext } from '@/providers/subscription-provider';
import { useT } from '@/hooks/use-t';
import { useSubtitleTranslation } from '@/hooks/use-subtitle-translation';
import { baseCode, languageName } from '@/lib/language-data';
import { stripSubtitleDurationPrefix, extractSubtitleDuration } from '@/lib/subtitle-csv';
import { PYTHON_API_URL } from '@/lib/api-url';
import { log, logwarn } from '@/lib/logger';
import {
  AI_ANALYZE_LIMIT,
  applyFilterAndSort,
  buildAiPayload,
  buildAiPrompt,
  buildAiOrderedVideos,
  contextChar,
  durationToSeconds,
  parseAiResponse,
  type AiGroupingResult,
  type SubsSearchSortKey,
} from '@langplayer/utils';
import {
  type YouTubePlayerErrorInfo,
} from './youtube-player';
import { VideoQueuePanel } from './video-queue-panel';
import { SubsSearchPlaybackModal } from './subs-search-playback-modal';
import { Button } from '@/components/ui/button';
import { SubsSearchRow } from './subs-search-row';
import type { SubtitleLine, SubsSearchVideo } from '@langplayer/shared';
import { parseSubsL2, findMatchLine } from '@langplayer/utils';
import {
  Search,
  ChevronDown,
  ChevronRight,
  Settings2,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

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

type SortKey = SubsSearchSortKey;

/** Content filter pills shown in the nav bar next to the forms toggle. */
type VideoFilterKey = 'all' | 'nonMusic' | 'music' | 'tvShows';

const FILTER_PILLS: { key: VideoFilterKey; labelKey: string }[] = [
  { key: 'all', labelKey: 'filter.all' },
  { key: 'nonMusic', labelKey: 'filter.non_music' },
  { key: 'music', labelKey: 'filter.music' },
  { key: 'tvShows', labelKey: 'title.tv_shows' },
];

// ── Helpers ────────────────────────────────────

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

// ── Main Component ─────────────────────────────

export function SubsSearchResults({ term, headTerm = '', embedded = false, exactMatch = false, onExactToggle, formCount = 0 }: SubsSearchResultsProps) {
  const { l1, l2 } = useLanguage();
  const t = useT();
  const { display, search } = useSettingsContext();
  const { isPro } = useSubscriptionContext();

  // Full fetched result pool + the youtube_ids skipped for failed embeds.
  // `videos` below is derived from these so a skipped video can be replaced
  // by the next pool entry without losing its free quota slot.
  const [pool, setPool] = useState<SubsSearchVideo[]>([]);
  const [skippedIds, setSkippedIds] = useState<ReadonlySet<string>>(() => new Set());
  const skippedIdsRef = useRef<ReadonlySet<string>>(skippedIds);
  const [totalHits, setTotalHits] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // The result list is the default surface; clicking a result opens the
  // shared playback modal (SubsSearchPlaybackModal) on that video.
  const [currentIndex, setCurrentIndex] = useState(0);
  const [videoOpen, setVideoOpen] = useState(false);

  // ── Full-subtitles loading ("Load Full Subtitles") ──
  // The subs-search pool only carries a limited subtitle range around each
  // match. When the playhead leaves that range we pause and offer to load the
  // full transcript. Full subtitles are cached per youtube_id; loading them
  // only swaps the line data — the YouTube player never remounts and the
  // playhead stays exactly where it is. The playback modal consumes them via
  // its `getLines` prop.
  const [fullSubsMap, setFullSubsMap] = useState<Record<string, SubtitleLine[]>>({});
  const [loadingFullSubs, setLoadingFullSubs] = useState(false);

  const prevTermRef = useRef(term);
  const prevExactRef = useRef(exactMatch);

  // Scroll container for the page list (lazy-translation observer).
  const listRef = useRef<HTMLDivElement>(null);
  // List: filter + sort
  const [listSearch, setListSearch] = useState('');
  const [listSort, setListSort] = useState<SortKey>('views');
  // Content filter pill (All / Non-Music / Music / TV Shows).
  const [videoFilter, setVideoFilter] = useState<VideoFilterKey>('all');

  // ── Advanced search (custom terms / exclude terms / shows / categories) ──
  // Empty tvShowIds / categoryIds mean "all". `customTerms` replaces the
  // auto-derived term string when non-empty.
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [customTerms, setCustomTerms] = useState('');
  const [excludeTerms, setExcludeTerms] = useState('');
  const [tvShowIds, setTvShowIds] = useState<number[]>([]);
  const [categoryIds, setCategoryIds] = useState<number[]>([]);
  // TV show checklist data (fetched once from /tv-shows when the modal opens).
  const [shows, setShows] = useState<Array<{ id: number; title: string }>>([]);
  const [showsExpanded, setShowsExpanded] = useState(true);
  const [categoriesExpanded, setCategoriesExpanded] = useState(true);

  // The term string actually searched: custom terms win over the auto-derived
  // head + inflections. Everything below (highlighting, matching, grouping,
  // AI analysis) uses this effective term.
  const searchTerm = customTerms.trim() ? customTerms : term;
  const isAdvancedActive =
    customTerms.trim().length > 0 ||
    excludeTerms.trim().length > 0 ||
    tvShowIds.length > 0 ||
    categoryIds.length > 0;

  // Load the TV-show checklist for this L2 when the modal first opens.
  const [showsLoaded, setShowsLoaded] = useState(false);
  useEffect(() => {
    if (!advancedOpen || showsLoaded) return;
    setShowsLoaded(true);
    fetch(`${PYTHON_API_URL}/tv-shows?l2=${baseCode(l2.code)}&limit=200`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data: any[]) => {
        setShows(
          (Array.isArray(data) ? data : [])
            .filter((s) => s && typeof s.id === 'number' && s.title)
            .map((s) => ({ id: s.id, title: String(s.title) })),
        );
      })
      .catch((err) => logwarn('[subsSearch] failed to load tv shows for advanced search', err));
  }, [advancedOpen, showsLoaded, l2.code]);

  // ── AI grouping ("Sort by AI") ──
  // The LLM analyzes the first 50 most-popular results and assigns each video
  // id to a meaning/pattern group. `aiKey` records which cache key the current
  // `aiGroups` corresponds to, so a stale result (new term / new videos) is
  // never applied. Results are cached per key to avoid re-requesting when the
  // user toggles away from AI sort and back.
  const [aiGroups, setAiGroups] = useState<AiGroupingResult | null>(null);
  const [aiKey, setAiKey] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(false);
  const aiCacheRef = useRef<Map<string, AiGroupingResult>>(new Map());
  const [aiRetryTick, setAiRetryTick] = useState(0);

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

  // ── AI grouping ("Sort by AI") ──
  // The LLM analyzes the first AI_ANALYZE_LIMIT most-popular results and
  // assigns each video id to a meaning/pattern group. Results are cached per
  // key so toggling away and back doesn't re-request.
  //
  // Analysis is based on the raw `pool` (most-popular fetch order), NOT the
  // video-filtered `videos`, so toggling the All/Music/Non-Music/TV-Show pill
  // doesn't invalidate the cache or trigger a new LLM call — it only filters
  // the already-grouped list below.
  const aiAnalyzed = useMemo(
    () => (listSort === 'ai' ? pool.slice(0, AI_ANALYZE_LIMIT) : []),
    [listSort, pool],
  );
  const aiCacheKey = useMemo(
    () =>
      aiAnalyzed.length > 0
        ? `${l2.code}|${searchTerm}|${aiAnalyzed.map((v) => v.id).join(',')}`
        : '',
    [aiAnalyzed, searchTerm, l2.code],
  );
  const aiGroupsValid = listSort === 'ai' && aiKey === aiCacheKey && aiGroups !== null;

  useEffect(() => {
    if (listSort !== 'ai' || aiAnalyzed.length === 0) return;
    const key = aiCacheKey;
    const cached = aiCacheRef.current.get(key);
    if (cached) {
      setAiGroups(cached);
      setAiKey(key);
      setAiLoading(false);
      setAiError(false);
      return;
    }

    let cancelled = false;
    setAiLoading(true);
    setAiError(false);

    const l1Name = languageName(l1.code, l1.code);
    const l2Name = languageName(l2.code, l1.code);
    const lines = buildAiPayload(aiAnalyzed);
    const prose = t('prompt.subs_ai_group', {
      n: aiAnalyzed.length,
      l2Name,
      term: searchTerm,
    });
    const prompt = buildAiPrompt({ prose, lines, l1Name, l2Name, term: searchTerm });
    log('[subsSearch] AI grouping request', {
      term: searchTerm,
      n: aiAnalyzed.length,
      promptChars: prompt.length,
    });

    fetch(`${PYTHON_API_URL}/chatgpt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, cache: true }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: any) => {
        if (cancelled) return;
        if (data?.status !== 'success' || typeof data.response !== 'string') {
          throw new Error('bad /chatgpt response');
        }
        const parsed = parseAiResponse(data.response);
        if (!parsed) throw new Error('unparseable AI grouping response');
        aiCacheRef.current.set(key, parsed);
        setAiGroups(parsed);
        setAiKey(key);
        setAiLoading(false);
        setAiError(false);
        log('[subsSearch] AI grouping applied', {
          patterns: parsed.patterns.length,
          otherIds: parsed.otherIds.length,
        });
      })
      .catch((err) => {
        if (!cancelled) {
          logwarn('[subsSearch] AI grouping failed', {
            message: err?.message ?? String(err),
          });
          setAiError(true);
          setAiLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [listSort, aiAnalyzed, aiCacheKey, l1.code, l2.code, searchTerm, t, aiRetryTick]);

  // Ordered display list for AI sort: pattern groups (LLM order), then
  // Other Patterns (analyzed ids the LLM didn't assign to any pattern —
  // including unmentioned leftovers), then everything beyond the analyzed 50
  // in original order. Based on the raw `pool` so the ordering is stable.
  const aiOrderedVideos = useMemo(
    () => (aiGroupsValid ? buildAiOrderedVideos(aiGroups!, aiAnalyzed, pool) : null),
    [aiGroupsValid, aiGroups, aiAnalyzed, pool],
  );

  // ── Result list / player queue: filter + sort ──
  // This same ordering drives both the rendered list and the player's prev/next
  // queue, so moving through the player follows the displayed order.
  const filteredVideos = useMemo(() => {
    if (listSort !== 'ai' || !aiOrderedVideos) {
      return applyFilterAndSort(videos, listSearch, listSort, searchTerm);
    }
    // Video-type pill + free-user quota filter the already-grouped AI order
    // (no re-analysis), then the text filter narrows within groups.
    let result = applyVideoFilter(aiOrderedVideos);
    if (!isPro) result = result.slice(0, FREE_SUBS_SEARCH_HITS);
    const q = listSearch.trim().toLowerCase();
    return q
      ? result.filter(
          (v) =>
            v.title.toLowerCase().includes(q) ||
            v.subs_l2.some((l) => l.line.toLowerCase().includes(q)),
        )
      : result;
  }, [listSort, aiOrderedVideos, videos, listSearch, searchTerm, applyVideoFilter, isPro]);

  // Group key per video for AI sort: `ai-<i>` per pattern group,
  // `other-patterns` for analyzed-but-unclassified (including ids the LLM
  // never mentioned), `other` for beyond-50.
  const aiGroupKeyFor = useCallback(
    (v: SubsSearchVideo): string | undefined => {
      if (!aiGroupsValid) return undefined;
      for (let i = 0; i < aiGroups!.patterns.length; i++) {
        if (aiGroups!.patterns[i]!.videoIds.includes(v.id)) return `ai-${i}`;
      }
      if (aiAnalyzed.some((a) => a.id === v.id)) return 'other-patterns';
      return 'other';
    },
    [aiGroupsValid, aiGroups, aiAnalyzed],
  );

  // Header content per AI group key: L1 heading + L2 pattern (the LLM writes
  // the heading in L1 and the pattern in L2, per the prompt).
  const aiHeaderInfo = useMemo(() => {
    if (!aiGroupsValid) return undefined;
    const map = new Map<string, { heading: string; pattern?: string }>();
    aiGroups!.patterns.forEach((g, i) => {
      map.set(`ai-${i}`, { heading: g.heading, pattern: g.pattern });
    });
    map.set('other-patterns', { heading: t('label.other_patterns') });
    map.set('other', { heading: t('label.other') });
    return map;
  }, [aiGroupsValid, aiGroups, t]);

  const currentVideo = filteredVideos[currentIndex] ?? null;

  // Fetch the complete transcript for the current video. The player element
  // depends only on youtube_id, so this never reloads it; we don't seek, so
  // the playhead stays unchanged. The shared playback modal consumes the
  // result via its `getLines` prop.
  const handleLoadFullSubtitles = useCallback(async () => {
    if (!currentVideo || loadingFullSubs) return;
    const youtubeId = currentVideo.youtube_id;
    if (fullSubsMap[youtubeId]?.length) return;
    setLoadingFullSubs(true);
    try {
      const res = await fetch(
        `/api/videos/${youtubeId}/subtitles?l2=${baseCode(l2.code)}&l1=${baseCode(l1.code)}&clean_generated=0`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: any = await res.json();
      const lines: SubtitleLine[] = (Array.isArray(data?.lines) ? data.lines : [])
        .map((l: any) => ({
          starttime: l.starttime ?? 0,
          duration: extractSubtitleDuration(l),
          line: stripSubtitleDurationPrefix(l.l2Line ?? ''),
        }))
        .filter((l: SubtitleLine) => l.line.trim().length > 0);
      if (lines.length === 0) throw new Error('empty subtitles');
      setFullSubsMap((prev) => ({ ...prev, [youtubeId]: lines }));
      toast.success(t('msg.full_subtitles_loaded'));
      log('[subsSearch] full subtitles loaded', { youtubeId, lines: lines.length });
    } catch (err) {
      logwarn('[subsSearch] full subtitles load failed', {
        youtubeId,
        message: err instanceof Error ? err.message : String(err),
      });
      toast.error(t('msg.full_subtitles_failed'));
    } finally {
      setLoadingFullSubs(false);
    }
  }, [currentVideo, fullSubsMap, loadingFullSubs, l1.code, l2.code, t]);

  // Split comma-separated search terms for highlighting
  const highlightTerms = useMemo(
    () => searchTerm.split(',').map((t) => t.trim()).filter(Boolean),
    [searchTerm],
  );

  const applyVideos = useCallback((all: SubsSearchVideo[]) => {
    setTotalHits(all.length);
    // A new search starts with a clean skip list.
    const freshSkips = new Set<string>();
    skippedIdsRef.current = freshSkips;
    setSkippedIds(freshSkips);
    setPool(all);
  }, []);

  // ── Fetch ────────────────────────────────────

  // Cache of the most recent all-forms search (keyed by its term string), so
  // toggling exact-match can filter locally instead of re-querying the server.
  const allFormVideosRef = useRef<SubsSearchVideo[]>([]);
  const allFormTermRef = useRef('');

  useEffect(() => {
    if (!searchTerm) return;

    // A change of term or exact-match toggle is "user initiated" — used to
    // return to the list below. Non-user re-runs (e.g. `isPro` finishing load)
    // must not disturb the current view.
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
        .map((v) => ({ ...v, matchLineIndex: findMatchLine(v.subs_l2, searchTerm) }));
      if (exactVideos.length > 0) {
        applyVideos(exactVideos);
        setCurrentIndex(0);
        setLoading(false);
        setError(null);
        return;
      }
    }

    // Back to all forms: restore the cached all-forms results.
    if (
      !exactMatch &&
      allFormTermRef.current === searchTerm &&
      allFormVideosRef.current.length > 0
    ) {
      applyVideos(allFormVideosRef.current);
      setCurrentIndex(0);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    // Advanced filters: category / tv_show narrow server-side; exclude terms
    // drop matching videos client-side after the fetch.
    const advancedParams: string[] = [];
    if (categoryIds.length > 0) advancedParams.push(`category=${encodeURIComponent(categoryIds.join(','))}`);
    if (tvShowIds.length > 0) advancedParams.push(`tv_show=${encodeURIComponent(tvShowIds.join(','))}`);
    const advancedQuery = advancedParams.length > 0 ? `&${advancedParams.join('&')}` : '';
    const excludeList = excludeTerms
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    fetch(
      `${PYTHON_API_URL}/subs-search?terms=${encodeURIComponent(searchTerm)}&l2=${baseCode(l2.code)}&limit=${search.expandSubsSearch && isPro ? 500 : 50}&context=3${advancedQuery}`,
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
              matchLineIndex: findMatchLine(lines, searchTerm),
            };
          })
          .filter((v) =>
            v.subs_l2.some((l) =>
              searchForms.some((f) => l.line.toLowerCase().includes(f)),
            ),
          )
          // Exclude terms: drop any video whose matched line contains one.
          .filter((v) => {
            if (excludeList.length === 0) return true;
            const match = v.subs_l2[v.matchLineIndex];
            if (!match) return true;
            const lower = match.line.toLowerCase();
            return !excludeList.some((x) => lower.includes(x));
          });
        applyVideos(parsed);
        if (!exactMatch) {
          allFormVideosRef.current = parsed;
          allFormTermRef.current = searchTerm;
        }
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
  }, [searchTerm, l2.code, exactMatch, search.expandSubsSearch, isPro, categoryIds, tvShowIds, excludeTerms]);

  // ── Seek to match when video changes ─────────
  // startTime is passed to YouTubePlayer (via the shared playback modal), which
  // cues (never plays) the video at the match position during onReady. No
  // manual seek is needed here.

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

      // Recompute the full pipeline (content filter → quota → filter/sort, or
      // AI-group order) that `filteredVideos` produces after this skip, so the
      // queue stays in the displayed order and the index clamp is exact.
      const playable = pool.filter((v) => !nextSkipped.has(v.youtube_id));
      let nextBase: SubsSearchVideo[];
      if (listSort === 'ai') {
        // Re-order the reduced pool by the AI grouping (unchanged), then cap by
        // the analyzed slice so "beyond-50" buckets recompute correctly.
        nextBase = aiGroupsValid
          ? buildAiOrderedVideos(aiGroups!, aiAnalyzed, playable)
          : playable;
      } else {
        const contentFiltered = applyVideoFilter(playable);
        nextBase = applyFilterAndSort(
          isPro ? contentFiltered : contentFiltered.slice(0, FREE_SUBS_SEARCH_HITS),
          listSearch,
          listSort,
          term,
        );
      }
      const contentFiltered = applyVideoFilter(nextBase);
      const nextVideos = isPro ? contentFiltered : contentFiltered.slice(0, FREE_SUBS_SEARCH_HITS);
      const q = listSearch.trim().toLowerCase();
      const finalNext = q
        ? nextVideos.filter(
            (v) =>
              v.title.toLowerCase().includes(q) ||
              v.subs_l2.some((l) => l.line.toLowerCase().includes(q)),
          )
        : nextVideos;

      setSkippedIds(nextSkipped);
      // The video after the errored one slides into its slot, so keep the
      // same index; only clamp when the errored video was the last one.
      setCurrentIndex((i) => {
        let nextIndex = i;
        if (nextIndex >= finalNext.length) nextIndex = Math.max(0, finalNext.length - 1);
        return nextIndex;
      });

      log('[subsSearch] skipped unavailable video', {
        youtubeId: erroredId,
        remaining: finalNext.length,
      });
    },
    [currentVideo, pool, isPro, applyVideoFilter, listSearch, listSort, searchTerm, aiGroupsValid, aiGroups, aiAnalyzed],
  );

  // Changing the sort or the text filter reorders/shrinks the queue, so the
  // current index may now point at a different (or missing) video. Reset to
  // the top of the newly-ordered list. (The content-filter pills reset eagerly
  // in their own click handler.)
  useEffect(() => {
    setCurrentIndex(0);
  }, [listSort, listSearch]);

  // Diagnostic: log when the user selects a left/right-context sort so we can
  // trace the full pipeline (selection → sort → group → display).
  useEffect(() => {
    if (listSort === 'leftContext' || listSort === 'rightContext') {
      log('[subsSearch] context sort selected', {
        listSort,
        term: searchTerm,
        inputVideos: videos.length,
      });
    }
  }, [listSort, searchTerm, videos]);

  // Grouping key for left/right-context sorts: the character immediately
  // before (left) or after (right) the term in each matched line. Other sorts
  // don't group. Consecutive runs of the same key become a single group.
  // When the term sits at the line edge there is no boundary char, so fall
  // back to a placeholder key so every row still belongs to a group.
  const contextGroupKey = useMemo(() => {
    if (listSort !== 'leftContext' && listSort !== 'rightContext') return undefined;
    const side = listSort === 'leftContext' ? 'left' : 'right';
    return (v: SubsSearchVideo) => contextChar(v, searchTerm, side) || '—';
  }, [listSort, searchTerm]);

  // Collapsed context groups (rows hidden, header stays). Grouped sorts
  // (left/right-context, AI) start fully collapsed by default — the user
  // expands the headers they care about. Reset logic lives below (after the
  // group keys are computable).
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());

  const toggleGroup = useCallback((key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Every distinct group key present in the filtered list, so "Collapse All" /
  // "Expand All" can flip them in one go. Only defined when grouping applies
  // (AI sort or left/right-context sorts).
  const activeGroupKey = listSort === 'ai' ? aiGroupKeyFor : contextGroupKey;
  const allGroupKeys = useMemo(() => {
    if (!activeGroupKey) return undefined;
    const keys = [...new Set(filteredVideos.map((v) => activeGroupKey(v)))].filter(
      Boolean,
    ) as string[];
    if (listSort === 'leftContext' || listSort === 'rightContext') {
      log('[subsSearch] context groups for display', {
        listSort,
        keys,
        nDisplayVideos: filteredVideos.length,
      });
    }
    return keys;
  }, [activeGroupKey, filteredVideos, listSort]);

  // Latest values via refs so the collapse-by-default effect can read them
  // without re-running on every filter keystroke (which would re-collapse
  // groups the user already expanded).
  const activeGroupKeyRef = useRef(activeGroupKey);
  activeGroupKeyRef.current = activeGroupKey;
  const filteredVideosRef = useRef(filteredVideos);
  filteredVideosRef.current = filteredVideos;

  // Grouped sorts start fully collapsed by default. Runs when the sort
  // changes, and again when AI groups first arrive (until then aiGroupKeyFor
  // has no keys to collapse).
  useEffect(() => {
    if (listSort !== 'leftContext' && listSort !== 'rightContext' && listSort !== 'ai') {
      setCollapsedGroups(new Set());
      return;
    }
    const keyFn = activeGroupKeyRef.current;
    if (!keyFn) return;
    const keys = new Set<string>();
    for (const v of filteredVideosRef.current) {
      const k = keyFn(v);
      if (k) keys.add(k);
    }
    setCollapsedGroups(keys);
  }, [listSort, aiGroupsValid]);

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
      setCurrentIndex(idx);
      // Open the playback modal — the list stays mounted underneath.
      setVideoOpen(true);
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

  // Group header bar: a tappable bar showing the group's title and its result
  // count. For left/right-context sorts the title is the boundary character
  // (one immediately before/after the term) plus a label; for AI sort it's the
  // LLM's L1 heading plus the L2 syntax pattern. Clicking toggles collapsed.
  const renderGroupHeader = useCallback(
    (group: {
      key: string;
      count: number;
      collapsed: boolean;
      isFirst: boolean;
      onToggle: () => void;
    }) => {
      if (listSort === 'leftContext' || listSort === 'rightContext') {
        log('[subsSearch] rendering context group header', {
          listSort,
          groupKey: group.key,
          count: group.count,
          isFirst: group.isFirst,
        });
      }
      const isAi = listSort === 'ai';
      const aiInfo = isAi ? aiHeaderInfo?.get(group.key) : undefined;
      const label = isAi
        ? aiInfo?.heading ?? group.key
        : listSort === 'leftContext'
          ? t('title.leftContext')
          : t('title.rightContext');
      const pattern = isAi ? aiInfo?.pattern : undefined;
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
          {isAi ? (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[11px] font-semibold text-foreground">
                {label}
              </span>
              {pattern && (
                <span className="block truncate text-[10px] text-muted-foreground">
                  {pattern}
                </span>
              )}
            </span>
          ) : (
            <>
              <span className="flex h-5 min-w-5 items-center justify-center rounded bg-primary/15 px-1 text-[11px] font-semibold text-primary">
                {group.key}
              </span>
              <span className="truncate text-[11px] font-medium text-muted-foreground">
                {label}
              </span>
            </>
          )}
          {controls}
        </div>
      );
    },
    [listSort, t, allGroupKeys, collapseAll, expandAll, aiHeaderInfo],
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

  // "Advanced" button — opens the advanced-search modal (custom terms,
  // exclude terms, shows/categories to include). Highlighted while any
  // advanced setting is active.
  const advancedButton = (
    <button
      type="button"
      onClick={() => setAdvancedOpen(true)}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
        isAdvancedActive
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:text-foreground'
      }`}
      title={t('action.advanced_search')}
    >
      <Settings2 className="h-3 w-3" />
      {t('action.advanced_search')}
    </button>
  );

  // Distinct categories present in the current result pool — the checklist
  // source for "categories to include". Known categories get real names;
  // the rest fall back to "Category {n}".
  const poolCategories = useMemo(() => {
    const seen = new Map<number, number>();
    for (const v of pool) {
      if (v.category == null) continue;
      seen.set(v.category, (seen.get(v.category) ?? 0) + 1);
    }
    return Array.from(seen.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([id, count]) => ({ id, count }));
  }, [pool]);

  const categoryLabel = (id: number) =>
    id === 10 ? t('filter.music') : id === 24 ? t('title.music_and_entertainment') : t('label.category_n', { n: id });

  const toggleShow = (id: number) =>
    setTvShowIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const toggleCategory = (id: number) =>
    setCategoryIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const resetAdvanced = () => {
    setCustomTerms('');
    setExcludeTerms('');
    setTvShowIds([]);
    setCategoryIds([]);
  };

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
          {advancedButton}
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
          {advancedButton}
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
        {advancedButton}
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
          filterPlaceholder={t('placeholder.filter_videos', { n: filteredVideos.length })}
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
            { value: 'ai', label: t('sort.ai') },
          ]}
          belowToolbar={
            listSort === 'ai' && aiLoading ? (
              <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
                <span className="h-3 w-3 animate-spin rounded-full border border-primary border-t-transparent" />
                {t('msg.ai_analyzing')}
              </div>
            ) : listSort === 'ai' && aiError ? (
              <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
                <span>{t('msg.ai_grouping_failed')}</span>
                <button
                  type="button"
                  onClick={() => {
                    if (aiCacheKey) aiCacheRef.current.delete(aiCacheKey);
                    setAiKey('');
                    setAiGroups(null);
                    setAiRetryTick((n) => n + 1);
                  }}
                  className="font-semibold text-primary underline"
                >
                  {t('action.retry')}
                </button>
              </div>
            ) : undefined
          }
          renderRow={renderQueueRow}
          groupKeyFor={listSort === 'ai' ? aiGroupKeyFor : contextGroupKey}
          renderGroupHeader={renderGroupHeader}
          collapsedGroups={collapsedGroups}
          onToggleGroup={toggleGroup}
        />
      </div>

      {/* ── Playback modal — the same shared modal the DeepSeek "Examples
          from Videos" chips open. Portaled to the body, so it always sizes
          against the viewport (wider on wide screens in multiline mode). ── */}
      <SubsSearchPlaybackModal
        videos={filteredVideos}
        index={videoOpen ? currentIndex : null}
        onIndexChange={(i) => {
          if (i === null) {
            setVideoOpen(false);
          } else {
            setCurrentIndex(i);
          }
        }}
        highlightTerms={highlightTerms}
        autoplay={false}
        getLines={(v) => fullSubsMap[v.youtube_id] ?? v.subs_l2}
        onLoadFullSubtitles={handleLoadFullSubtitles}
        loadingFullSubs={loadingFullSubs}
        persistModeKey={SUBTITLE_MODE_KEY}
        onVideoError={handleVideoError}
      />

      {/* ── Advanced search modal ── */}
      <Dialog open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto p-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Settings2 className="h-4 w-4" />
              {t('action.advanced_search')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Custom search terms */}
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t('label.search_terms')}
              </label>
              <input
                type="text"
                value={customTerms}
                onChange={(e) => setCustomTerms(e.target.value)}
                placeholder={t('placeholder.custom_search_terms')}
                className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Exclude terms */}
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t('label.exclude_terms')}
              </label>
              <input
                type="text"
                value={excludeTerms}
                onChange={(e) => setExcludeTerms(e.target.value)}
                placeholder={t('placeholder.exclude_terms')}
                className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Shows to include */}
            <div className="rounded-lg border border-border">
              <button
                type="button"
                onClick={() => setShowsExpanded((v) => !v)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left"
              >
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${showsExpanded ? '' : '-rotate-90'}`}
                />
                <span className="flex-1 text-sm font-medium">{t('label.shows_to_include')}</span>
                <span className="text-xs text-muted-foreground">
                  {tvShowIds.length === 0 ? t('label.all_shows') : `${tvShowIds.length}`}
                </span>
              </button>
              {showsExpanded && (
                <div className="max-h-52 overflow-y-auto border-t border-border p-2">
                  <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted/40">
                    <input
                      type="checkbox"
                      checked={tvShowIds.length === 0}
                      onChange={() => setTvShowIds([])}
                    />
                    {t('label.all_shows')}
                  </label>
                  {shows.length === 0 ? (
                    <p className="px-2 py-2 text-xs text-muted-foreground">{t('msg.no_results')}</p>
                  ) : (
                    shows.map((show) => (
                      <label
                        key={show.id}
                        className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted/40"
                      >
                        <input
                          type="checkbox"
                          checked={tvShowIds.includes(show.id)}
                          onChange={() => toggleShow(show.id)}
                        />
                        <span className="min-w-0 flex-1 truncate">{show.title}</span>
                      </label>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Categories to include */}
            <div className="rounded-lg border border-border">
              <button
                type="button"
                onClick={() => setCategoriesExpanded((v) => !v)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left"
              >
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${categoriesExpanded ? '' : '-rotate-90'}`}
                />
                <span className="flex-1 text-sm font-medium">{t('label.categories_to_include')}</span>
                <span className="text-xs text-muted-foreground">
                  {categoryIds.length === 0 ? t('label.all_categories') : `${categoryIds.length}`}
                </span>
              </button>
              {categoriesExpanded && (
                <div className="max-h-52 overflow-y-auto border-t border-border p-2">
                  <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted/40">
                    <input
                      type="checkbox"
                      checked={categoryIds.length === 0}
                      onChange={() => setCategoryIds([])}
                    />
                    {t('label.all_categories')}
                  </label>
                  {poolCategories.length === 0 ? (
                    <p className="px-2 py-2 text-xs text-muted-foreground">{t('msg.no_results')}</p>
                  ) : (
                    poolCategories.map(({ id, count }) => (
                      <label
                        key={id}
                        className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted/40"
                      >
                        <input
                          type="checkbox"
                          checked={categoryIds.includes(id)}
                          onChange={() => toggleCategory(id)}
                        />
                        <span className="min-w-0 flex-1">{categoryLabel(id)}</span>
                        <span className="text-xs text-muted-foreground">{count}</span>
                      </label>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="mt-4 flex items-center justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={resetAdvanced}>
              {t('action.reset')}
            </Button>
            <Button size="sm" onClick={() => setAdvancedOpen(false)}>
              {t('action.apply')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
