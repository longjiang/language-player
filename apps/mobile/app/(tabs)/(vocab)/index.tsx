import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, FlatList, ActivityIndicator, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useT } from '@/hooks/use-t';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDictionaryContext } from '@/contexts/DictionaryContext';
import { useDictionary } from '@langplayer/api-client';
import { SearchBar } from '@/components/dictionary/SearchBar';
import { DictionaryEntryCard } from '@/components/dictionary/DictionaryEntryCard';
import { OfflineBanner } from '@/components/dictionary/OfflineBanner';
import { Search, BookOpen, Clock } from 'lucide-react-native';
import { ICON_MUTED } from '@/lib/theme-colors';
import type { DictionaryEntry } from '@langplayer/shared';
import { log, logwarn } from '@/lib/logger';
import { PageContainer } from '@/components/layout/PageContainer';

export default function DictionaryScreen() {
  const { l1Lang, l2Lang } = useLanguage();
  const t = useT();
  const router = useRouter();
  const {
    query, setQuery, results, loading, error, message,
    doSearch, clearSearch,
    recentSearches, clearRecent,
    setCameFromSearch, setSidebarSource, setDetailHead,
  } = useDictionaryContext();

  const dict = useDictionary();
  const dictRef = useRef(dict);
  dictRef.current = dict;

  // ── Autocomplete (English-definition matches, like web PersistentSearchBar) ──
  const [suggestions, setSuggestions] = useState<DictionaryEntry[] | null>(null);
  const [acLoading, setAcLoading] = useState(false);
  const [acOpen, setAcOpen] = useState(false);
  const acSeqRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced autocomplete: an English query also matches L2 entries by their
  // English definitions (byDefinition=true). Only touches local state — the
  // real search / recent list is only updated on submit or selection.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = query.trim();
    if (!trimmed) {
      setSuggestions(null);
      setAcOpen(false);
      setAcLoading(false);
      return;
    }
    const seq = ++acSeqRef.current;
    debounceRef.current = setTimeout(async () => {
      const l2Code = l2Lang.code.split('-')[0];
      setAcLoading(true);
      setAcOpen(true);
      try {
        const res = await dictRef.current.autocomplete(trimmed, l2Code, true);
        if (seq !== acSeqRef.current) return; // stale keystroke
        const list = res.results ?? [];
        setSuggestions(list);
        setAcOpen(list.length > 0);
      } catch (err) {
        if (seq === acSeqRef.current) {
          setSuggestions(null);
          setAcOpen(false);
          logwarn('[LP Mobile] dictionary autocomplete failed:', err);
        }
      } finally {
        if (seq === acSeqRef.current) setAcLoading(false);
      }
    }, 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, l2Lang.code]);

  // Selecting an autocomplete suggestion navigates to the entry, keeping the
  // suggestion list as the sidebar source so prev/next stay available.
  const handleSuggestionPress = useCallback((entry: DictionaryEntry) => {
    const items = (suggestions ?? []).map((e) => ({
      id: e.id,
      head: e.head,
      dictionaryId: e.dictionary?.id ?? 'llm',
      entryId: e.id,
      pronunciation: e.pronunciation,
      definition: e.definitions?.length ? e.definitions.join('; ') : undefined,
    }));
    setDetailHead(entry.head);
    setSidebarSource({ kind: 'wordlist', items, currentId: entry.id, source: 'search' });
    setCameFromSearch(true);
    setSuggestions(null);
    setAcOpen(false);
    const safeId = entry.id.replace(/,/g, '~');
    router.push(`word/${safeId}` as any);
  }, [suggestions, setDetailHead, setSidebarSource, setCameFromSearch, router]);

  const handleSearch = () => {
    setSuggestions(null);
    setAcOpen(false);
    if (query.trim()) doSearch(query.trim());
  };

  const handleClear = () => {
    setSuggestions(null);
    setAcOpen(false);
    clearSearch();
  };

  // Called when user taps a search result card.
  // Flow: set context state so WordDetailScreen can find the entry,
  // then navigate via expo-router to the word detail screen.
  // CEDICT entries have comma-containing IDs (e.g. "寬廣,kuān_guǎng,0").
  // Commas break expo-router, so we encode them as ~ (matching Next.js buildEntryRoute).
  // WordDetailScreen reverses this before calling the API.
  // DEBUG: Verbose logging to trace the tap → navigation → detail chain.
  // If handleEntryPress never fires, the bug is upstream (card Pressable).
  const handleEntryPress = (entry: DictionaryEntry) => {
    log('[Dict] handleEntryPress — entry:', JSON.stringify({ id: entry.id, head: entry.head }), '— timestamp:', Date.now());
    setDetailHead(entry.head);
    log('[Dict] handleEntryPress — setDetailHead done');
    setSidebarSource({ kind: 'results', items: results! });
    log('[Dict] handleEntryPress — setSidebarSource done');
    setCameFromSearch(true);
    log('[Dict] handleEntryPress — setCameFromSearch done, pushing route...');
    // Encode commas for expo-router compatibility
    const safeId = entry.id.replace(/,/g, '~');
    router.push(`word/${safeId}` as any);
    log('[Dict] handleEntryPress — router.push called, safeId:', safeId);
  };

  return (
    <PageContainer maxWidth="7xl">
      <View className="px-4 py-5">
        <Text className="text-xl font-bold text-foreground">{t('title.dictionary')}</Text>
      </View>

      <View className="px-4 pt-2">
        <SearchBar
          value={query}
          onChangeText={setQuery}
          onSubmit={handleSearch}
          onClear={handleClear}
          loading={loading}
        />
      </View>

      {/* Autocomplete dropdown — English-definition matches ("meal" → 饭/餐/meal) */}
      {acOpen && (
        <View className="mx-4 mt-2 max-h-96 overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
          {acLoading ? (
            <View className="items-center justify-center py-4">
              <ActivityIndicator size="small" color={ICON_MUTED} />
            </View>
          ) : (
            <ScrollView className="p-2">
              {(suggestions ?? []).map((entry) => (
                <DictionaryEntryCard
                  key={entry.id}
                  entry={entry}
                  variant="compact"
                  l2Code={l2Lang.code}
                  l1Code={l1Lang.code}
                  onPress={handleSuggestionPress}
                />
              ))}
            </ScrollView>
          )}
        </View>
      )}

      {error && (
        <View className="mx-4 mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
          <Text className="text-sm text-destructive">{error}</Text>
        </View>
      )}

      <OfflineBanner />

      {loading && (
        <ActivityIndicator size="large" color={ICON_MUTED} style={{ marginTop: 40 }} />
      )}

      {/* Empty state: recent searches (matches Next.js) */}
      {!query && !loading && !results?.length && recentSearches.length > 0 && (
        <View className="px-4 pt-4">
          <View className="rounded-xl border border-border bg-card p-5">
            <View className="mb-3 flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <Clock size={16} color={ICON_MUTED} />
                <Text className="text-sm font-medium text-muted-foreground">
                  {t('title.recent_searches')}
                </Text>
              </View>
              <Text className="text-xs text-primary" onPress={clearRecent}>
                {t('action.clear_recent_searches')}
              </Text>
            </View>
            {recentSearches.map((term) => (
              <Pressable
                key={term}
                onPress={() => { setSuggestions(null); setAcOpen(false); setQuery(term); doSearch(term); }}
                className="flex-row items-center gap-3 rounded-lg px-3 py-2 active:bg-muted/60"
              >
                <Clock size={14} color={ICON_MUTED} />
                <Text className="flex-1 text-sm text-foreground" numberOfLines={1}>
                  {term}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {/* Empty initial state (no recents) */}
      {!query && !loading && !results?.length && recentSearches.length === 0 && (
        <View className="mt-12 items-center px-8">
          <Search size={48} color={ICON_MUTED} style={{ marginBottom: 16 }} />
          <Text className="text-center text-muted-foreground">{t('title.dictionary')}</Text>
        </View>
      )}

      {message && !results?.length && !loading && (
        <View className="mx-4 mt-8 items-center">
          <Text className="text-muted-foreground">{message}</Text>
        </View>
      )}

      {/* Recent searches strip — shown above results when available */}
      {recentSearches.length > 0 && (
        <View className={`px-4 ${results?.length ? 'pt-1' : 'pt-4'}`}>
          <View className="flex-row items-center gap-2">
            <Clock size={12} color={ICON_MUTED} />
            <Text className="text-xs text-muted-foreground">{t('title.recent_searches')}</Text>
          </View>
          <View className="mt-1.5 flex-row flex-wrap gap-2">
            {recentSearches.map((term) => (
              <Pressable
                key={term}
                onPress={() => { setSuggestions(null); setAcOpen(false); setQuery(term); doSearch(term); }}
                className="rounded-full bg-muted/50 px-3 py-1"
              >
                <Text className="text-xs text-muted-foreground" numberOfLines={1}>{term}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {results && results.length > 0 && (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View className="px-4 py-1"
              onTouchEnd={() => log('[Dict] FlatList item touch — id:', item.id, 'head:', item.head)}>
              <DictionaryEntryCard entry={item} onPress={handleEntryPress} l2Code={l2Lang.code} />
            </View>
          )}
          className="mt-2"
        />
      )}
    </PageContainer>
  );
}
