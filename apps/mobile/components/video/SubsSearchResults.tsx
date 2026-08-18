import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { View, Text, Image, FlatList, ScrollView, TextInput, ActivityIndicator, useWindowDimensions, LayoutChangeEvent } from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import { useRouter } from 'expo-router';
import * as Dialog from '@/components/ui/dialog';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useT } from '@/hooks/use-t';
import { log } from '@/lib/logger';
import { useResponsive } from '@/hooks/use-responsive';
import { useVideos } from '@langplayer/api-client';
import { parseSubsL2, findMatchLine, durationToSeconds, applyFilterAndSort, contextChar, CONTEXT_GROUP_PLACEHOLDER } from '@langplayer/utils';
import type { SubsSearchSortKey } from '@langplayer/utils';
import type { SubsSearchVideo, SubtitleLine } from '@langplayer/shared';
import { YouTubePlayer, type YouTubePlayerHandle } from './YouTubePlayer';
import { useAnimatedBoolean } from '@/lib/animations';
import { SubtitleDisplay } from './SubtitleDisplay';
import { useActiveLineIndex } from '@/hooks/use-active-line-index';
import { useSubtitleTranslation } from '@/hooks/use-subtitle-translation';
import { VideoControlBar } from './VideoControlBar';
import { ErrorNotice } from '@/components/ui/error-notice';
import { localizedError } from '@/lib/errors';
import { baseCode } from '@langplayer/utils';
import { renderInlineMarkdown } from '@/lib/inline-markdown';
import { ICON_MUTED } from '@/lib/theme-colors';
import { List, X, ChevronDown, ChevronRight } from 'lucide-react-native';

function youtubeThumbnail(id: string): string {
  return `https://img.youtube.com/vi/${id}/mqdefault.jpg`;
}

interface SubsSearchResultsProps {
  term: string;
  /** Dictionary head form — shown as the "exact form" pill label. */
  headTerm?: string;
  exactMatch?: boolean;
  onExactToggle?: (exact: boolean) => void;
  formCount?: number;
}

/** ADR-0034: free users see the first 5 subs-search hits. */
const FREE_SUBS_SEARCH_HITS = 5;

/** Content filter pills shown in the nav bar next to the forms toggle
 *  (SPEC-079 parity, SPEC-082 Task 6). */
type VideoFilterKey = 'all' | 'nonMusic' | 'music' | 'tvShows';

const FILTER_PILLS: { key: VideoFilterKey; labelKey: string }[] = [
  { key: 'all', labelKey: 'filter.all' },
  { key: 'nonMusic', labelKey: 'filter.non_music' },
  { key: 'music', labelKey: 'filter.music' },
  { key: 'tvShows', labelKey: 'title.tv_shows' },
];

/** Sort options for the results toolbar (SPEC-082 Task 8; AI arrives in Task 10). */
const SORT_OPTIONS: { key: SubsSearchSortKey; labelKey: string }[] = [
  { key: 'views', labelKey: 'sort.most_viewed' },
  { key: 'likes', labelKey: 'title.likes' },
  { key: 'date', labelKey: 'title.date' },
  { key: 'length', labelKey: 'title.length' },
  { key: 'leftContext', labelKey: 'title.leftContext' },
  { key: 'rightContext', labelKey: 'title.rightContext' },
  { key: 'ai', labelKey: 'sort.ai' },
];

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function lineHasAnyTerm(line: string, terms: string[]): boolean {
  const lower = line.toLowerCase();
  return terms.some((f) => lower.includes(f.trim().toLowerCase()));
}

/** The first search form that appears in this line (translation highlight). */
function firstMatchingForm(line: string, terms: string[]): string | undefined {
  const lower = line.toLowerCase();
  return terms
    .map((f) => f.trim())
    .filter(Boolean)
    .find((f) => lower.includes(f.toLowerCase()));
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

export function SubsSearchResults({ term, headTerm = '', exactMatch = false, onExactToggle, formCount = 0 }: SubsSearchResultsProps) {
  const { l1Lang, l2Lang } = useLanguage();
  const { display, search } = useSettingsContext();
  const { isPro } = useSubscription();
  const t = useT();
  const router = useRouter();
  const videosApi = useVideos();
  const playerRef = useRef<YouTubePlayerHandle>(null);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const { isMd } = useResponsive();
  const [containerWidth, setContainerWidth] = useState(screenWidth);
  const videoHeight = (containerWidth / 16) * 9;

  // Full fetched result pool + the youtube_ids skipped for failed embeds.
  // `videos` below is derived from these so a skipped video can be replaced
  // by the next pool entry without losing its free quota slot.
  const [pool, setPool] = useState<SubsSearchVideo[]>([]);
  const [skippedIds, setSkippedIds] = useState<ReadonlySet<string>>(() => new Set());
  const skippedIdsRef = useRef<ReadonlySet<string>>(skippedIds);
  const [totalHits, setTotalHits] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [paused, setPaused] = useState(true);
  // Content filter pill (All / Non-Music / Music / TV Shows) — SPEC-082 Task 6.
  const [videoFilter, setVideoFilter] = useState<VideoFilterKey>('all');
  // List: text filter + sort (SPEC-082 Task 8).
  const [listSearch, setListSearch] = useState('');
  const [listSort, setListSort] = useState<SubsSearchSortKey>('views');
  const [listOpen, setListOpen] = useAnimatedBoolean();
  /** First visible row in the show-all list — drives lazy translation. */
  const [listFirstVisible, setListFirstVisible] = useState(0);

  // Never autoplay (SPEC-082 Task 12, web parity): videos are cued/paused at
  // the match line via `startTime`; playback starts only on explicit user
  // action. Kept as a named constant so the policy can be revisited.
  const autoplayEnabled = false;

  // Split comma-separated terms for highlighting
  const highlightTerms = useMemo(
    () => term.split(',').map((t) => t.trim()).filter(Boolean),
    [term],
  );

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
  // queue, so moving through the player follows the displayed order (web parity).
  const filteredVideos = useMemo(
    () => applyFilterAndSort(videos, listSearch, listSort, term),
    [videos, listSearch, listSort, term],
  );

  // ── Grouping (SPEC-082 Task 9) ──
  // Left/right-context sorts group rows by the boundary character; the shared
  // sort orders groups largest-first with stable within-group order, so
  // consecutive runs of the same key are the groups.
  const contextGroupKey = useMemo(() => {
    if (listSort !== 'leftContext' && listSort !== 'rightContext') return undefined;
    const side = listSort === 'leftContext' ? 'left' : 'right';
    return (v: SubsSearchVideo) => contextChar(v, term, side) || CONTEXT_GROUP_PLACEHOLDER;
  }, [listSort, term]);
  const activeGroupKey = contextGroupKey;

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
    if (!activeGroupKey) return undefined;
    return [...new Set(filteredVideos.map((v) => activeGroupKey(v)))];
  }, [activeGroupKey, filteredVideos]);

  const collapseAll = useCallback(() => {
    if (allGroupKeys) setCollapsedGroups(new Set(allGroupKeys));
  }, [allGroupKeys]);

  const expandAll = useCallback(() => {
    setCollapsedGroups(new Set());
  }, []);

  // Flat display items for the list: plain rows, or header+rows per group when
  // a grouping sort is active. Collapsed groups keep their header.
  type ListItem =
    | { kind: 'header'; key: string; count: number; isFirst: boolean }
    | { kind: 'row'; videoIndex: number; video: SubsSearchVideo };
  const listItems = useMemo<ListItem[]>(() => {
    if (!activeGroupKey) {
      return filteredVideos.map((v, i) => ({ kind: 'row', videoIndex: i, video: v }));
    }
    const groupIndexOf = new Map<string, number>();
    for (const v of filteredVideos) {
      const key = activeGroupKey(v);
      if (!groupIndexOf.has(key)) groupIndexOf.set(key, groupIndexOf.size);
    }
    const countOf = new Map<string, number>();
    for (const v of filteredVideos) {
      const key = activeGroupKey(v);
      countOf.set(key, (countOf.get(key) ?? 0) + 1);
    }
    const items: ListItem[] = [];
    const emitted = new Set<string>();
    filteredVideos.forEach((v, i) => {
      const key = activeGroupKey(v);
      if (emitted.has(key)) return;
      emitted.add(key);
      const isFirst = groupIndexOf.get(key) === 0;
      items.push({ kind: 'header', key, count: countOf.get(key) ?? 0, isFirst });
      if (collapsedGroups.has(key)) return;
      for (let j = i; j < filteredVideos.length && activeGroupKey(filteredVideos[j]!) === key; j++) {
        items.push({ kind: 'row', videoIndex: j, video: filteredVideos[j]! });
      }
    });
    return items;
  }, [filteredVideos, activeGroupKey, collapsedGroups]);

  const currentVideo = filteredVideos[currentIndex] ?? null;
  const matchLine = currentVideo?.subs_l2[currentVideo.matchLineIndex] ?? null;
  // Show the search-match line immediately, even before the video plays.
  const defaultSubtitleLine = matchLine
    ? { starttime: matchLine.starttime, l2Line: matchLine.line, l1Line: '' }
    : undefined;

  const applyVideos = useCallback((all: SubsSearchVideo[]) => {
    setTotalHits(all.length);
    // A new search starts with a clean skip list.
    const freshSkips = new Set<string>();
    skippedIdsRef.current = freshSkips;
    setSkippedIds(freshSkips);
    setPool(all);
  }, []);

  // Per-row segments — the matched line only (no prev/next context), matching
  // web; translations are requested per segment (SPEC-082 Task 7). Built over
  // `filteredVideos` so translations index 1:1 with the displayed list.
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

  const translationInput = useMemo(() => {
    const lines: SubtitleLine[] = [];
    const forms: (string | null | undefined)[] = [];
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

  const {
    translatedLines: listTranslations,
  } = useSubtitleTranslation(
    translationInput.lines,
    l1Lang.code,
    baseCode(l2Lang.code),
    listOpen && display.translation,
    listFirstVisible,
    translationInput.forms,
  );

  // Pre-parsed subtitle lines for SubtitleDisplay
  const subtitleInitialLines = useMemo(
    () =>
      currentVideo?.subs_l2.map((l) => ({
        starttime: l.starttime,
        l2Line: l.line,
        l1Line: '',
      })) ?? [],
    [currentVideo?.id, currentVideo?.subs_l2],
  );

  // Compute active line index from currentTime
  const subtitleStartTimes = useMemo(
    () => subtitleInitialLines.map((l) => l.starttime),
    [subtitleInitialLines],
  );
  const activeLineIndex = useActiveLineIndex(subtitleStartTimes, currentTime);

  // ── Fetch ──
  useEffect(() => {
    if (!term) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    videosApi.searchSubs({ terms: term, l2: l2Lang.code, limit: search.expandSubsSearch && isPro ? 500 : 50, context: 3 })
      .then((data) => {
        if (cancelled) return;
        const searchForms = term.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
        const parsed: SubsSearchVideo[] = data
          .map((v: any) => {
            const lines = parseSubsL2(v.subs_l2 ?? '');
            return {
              id: v.id,
              title: v.title ?? t('label.untitled_video'),
              youtube_id: v.youtube_id,
              subs_l2: lines,
              views: v.views,
              duration: durationToSeconds(v.duration),
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
        applyVideos(parsed);
        setCurrentIndex(0);
        setLoading(false);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(localizedError(t, err, 'error.subs_search_failed'));
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [term, l2Lang.code, search.expandSubsSearch, isPro]);

  // Changing the sort or the text filter reorders/shrinks the queue, so the
  // current index may now point at a different (or missing) video. Reset to
  // the top of the newly-ordered list (web parity).
  useEffect(() => {
    setCurrentIndex(0);
  }, [listSort, listSearch]);

  // ── Player callbacks ──
  const handleTimeUpdate = useCallback((time: number) => setCurrentTime(time), []);
  const handleDuration = useCallback((d: number) => setDuration(d), []);
  const handleStateChange = useCallback((state: string) => {
    setPaused(state !== 'playing');
  }, []);

  // Auto-skip videos whose embeds fail (private, embed-disabled, removed…).
  // Each youtube_id is skipped at most once per search (skippedIdsRef guard),
  // so a run of broken results simply advances through the pool once and then
  // shows the empty state — no skipping loop.
  const handleVideoError = useCallback(
    (_error: Error, info?: { messageKey: string; skippable: boolean }) => {
      if (!info?.skippable || !currentVideo) return;
      const erroredId = currentVideo.youtube_id;
      if (skippedIdsRef.current.has(erroredId)) return;

      const nextSkipped = new Set(skippedIdsRef.current);
      nextSkipped.add(erroredId);
      skippedIdsRef.current = nextSkipped;

      const erroredIndex = filteredVideos.findIndex((v) => v.youtube_id === erroredId);
      const playable = pool.filter((v) => !nextSkipped.has(v.youtube_id));
      const contentFiltered = applyVideoFilter(playable);
      // Recompute the full pipeline (content filter → quota → filter/sort) that
      // `filteredVideos` produces after this skip, so the queue stays in the
      // displayed order and the index clamp is exact (web parity).
      const nextVideos = applyFilterAndSort(
        isPro ? contentFiltered : contentFiltered.slice(0, FREE_SUBS_SEARCH_HITS),
        listSearch,
        listSort,
        term,
      );
      let nextIndex = currentIndex;
      if (erroredIndex !== -1 && currentIndex > erroredIndex) nextIndex = currentIndex - 1;
      if (nextIndex >= nextVideos.length) nextIndex = Math.max(0, nextVideos.length - 1);

      setSkippedIds(nextSkipped);
      // The video after the errored one slides into its slot, so keep the
      // same index; only clamp when the errored video was the last one.
      setCurrentIndex(nextIndex);

      log('[subsSearch] skipped unavailable video', {
        youtubeId: erroredId,
        erroredIndex,
        currentIndex,
        nextIndex,
        nextYoutubeId: nextVideos[nextIndex]?.youtube_id ?? null,
        videosLength: filteredVideos.length,
        poolLength: pool.length,
        remaining: nextVideos.length,
        isPro,
      });
    },
    [currentVideo, filteredVideos, pool, isPro, currentIndex, applyVideoFilter, listSearch, listSort, term],
  );

  const selectFromList = (idx: number) => {
    setCurrentIndex(idx);
    setListOpen(false);
  };

  const goToPreviousLine = useCallback(() => {
    if (!currentVideo) return;
    const subs = currentVideo.subs_l2;
    for (let i = subs.length - 1; i >= 0; i--) {
      if (subs[i]!.starttime < currentTime - 0.3) {
        playerRef.current?.seekTo(subs[i]!.starttime);
        return;
      }
    }
  }, [currentVideo, currentTime]);

  const goToNextLine = useCallback(() => {
    if (!currentVideo) return;
    const subs = currentVideo.subs_l2;
    for (let i = 0; i < subs.length; i++) {
      if (subs[i]!.starttime > currentTime + 0.3) {
        playerRef.current?.seekTo(subs[i]!.starttime);
        return;
      }
    }
  }, [currentVideo, currentTime]);

  const hasPreviousLine = useMemo(() => {
    if (!currentVideo) return false;
    return currentVideo.subs_l2.some((l) => l.starttime < currentTime - 0.3);
  }, [currentVideo, currentTime]);

  const hasNextLine = useMemo(() => {
    if (!currentVideo) return false;
    return currentVideo.subs_l2.some((l) => l.starttime > currentTime + 0.3);
  }, [currentVideo, currentTime]);

  // ── Loading ──
  if (loading) {
    return (
      <View className="my-4 items-center justify-center py-8">
        <ActivityIndicator size="large" color={ICON_MUTED} />
      </View>
    );
  }

  // ── Error ──
  if (error) {
    return <ErrorNotice message={error} className="my-4" />;
  }

  // ── Empty ──
  if (videos.length === 0) {
    return (
      <View className="my-4 px-4">
        <Text className="text-sm text-muted-foreground">{t('msg.no_results')}</Text>
      </View>
    );
  }

  // Shared body for the bottom sheet (narrow) and centered dialog (md+).
  const listBody = (
    <>
      {/* Dialog header — close only; the "N videos matching …" header was
          dropped for web parity (SPEC-082 Task 14). */}
      <View className="mb-2 flex-row items-center justify-end border-b border-border pb-3">
        <Dialog.Close className="rounded-full bg-muted p-2">
          <X size={18} color={ICON_MUTED} />
        </Dialog.Close>
      </View>

      {/* Toolbar — text filter + sort chips (SPEC-082 Task 8). */}
      <View className="mb-2 gap-2">
        <TextInput
          value={listSearch}
          onChangeText={setListSearch}
          placeholder={t('placeholder.filter')}
          placeholderTextColor={ICON_MUTED}
          className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View className="flex-row gap-1.5">
            {SORT_OPTIONS.map((opt) => {
              const active = listSort === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  onPress={() => setListSort(opt.key)}
                  className={`rounded-full px-2.5 py-1 ${active ? 'bg-primary/10' : 'bg-muted'}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text className={`text-xs font-medium ${active ? 'text-primary' : 'text-muted-foreground'}`}>
                    {t(opt.labelKey)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </View>

      {/* Video list — driven by the same filtered/sorted array as the player
          queue, so the queue follows the displayed order (SPEC-082 Task 8).
          Left/right-context sorts render group headers (SPEC-082 Task 9). */}
      <FlatList
        data={listItems}
        keyExtractor={(item) => (item.kind === 'header' ? `h-${item.key}` : String(item.video.id))}
        style={isMd ? { flex: 1 } : undefined}
        viewabilityConfig={{ itemVisiblePercentThreshold: 10, minimumViewTime: 100 }}
        onViewableItemsChanged={({ viewableItems }) => {
          const first = viewableItems[0];
          if (first?.item?.kind === 'row' && first.item.videoIndex != null) {
            setListFirstVisible(first.item.videoIndex);
          }
        }}
        renderItem={({ item }) => {
          if (item.kind === 'header') {
            const collapsed = collapsedGroups.has(item.key);
            const hasBulkControls = item.isFirst && allGroupKeys && allGroupKeys.length > 1;
            return (
              <Pressable
                onPress={() => toggleGroup(item.key)}
                className="mb-1 flex-row items-center gap-2 rounded-lg border border-border bg-muted/60 px-2 py-1.5"
                accessibilityRole="button"
                accessibilityState={{ expanded: !collapsed }}
              >
                {collapsed ? (
                  <ChevronRight size={14} color={ICON_MUTED} />
                ) : (
                  <ChevronDown size={14} color={ICON_MUTED} />
                )}
                <View className="h-5 min-w-5 items-center justify-center rounded bg-primary/15 px-1">
                  <Text className="text-[11px] font-semibold text-primary">{item.key}</Text>
                </View>
                <Text className="flex-1 truncate text-[11px] font-medium text-muted-foreground">
                  {listSort === 'leftContext' ? t('title.leftContext') : t('title.rightContext')}
                </Text>
                <Text className="rounded-full bg-foreground/5 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {item.count}
                </Text>
                {hasBulkControls && (
                  <View className="flex-row items-center gap-2">
                    <Pressable
                      onPress={collapseAll}
                      hitSlop={4}
                      accessibilityRole="button"
                    >
                      <Text className="text-[10px] font-semibold text-primary">{t('action.collapse_all')}</Text>
                    </Pressable>
                    <Pressable
                      onPress={expandAll}
                      hitSlop={4}
                      accessibilityRole="button"
                    >
                      <Text className="text-[10px] font-semibold text-primary">{t('action.expand_all')}</Text>
                    </Pressable>
                  </View>
                )}
              </Pressable>
            );
          }

          const { videoIndex, video: listItem } = item;
          const ml = listItem.subs_l2[listItem.matchLineIndex];
          const isActive = videoIndex === currentIndex;
          return (
            <Pressable
              onPress={() => selectFromList(videoIndex)}
              className={`mb-2 flex-row gap-3 rounded-lg p-2 ${isActive ? 'bg-primary/5' : ''}`}
            >
              {/* Thumbnail */}
              <View className="h-12 w-20 overflow-hidden rounded bg-muted">
                <Image
                  source={{ uri: youtubeThumbnail(listItem.youtube_id) }}
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
                    {listItem.title}
                  </Text>
                  {listItem.duration != null && (
                    <Text className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                      {formatTime(listItem.duration)}
                    </Text>
                  )}
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-0.5">
                  <View>
                    <View className="flex-row">
                      {rowSegments[videoIndex]?.map((seg, j) => (
                        <Text
                          key={j}
                          className={`text-sm ${seg.hasTerm ? 'text-foreground' : 'text-muted-foreground'}`}
                        >
                          {j > 0 ? ' ' : ''}
                          <HighlightTerms line={seg.text} terms={highlightTerms} />
                        </Text>
                      ))}
                    </View>
                    {display.translation && (
                      <View className="mt-0.5 flex-row">
                        {rowSegments[videoIndex]?.map((seg, j) => {
                          const flatIdx = (translationInput.rowStarts[videoIndex] ?? 0) + j;
                          const translated = listTranslations[flatIdx]?.line;
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
        }}
      />
    </>
  );

  // ── Render ──
  return (
    <View
      className="my-4"
      onLayout={(e: LayoutChangeEvent) => setContainerWidth(e.nativeEvent.layout.width)}
    >
      {/* Nav bar — forms toggle, watch, list all (matches web) */}
      <View className="mb-2 flex-row items-center justify-center gap-2">
        {formCount > 1 && (
          <View className="flex-row items-center rounded-full bg-muted p-0.5">
            <Pressable
              onPress={() => onExactToggle?.(true)}
              className={`rounded-full px-2.5 py-0.5 ${exactMatch ? 'bg-primary/10' : ''}`}
              accessibilityLabel={t('msg.exact_match_searching_only', { term: headTerm || term, n: formCount })}
            >
              <Text className={`text-xs font-medium ${exactMatch ? 'text-primary' : 'text-muted-foreground'}`}>
                {headTerm || term}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => onExactToggle?.(false)}
              className={`rounded-full px-2.5 py-0.5 ${!exactMatch ? 'bg-primary/10' : ''}`}
              accessibilityLabel={t('msg.exact_match_searching', { n: formCount })}
            >
              <Text className={`text-xs font-medium ${!exactMatch ? 'text-primary' : 'text-muted-foreground'}`}>
                {t('msg.all_forms')}
              </Text>
            </Pressable>
          </View>
        )}
        <Pressable
          onPress={() => setListOpen(true)}
          className="flex-row items-center gap-1 rounded-full bg-muted px-3 py-1.5"
        >
          <List size={14} color={ICON_MUTED} />
          <Text className="text-xs font-medium text-muted-foreground">{t('action.list_all')}</Text>
        </Pressable>
      </View>

      {/* Content-filter pills (All / Non-Music / Music / TV Shows) — same
          segmented pattern as the forms toggle (SPEC-082 Task 6). */}
      <View className="mb-2 flex-row flex-wrap items-center justify-center gap-1.5">
        {FILTER_PILLS.map((pill) => {
          const active = videoFilter === pill.key;
          return (
            <Pressable
              key={pill.key}
              onPress={() => {
                setVideoFilter(pill.key);
                // The list may shrink — reset to the first result (web parity).
                setCurrentIndex(0);
              }}
              className={`rounded-full px-2.5 py-0.5 ${active ? 'bg-primary/10' : ''}`}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text className={`text-xs font-medium ${active ? 'text-primary' : 'text-muted-foreground'}`}>
                {t(pill.labelKey)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {!isPro && totalHits > FREE_SUBS_SEARCH_HITS && (
        <View className="flex-row items-center justify-between gap-2 border-b border-border bg-muted/30 px-3 py-2">
          <Text className="flex-1 text-xs text-muted-foreground">
            {t('msg.upgrade_to_pro_banner')}
          </Text>
          <Pressable onPress={() => router.push('/(tabs)/(me)/go-pro' as any)}>
            <Text className="text-xs font-semibold text-primary underline">
              {t('action.upgrade_to_pro')}
            </Text>
          </Pressable>
        </View>
      )}

      {/* Player */}
      <View style={{ width: containerWidth, height: videoHeight }} className="bg-black">
        <YouTubePlayer
          ref={playerRef}
          youtubeId={currentVideo!.youtube_id}
          onTimeUpdate={handleTimeUpdate}
          onDuration={handleDuration}
          onStateChange={handleStateChange}
          onError={handleVideoError}
          autoplay={autoplayEnabled}
          startTime={matchLine?.starttime}
          containerWidth={containerWidth}
        />
      </View>

      {/* Controls — centered; result count between prev/next line buttons */}
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
          onPreviousVideo={() => { if (currentIndex > 0) { setCurrentIndex((i) => i - 1); } }}
          onNextVideo={() => { if (currentIndex < filteredVideos.length - 1) { setCurrentIndex((i) => i + 1); } }}
          hasPreviousLine={hasPreviousLine}
          hasNextLine={hasNextLine}
          hasPreviousVideo={currentIndex > 0}
          hasNextVideo={currentIndex < filteredVideos.length - 1}
          videoCountText={t('msg.video_n_of_total', { n: currentIndex + 1, total: filteredVideos.length })}
        />
      </View>

      {/* Subtitle — action menu is attached inside TokenizedText blocks */}
      <View className="min-h-32 w-full">
        <SubtitleDisplay
          singleLine
          lines={subtitleInitialLines}
          activeLineIndex={activeLineIndex}
          currentTime={currentTime}
          highlightTerms={highlightTerms}
          defaultLine={defaultSubtitleLine}
          onSeekToLine={(t) => playerRef.current?.seekTo(t)}
        />
      </View>

      {/* ── Video List Dialog ── */}
      <Dialog.Root open={listOpen} onOpenChange={setListOpen}>
        <Dialog.Portal>
          {isMd ? (
            <View className="absolute inset-0 items-center justify-center px-4">
              <View
                className="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-background"
                style={{
                  height: Math.min(screenHeight * 0.75, 640),
                  // Inline shadow — see NavBar workaround for the css-interop crash.
                  shadowColor: ICON_MUTED,
                  shadowOpacity: 0.3,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 4 },
                  elevation: 8,
                }}
              >
                <View className="flex-1 p-4">{listBody}</View>
              </View>
            </View>
          ) : (
            <Dialog.SheetContent className="max-h-[85%]">
              {listBody}
            </Dialog.SheetContent>
          )}
        </Dialog.Portal>
      </Dialog.Root>
    </View>
  );
}
