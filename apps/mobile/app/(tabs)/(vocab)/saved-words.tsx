import React, { useMemo, useState, useCallback, useRef } from 'react';
import { View, Text, TextInput, FlatList, ActivityIndicator, Alert } from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import { useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDictionaryContext } from '@/contexts/DictionaryContext';
import { useSavedWords } from '@/hooks/use-saved-words';
import { useT } from '@/hooks/use-t';
import { useResponsive } from '@/hooks/use-responsive';
import { gridColumnCount } from '@/lib/constants';
import { decomposeWordId } from '@langplayer/shared';
import { Search, Trash2, Download, BookOpen } from 'lucide-react-native';
import { ICON_MUTED } from '@/lib/theme-colors';
import { logwarn } from '@/lib/logger';
import { PageContainer } from '@/components/layout/PageContainer';
import { OfflineFeatureNotice } from '@/components/OfflineFeatureNotice';
import { SavedWordEntryCard } from '@/components/dictionary/SavedWordEntryCard';

/** Lazy enrichment: only fetch dictionary entries for rows visible on screen. */
const ENRICH_BUFFER = 20; // enrich visible + this many extra rows below

export default function SavedWordsScreen() {
  const { l1Lang, l2Lang } = useLanguage();
  const { setDetailHead, setSidebarSource, setCameFromSearch } = useDictionaryContext();
  const { savedWords, removeWord, clearAll, loaded, refreshEntry } = useSavedWords(l2Lang.code);
  const router = useRouter();
  const t = useT();
  const { width: screenWidth } = useResponsive();

  // Responsive tiling like the explore/media grid (item 2.4).
  // Phones stay single-column; tablets/desktop tile.
  const numColumns = gridColumnCount(screenWidth);

  const [filterText, setFilterText] = useState('');
  const [exporting, setExporting] = useState(false);

  const allWords = useMemo(
    () => savedWords[l2Lang.code] ?? [],
    [savedWords, l2Lang.code],
  );

  // Filter + keep newest-first order (matches Next.js — sort toggle removed).
  const words = useMemo(() => {
    let result = [...allWords];

    if (filterText.trim()) {
      const q = filterText.trim().toLowerCase();
      result = result.filter((w) => {
        const display = (w.head || w.forms?.[0] || w.id).toLowerCase();
        return display.includes(q);
      });
    }

    const getTs = (w: typeof allWords[number]) =>
      w.date ?? new Date(w.savedAt ?? 0).getTime();
    result.sort((a, b) => getTs(b) - getTs(a));
    return result;
  }, [allWords, filterText]);

  // Group by Today / Earlier (matches Next.js) and flatten into a row-based
  // model for responsive tiling: each element is either a section header or a
  // chunk of `numColumns` words rendered side-by-side.
  const rows = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const today: typeof words = [];
    const earlier: typeof words = [];
    for (const w of words) {
      const d = w.date ?? new Date(w.savedAt ?? 0).getTime();
      if (d >= startOfToday) today.push(w); else earlier.push(w);
    }
    const groups: { title: string; data: typeof words }[] = [];
    if (today.length > 0) groups.push({ title: t('msg.today'), data: today });
    if (earlier.length > 0) groups.push({ title: t('msg.earlier'), data: earlier });

    type Row =
      | { kind: 'header'; title: string; count: number }
      | { kind: 'words'; items: typeof words };
    const out: Row[] = [];
    for (const g of groups) {
      out.push({ kind: 'header', title: g.title, count: g.data.length });
      for (let i = 0; i < g.data.length; i += numColumns) {
        out.push({ kind: 'words', items: g.data.slice(i, i + numColumns) });
      }
    }
    return out;
  }, [words, t, numColumns]);

  const handleWordPress = useCallback((word: typeof allWords[number]) => {
    const decomposed = decomposeWordId(word.id, l2Lang.code);
    if (!decomposed) return;
    setDetailHead(word.head || word.forms?.[0] || '');
    // Surface the saved-words list in the entry-page sidebar (like web's
    // setWordListNav with source 'saved') so prev/next stay available.
    setSidebarSource({
      kind: 'wordlist',
      source: 'saved',
      currentId: word.id,
      items: words.map((w) => {
        const dec = decomposeWordId(w.id, l2Lang.code);
        return {
          id: w.id,
          head: w.head || w.forms?.[0] || w.id,
          dictionaryId: dec?.dict ?? 'unknown',
          entryId: dec?.id ?? w.id,
        };
      }),
    });
    setCameFromSearch(false);
    const safeId = word.id.replace(/,/g, '~');
    router.push(`word/${safeId}` as any);
  }, [l2Lang.code, words, setDetailHead, setSidebarSource, setCameFromSearch, router]);

  const handleRemove = useCallback((word: typeof allWords[number]) => {
    removeWord(l2Lang.code, word.id);
  }, [l2Lang.code, removeWord]);

  const handleClearAll = useCallback(() => {
    clearAll(l2Lang.code);
  }, [l2Lang.code, clearAll]);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const json = JSON.stringify(savedWords, null, 2);
      const fileName = `saved-words-${l2Lang.code}.json`;
      const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(fileUri, json, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        // Sharing not available (e.g., on simulator) — skip silently
        return;
      }
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/json',
        dialogTitle: t('action.export'),
        UTI: 'public.json',
      });
    } catch (err) {
      logwarn('[SavedWords] export failed:', err);
      Alert.alert(t('error.general'), t('error.something_went_wrong'));
    } finally {
      setExporting(false);
    }
  }, [savedWords, l2Lang.code, t]);

  // ── Lazy enrichment: only fetch dictionary entries for cards visible on screen ──
  const enrichedRef = useRef<Set<string>>(new Set());

  const handleViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: Array<{ item: { kind: string; items?: typeof words }; index: number | null }> }) => {
      const toEnrich = viewableItems.slice(0, ENRICH_BUFFER);
      for (const vi of toEnrich) {
        const row = vi.item;
        if (row.kind !== 'words' || !row.items) continue;
        for (const w of row.items) {
          if (w.head && (w.canonicalEntry || w.llmEntry)) continue; // already enriched
          if (enrichedRef.current.has(w.id)) continue; // already requested
          enrichedRef.current.add(w.id);
          refreshEntry(l2Lang.code, w.id, l1Lang.code);
        }
      }
    },
    [l1Lang.code, l2Lang.code, refreshEntry],
  );

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 10,
    minimumViewTime: 200,
  }).current;

  if (!loaded) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color={ICON_MUTED} />
      </View>
    );
  }

  // ── Empty state ──
  if (allWords.length === 0) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-8">
        <View className="w-full max-w-sm rounded-xl border border-dashed border-border p-12 items-center">
          <BookOpen size={48} color={ICON_MUTED} style={{ opacity: 0.5 }} />
          <Text className="mt-4 text-center text-lg text-muted-foreground">
            {t('msg.no_saved_words')}
          </Text>
          <Text className="mt-1 text-center text-sm text-muted-foreground/70">
            {t('msg.save_word_hint')}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <PageContainer maxWidth="7xl">
      <OfflineFeatureNotice l2Code={l2Lang.code} requiresDictionary />
      {/* Header row — title + export + clear */}
      <View className="flex-row items-center justify-between px-4 py-5">
        <View className="flex-1">
          <Text className="text-2xl font-bold text-foreground">{t('title.saved_words')}</Text>
          <Text className="mt-1 text-sm text-muted-foreground">
            {t('msg.saved_words_desc', { count: allWords.length, l2: l2Lang.name })}
          </Text>
        </View>
        <View className="flex-row gap-2">
          <Pressable
            onPress={handleExport}
            disabled={exporting || allWords.length === 0}
            className="flex-row items-center gap-1 rounded-md border border-border px-2.5 py-1.5"
          >
            {exporting ? (
              <ActivityIndicator size="small" color={ICON_MUTED} />
            ) : (
              <Download size={14} color={ICON_MUTED} />
            )}
            <Text className="text-xs text-muted-foreground">{t('action.export')}</Text>
          </Pressable>
          <Pressable onPress={handleClearAll} className="flex-row items-center gap-1 rounded-md border border-border px-2.5 py-1.5">
            <Trash2 size={14} color={ICON_MUTED} />
            <Text className="text-xs text-muted-foreground">{t('action.clear_all')}</Text>
          </Pressable>
        </View>
      </View>

      {/* Toolbar: filter only (sort toggle removed — always newest-first) */}
      <View className="flex-row items-center gap-3 px-4 pb-3">
        <View className="flex-row items-center rounded-lg border border-border bg-background px-3 py-2 flex-1">
          <Search size={14} color={ICON_MUTED} />
          <TextInput
            className="ml-2 flex-1 text-sm text-foreground"
            placeholder={t('placeholder.filter')}
            placeholderTextColor={ICON_MUTED}
            value={filterText}
            onChangeText={setFilterText}
          />
          {filterText ? (
            <Pressable onPress={() => setFilterText('')}>
              <Text className="text-muted-foreground">✕</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Tiled saved-word entry cards, grouped by Today / Earlier */}
      <FlatList
        data={rows}
        keyExtractor={(row, index) => `${row.kind}-${index}`}
        onViewableItemsChanged={handleViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        contentContainerStyle={{ paddingBottom: 16 }}
        renderItem={({ item }) => {
          if (item.kind === 'header') {
            return (
              <View className="mb-3 flex-row items-center gap-2 px-4 pt-1.5 pb-2">
                <Text className="text-lg font-semibold text-muted-foreground">{item.title}</Text>
                <View className="rounded-full bg-muted px-2 py-0.5">
                  <Text className="text-xs text-muted-foreground">{item.count}</Text>
                </View>
              </View>
            );
          }
          // Words row — tile cards horizontally, matching explore's grid.
          return (
            <View
              className="mb-3 flex-row px-4"
              style={numColumns > 1 ? { gap: 8 } : { gap: 0 }}
            >
              {item.items.map((w) => (
                <View
                  key={w.id}
                  style={{ width: `${100 / numColumns}%` as `${number}%` }}
                  className="px-0.5"
                >
                  <SavedWordEntryCard
                    word={w}
                    l1Code={l1Lang.code}
                    l2Code={l2Lang.code}
                    onClick={() => handleWordPress(w)}
                    onRemove={() => handleRemove(w)}
                  />
                </View>
              ))}
            </View>
          );
        }}
        ListEmptyComponent={
          words.length === 0 && filterText.trim() ? (
            <View className="mx-4 mt-6 rounded-lg border border-dashed p-8 items-center">
              <Text className="text-sm text-muted-foreground">{t('msg.no_results')}</Text>
            </View>
          ) : null
        }
      />
    </PageContainer>
  );
}
