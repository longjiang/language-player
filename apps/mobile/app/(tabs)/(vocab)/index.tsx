import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, FlatList, ActivityIndicator, ScrollView } from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useT } from '@/hooks/use-t';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDictionaryContext } from '@/contexts/DictionaryContext';
import { useDictionary } from '@langplayer/api-client';
import { SearchBar } from '@/components/dictionary/SearchBar';
import { DictionaryEntryCard } from '@/components/dictionary/DictionaryEntryCard';
import { OfflineBanner } from '@/components/dictionary/OfflineBanner';
import { ErrorNotice } from '@/components/ui/error-notice';
import { autocompleteOffline } from '@/lib/dictionary-db';
import { isOfflineModeEnabled } from '@/lib/offline-mode';
import { setCachedEntryById } from '@/lib/dictionary-cache';
import { Search, BookOpen, Clock } from 'lucide-react-native';
import { ICON_MUTED } from '@/lib/theme-colors';
import { SUPPORTED_L2S, type DictionaryEntry } from '@langplayer/shared';
import { log, logwarn } from '@/lib/logger';
import { PageContainer } from '@/components/layout/PageContainer';
import { OfflineFeatureNotice } from '@/components/OfflineFeatureNotice';

export default function DictionaryScreen() {
  const { l1Lang, l2Lang, setL2Lang } = useLanguage();
  const t = useT();
  const router = useRouter();
  const { query: queryParam, l2: l2Param } = useLocalSearchParams<{
    query?: string;
    l2?: string;
  }>();
  const {
    query, setQuery, results, loading, error, message,
    doSearch, clearSearch,
    recentSearches, clearRecent, saveRecentTerm,
    setCameFromSearch, setSidebarSource, setDetailHead,
  } = useDictionaryContext();

  const dict = useDictionary();
  const dictRef = useRef(dict);
  dictRef.current = dict;

  // Deep links can carry ?l2=... (SPEC-069) — persist the override so the
  // header and dictionary state agree with the linked content.
  const requestedL2 =
    typeof l2Param === 'string' &&
    (SUPPORTED_L2S as readonly string[]).includes(l2Param.trim())
      ? l2Param.trim()
      : null;
  useEffect(() => {
    if (requestedL2 && requestedL2 !== l2Lang.code) {
      setL2Lang(requestedL2);
    }
  }, [requestedL2, l2Lang.code, setL2Lang]);

  // Web /dictionary/word/[word] links (SPEC-069) seed the search box.
  useEffect(() => {
    const q = typeof queryParam === 'string' ? queryParam.trim() : '';
    if (!q) return;
    setQuery(q);
    doSearch(q);
  }, [queryParam, setQuery, doSearch]);

  // ── Autocomplete (English-definition matches, like web PersistentSearchBar) ──
  const [suggestions, setSuggestions] = useState<DictionaryEntry[] | null>(null);
  const [acLoading, setAcLoading] = useState(false);
  const [acOpen, setAcOpen] = useState(false);
  const acSeqRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const redirectingRef = useRef(false);

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
      const applyResults = (list: DictionaryEntry[]) => {
        if (seq !== acSeqRef.current) return;
        setSuggestions(list);
        setAcOpen(list.length > 0);
      };

      // Offline Mode blocks the server autocomplete endpoint — use the
      // downloaded dictionary instead.
      if (isOfflineModeEnabled()) {
        try {
          const list = await autocompleteOffline(l2Code, trimmed);
          applyResults(list);
        } catch (err) {
          logwarn('[LP Mobile] offline dictionary autocomplete failed:', err);
          if (seq === acSeqRef.current) {
            setSuggestions(null);
            setAcOpen(false);
          }
        } finally {
          if (seq === acSeqRef.current) setAcLoading(false);
        }
        return;
      }

      try {
        const res = await dictRef.current.autocomplete(trimmed, l2Code, true);
        applyResults(res.results ?? []);
      } catch (err) {
        if (seq === acSeqRef.current) {
          logwarn('[LP Mobile] dictionary autocomplete failed:', err);
          // Network failed (offline, flaky, etc.) — fall back to the
          // downloaded dictionary so autocomplete still works.
          try {
            const list = await autocompleteOffline(l2Code, trimmed);
            applyResults(list);
          } catch (offlineErr) {
            logwarn('[LP Mobile] offline dictionary autocomplete fallback failed:', offlineErr);
            if (seq === acSeqRef.current) {
              setSuggestions(null);
              setAcOpen(false);
            }
          }
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
    // Remember the looked-up term even though no search was submitted.
    void saveRecentTerm(entry.head);
    const safeId = entry.id.replace(/,/g, '~');
    setCachedEntryById(l2Lang.code, entry);
    setCachedEntryById(l2Lang.code.split('-')[0], entry);
    log('[Dict] autocomplete suggestion tapped — id:', entry.id, 'head:', entry.head, 'route:', `word/${safeId}`);
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

  // Mirror web: a search returning exactly one entry goes straight to the
  // entry detail page. `push` keeps the search page beneath the detail page
  // (swipe-from-left returns to it), and redirectingRef prevents repeat
  // navigations for the same result set.
  useEffect(() => {
    if (!loading && !error && results && results.length === 1 && !redirectingRef.current) {
      redirectingRef.current = true;
      const entry = results[0]!;
      setDetailHead(entry.head);
      setSidebarSource({ kind: 'results', items: results });
      setCameFromSearch(true);
      const safeId = entry.id.replace(/,/g, '~');
      log('[Dict] single result — auto-redirecting to entry:', entry.id);
      router.push(`word/${safeId}` as any);
    }
    if (!results || results.length !== 1) {
      redirectingRef.current = false;
    }
  }, [results, loading, error, setDetailHead, setSidebarSource, setCameFromSearch, router]);

  return (
    <PageContainer maxWidth="7xl">
      <View className="px-4 py-5">
        <Text className="text-xl font-bold text-foreground">{t('title.dictionary')}</Text>
      </View>
      <OfflineFeatureNotice l2Code={l2Lang.code} requiresDictionary />

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
        <ErrorNotice message={error} className="mx-4 mt-4" />
      )}

      <OfflineBanner />

      {loading && (
        <ActivityIndicator size="large" color={ICON_MUTED} style={{ marginTop: 40 }} />
      )}

      {/* Empty state: recent searches (hidden while autocomplete is open) */}
      {!acOpen && !query && !loading && !results?.length && recentSearches.length > 0 && (
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
        <View className="mx-4 mt-4 items-center rounded-xl border border-border bg-card p-8">
          <Search size={48} color={ICON_MUTED} />
          <Text className="mt-4 text-center text-base text-muted-foreground">
            {t('msg.dictionary_empty_state', { l2: l2Lang.name })}
          </Text>
        </View>
      )}

      {message && !results?.length && !loading && (
        <View className="mx-4 mt-8 items-center">
          <Text className="text-base text-muted-foreground">{message}</Text>
        </View>
      )}

      {!acOpen && results && results.length > 0 && (
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
