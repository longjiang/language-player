import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, Pressable, ActivityIndicator, TextInput } from 'react-native';
import { router } from 'expo-router';
import { useLanguage } from '@/contexts/LanguageContext';
import { useT } from '@/hooks/use-t';
import { useVideos, apiClient } from '@langplayer/api-client';
import { VideoCard } from '@/components/video/VideoCard';
import { Search, AlertCircle, Film, Tag } from 'lucide-react-native';
import type { YouTubeVideo } from '@langplayer/shared';

interface VideoTag {
  tag: string;
  video_count: number;
}

const YOUTUBE_URL_RE = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;

export default function SearchScreen() {
  const { l1Lang, l2Lang } = useLanguage();
  const t = useT();
  const videosApi = useVideos();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<YouTubeVideo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [tags, setTags] = useState<VideoTag[]>([]);
  const [tagsLoading, setTagsLoading] = useState(true);
  const [tagsExpanded, setTagsExpanded] = useState(false);

  const INITIAL_TAG_COUNT = 15;

  // Fetch popular tags
  useEffect(() => {
    let cancelled = false;
    setTagsLoading(true);
    apiClient.get<VideoTag[]>('/video-tags', {
      params: { l2: l2Lang.code, limit: 50, min_count: 2 },
    }).then((data) => {
      if (!cancelled) { setTags(data); setTagsLoading(false); }
    }).catch(() => {
      if (!cancelled) setTagsLoading(false);
    });
    return () => { cancelled = true; };
  }, [l2Lang.code]);

  const extractYouTubeID = (url: string): string | null => {
    const match = url.match(YOUTUBE_URL_RE);
    return (match && match[2]?.length === 11) ? match[2] : null;
  };

  const doSearch = useCallback(async (term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;

    const youtubeId = extractYouTubeID(trimmed);
    if (youtubeId) {
      router.push(`/(tabs)/(media)/watch/${youtubeId}` as any);
      return;
    }

    setLoading(true);
    setError(null);
    setResults(null);
    setHasSearched(true);

    try {
      const res = await videosApi.searchByTitle({ q: trimmed, l2: l2Lang.code, limit: 50 });
      setResults(Array.isArray(res) ? res : []);
    } catch (err: any) {
      setError(err?.message ?? t('error.something_went_wrong'));
    } finally {
      setLoading(false);
    }
  }, [videosApi, l2Lang.code, t]);

  const handleTagClick = (tag: string) => {
    setQuery(tag);
    doSearch(tag);
  };

  const visibleTags = tagsExpanded ? tags : tags.slice(0, INITIAL_TAG_COUNT);
  const hasResults = results && results.length > 0;

  return (
    <View className="flex-1 bg-background">
      <View className="px-4 py-5">
        <Text className="text-xl font-bold text-foreground">{t('title.search')}</Text>
      </View>

      {/* Search bar */}
      <View className="flex-row items-center gap-2 border-b border-border px-4 pb-2">
        <View className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <TextInput
            className="flex-1 rounded-lg border border-border bg-card py-2 pl-10 pr-3 text-sm text-foreground"
            placeholder={t('placeholder.search_dots')}
            placeholderTextColor="#888"
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => doSearch(query)}
            returnKeyType="search"
            autoCapitalize="none"
            autoFocus
          />
        </View>
        <Pressable
          onPress={() => doSearch(query)}
          disabled={loading || !query.trim()}
          className="rounded-lg bg-primary px-4 py-2 active:bg-primary/80"
        >
          <Text className="text-sm font-bold text-primary-foreground">{t('action.search')}</Text>
        </Pressable>
      </View>

      {/* YouTube URL hint */}
      {!hasSearched && !hasResults && (
        <Text className="mt-4 px-4 text-sm text-muted-foreground">{t('msg.paste_youtube_url')}</Text>
      )}

      {/* Tag cloud */}
      {!hasSearched && !hasResults && (
        <View className="mt-4 px-4">
          {tagsLoading ? (
            <ActivityIndicator size="small" className="text-primary" />
          ) : tags.length > 0 ? (
            <>
              <View className="mb-2 flex-row items-center gap-1">
                <Tag size={16} className="text-muted-foreground" />
                <Text className="text-sm text-muted-foreground">{t('title.tags')}</Text>
              </View>
              <View className="flex-row flex-wrap gap-1.5">
                {visibleTags.map((item) => (
                  <Pressable
                    key={item.tag}
                    onPress={() => handleTagClick(item.tag)}
                    className="rounded-full border border-border bg-muted/50 px-3 py-1 active:bg-primary/10"
                  >
                    <Text className="text-xs text-muted-foreground">#{item.tag}</Text>
                  </Pressable>
                ))}
              </View>
              {tags.length > INITIAL_TAG_COUNT && (
                <Pressable onPress={() => setTagsExpanded(!tagsExpanded)} className="mt-2">
                  <Text className="text-xs text-muted-foreground">
                    {tagsExpanded ? t('action.show_less') : t('action.show_more')}
                  </Text>
                </Pressable>
              )}
            </>
          ) : null}
        </View>
      )}

      {/* Loading */}
      {loading && <ActivityIndicator size="large" className="text-primary mt-8" />}

      {/* Error */}
      {error && (
        <View className="mx-4 mt-4 flex-row items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
          <AlertCircle size={16} className="text-destructive" />
          <Text className="text-sm text-destructive">{error}</Text>
        </View>
      )}

      {/* No results */}
      {hasSearched && !hasResults && !loading && !error && (
        <View className="mt-12 items-center px-8">
          <Film size={48} className="mb-4 text-muted-foreground/40" />
          <Text className="text-center text-muted-foreground">{t('msg.no_videos_found')}</Text>
        </View>
      )}

      {/* Results */}
      {hasResults && (
        <FlatList
          data={results!}
          keyExtractor={(item) => item.youtube_id}
          ListHeaderComponent={
            <Text className="mb-2 px-4 text-sm text-muted-foreground">
              {t('msg.result_count', { count: results!.length })} {t('msg.for_term', { term: query })}
            </Text>
          }
          renderItem={({ item }) => (
            <View className="px-4 pt-2">
              <VideoCard video={item} layout="list" />
            </View>
          )}
        />
      )}
    </View>
  );
}
