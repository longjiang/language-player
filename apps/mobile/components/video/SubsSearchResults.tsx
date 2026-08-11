import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { View, Text, Image, Pressable, FlatList, ScrollView, ActivityIndicator, useWindowDimensions, LayoutChangeEvent } from 'react-native';
import { useRouter } from 'expo-router';
import * as Dialog from '@/components/ui/dialog';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useT } from '@/hooks/use-t';
import { useResponsive } from '@/hooks/use-responsive';
import { useVideos } from '@langplayer/api-client';
import { parseSubsL2, findMatchLine } from '@langplayer/utils';
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
import { List, X, Play } from 'lucide-react-native';

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

/** Simple highlight of search terms inside a subtitle segment. */
function HighlightTerms({ line, terms }: { line: string; terms: string[] }) {
  const term = firstMatchingForm(line, terms);
  if (!term) return <Text>{line}</Text>;
  const idx = line.toLowerCase().indexOf(term.toLowerCase());
  if (idx < 0) return <Text>{line}</Text>;
  return (
    <Text>
      {line.slice(0, idx)}
      <Text className="font-semibold text-primary">{line.slice(idx, idx + term.length)}</Text>
      {line.slice(idx + term.length)}
    </Text>
  );
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

  const [videos, setVideos] = useState<SubsSearchVideo[]>([]);
  const [totalHits, setTotalHits] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [paused, setPaused] = useState(true);
  const [listOpen, setListOpen] = useAnimatedBoolean();
  /** First visible row in the show-all list — drives lazy translation. */
  const [listFirstVisible, setListFirstVisible] = useState(0);

  const currentVideo = videos[currentIndex] ?? null;
  const matchLine = currentVideo?.subs_l2[currentVideo.matchLineIndex] ?? null;

  // Split comma-separated terms for highlighting
  const highlightTerms = useMemo(
    () => term.split(',').map((t) => t.trim()).filter(Boolean),
    [term],
  );

  const applyVideos = useCallback((all: SubsSearchVideo[]) => {
    setTotalHits(all.length);
    setVideos(isPro ? all : all.slice(0, FREE_SUBS_SEARCH_HITS));
  }, [isPro]);

  // Truncated display: "a, b, c, and X other forms" (localized).
  const termDisplay = useMemo(() => {
    const forms = highlightTerms;
    if (forms.length <= 3) return forms.join(', ');
    const shown = forms.slice(0, 3).join(', ');
    const remaining = forms.length - 3;
    return `${shown} ${t('msg.and_n_other_forms', { n: remaining })}`;
  }, [highlightTerms, t]);

  // Per-row context segments (prev + match + next) for the show-all list,
  // mirroring web so translations can be requested per segment.
  const rowSegments = useMemo(
    () =>
      videos.map((video) => {
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
    [videos, highlightTerms],
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

  // ── Seek to match on video change ──
  useEffect(() => {
    if (currentVideo && matchLine) {
      const timer = setTimeout(() => {
        playerRef.current?.seekTo(matchLine.starttime);
        playerRef.current?.play();
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [currentIndex, currentVideo?.youtube_id]);

  // ── Player callbacks ──
  const handleTimeUpdate = useCallback((time: number) => setCurrentTime(time), []);
  const handleDuration = useCallback((d: number) => setDuration(d), []);
  const handleStateChange = useCallback((state: string) => {
    setPaused(state !== 'playing');
  }, []);

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

  const handleWatch = useCallback(() => {
    if (currentVideo) {
      router.push(`/(tabs)/(media)/watch/${currentVideo.youtube_id}` as any);
    }
  }, [currentVideo, router]);

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
      {/* Dialog header */}
      <View className="flex-row items-center justify-between border-b border-border pb-3 mb-2">
        <Dialog.Title>{t('msg.videos_matching', { searchTerm: termDisplay })}</Dialog.Title>
        <Dialog.Close className="rounded-full bg-muted p-2">
          <X size={18} color={ICON_MUTED} />
        </Dialog.Close>
      </View>

      {/* Video list */}
      <FlatList
        data={videos}
        keyExtractor={(v) => String(v.id)}
        style={isMd ? { flex: 1 } : undefined}
        viewabilityConfig={{ itemVisiblePercentThreshold: 10, minimumViewTime: 100 }}
        onViewableItemsChanged={({ viewableItems }) => {
          const first = viewableItems[0];
          if (first?.index != null) setListFirstVisible(first.index);
        }}
        renderItem={({ item, index }) => {
          const ml = item.subs_l2[item.matchLineIndex];
          const isActive = index === currentIndex;
          return (
            <Pressable
              onPress={() => selectFromList(index)}
              className={`mb-2 flex-row gap-3 rounded-lg p-2 ${isActive ? 'bg-primary/5' : ''}`}
            >
              {/* Thumbnail */}
              <View className="h-12 w-20 overflow-hidden rounded bg-muted">
                <Image
                  source={{ uri: youtubeThumbnail(item.youtube_id) }}
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
                <Text className="text-xs font-medium text-foreground" numberOfLines={1}>
                  {item.title}
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-0.5">
                  <View>
                    <View className="flex-row">
                      {rowSegments[index]?.map((seg, j) => (
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
                        {rowSegments[index]?.map((seg, j) => {
                          const flatIdx = (translationInput.rowStarts[index] ?? 0) + j;
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
          onPress={handleWatch}
          className="flex-row items-center gap-1 rounded-full bg-muted px-3 py-1.5"
        >
          <Play size={14} color={ICON_MUTED} />
          <Text className="text-xs font-medium text-muted-foreground">{t('action.watch')}</Text>
        </Pressable>
        <Pressable
          onPress={() => setListOpen(true)}
          className="flex-row items-center gap-1 rounded-full bg-muted px-3 py-1.5"
        >
          <List size={14} color={ICON_MUTED} />
          <Text className="text-xs font-medium text-muted-foreground">{t('action.list_all')}</Text>
        </Pressable>
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
          onPreviousVideo={() => { if (currentIndex > 0) setCurrentIndex((i) => i - 1); }}
          onNextVideo={() => { if (currentIndex < videos.length - 1) setCurrentIndex((i) => i + 1); }}
          hasPreviousLine={hasPreviousLine}
          hasNextLine={hasNextLine}
          hasPreviousVideo={currentIndex > 0}
          hasNextVideo={currentIndex < videos.length - 1}
          videoCountText={t('msg.video_n_of_total', { n: currentIndex + 1, total: videos.length })}
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
