import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, Pressable, TextInput, SectionList, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDictionaryContext } from '@/contexts/DictionaryContext';
import { useSavedWords } from '@/hooks/use-saved-words';
import { useT } from '@/hooks/use-t';
import { decomposeWordId } from '@langplayer/shared';
import { BookmarkCheck, BookOpen, Search, ArrowUpDown, Clock, ArrowDownAZ, Trash2, Download } from 'lucide-react-native';
import { ICON_MUTED } from '@/lib/theme-colors';

type SortMode = 'newest' | 'alpha';

export default function SavedWordsScreen() {
  const { l1Lang, l2Lang } = useLanguage();
  const { setDetailHead, setSidebarSource, setCameFromSearch } = useDictionaryContext();
  const { savedWords, removeWord, clearAll, loaded } = useSavedWords();
  const router = useRouter();
  const t = useT();

  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [filterText, setFilterText] = useState('');

  const allWords = useMemo(
    () => savedWords[l2Lang.code] ?? [],
    [savedWords, l2Lang.code],
  );

  // Filter + sort
  const words = useMemo(() => {
    let result = [...allWords];

    if (filterText.trim()) {
      const q = filterText.trim().toLowerCase();
      result = result.filter((w) => {
        const display = (w.head || w.forms?.[0] || w.id).toLowerCase();
        return display.includes(q);
      });
    }

    // Sort: Classic uses `date` (millis), mobile-v2 uses `savedAt` (ISO string)
    const getTs = (w: typeof allWords[number]) =>
      w.date ?? new Date(w.savedAt ?? 0).getTime();

    if (sortMode === 'alpha') {
      const getName = (w: typeof allWords[number]) => w.head || w.forms?.[0] || w.id;
      result.sort((a, b) => getName(a).localeCompare(getName(b)));
    } else {
      result.sort((a, b) => getTs(b) - getTs(a));
    }

    return result;
  }, [allWords, filterText, sortMode]);

  // Group by Today / Earlier (matches Next.js)
  const sections = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const today: typeof words = [];
    const earlier: typeof words = [];
    for (const w of words) {
      const d = w.date ?? new Date(w.savedAt ?? 0).getTime();
      if (d >= startOfToday) today.push(w); else earlier.push(w);
    }
    const result: { title: string; data: typeof words }[] = [];
    if (today.length > 0) result.push({ title: 'Today', data: today });
    if (earlier.length > 0) result.push({ title: 'Earlier', data: earlier });
    return result;
  }, [words]);

  const handleWordPress = useCallback((word: typeof allWords[number]) => {
    const decomposed = decomposeWordId(word.id, l2Lang.code);
    if (!decomposed) return;
    setDetailHead(word.head || word.forms?.[0] || '');
    setSidebarSource({ kind: 'saved' });
    setCameFromSearch(false);
    const safeId = word.id.replace(/,/g, '~');
    router.push(`word/${safeId}` as any);
  }, [l2Lang.code, setDetailHead, setSidebarSource, setCameFromSearch, router]);

  const handleRemove = useCallback((word: typeof allWords[number]) => {
    removeWord(l2Lang.code, word.id);
  }, [l2Lang.code, removeWord]);

  const handleClearAll = useCallback(() => {
    clearAll(l2Lang.code);
  }, [l2Lang.code, clearAll]);

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
            Click the bookmark icon next to any word to save it.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      {/* Header row — title + export + clear */}
      <View className="flex-row items-center justify-between px-4 py-5">
        <View className="flex-1">
          <Text className="text-2xl font-bold text-foreground">{t('title.saved_words')}</Text>
          <Text className="mt-1 text-sm text-muted-foreground">
            {allWords.length} {allWords.length === 1 ? 'word' : 'words'} in {l1Lang.name} → {l2Lang.name}
          </Text>
        </View>
        <View className="flex-row gap-2">
          <Pressable className="flex-row items-center gap-1 rounded-md border border-border px-2.5 py-1.5">
            <Download size={14} color={ICON_MUTED} />
            <Text className="text-xs text-muted-foreground">{t('action.export')}</Text>
          </Pressable>
          <Pressable onPress={handleClearAll} className="flex-row items-center gap-1 rounded-md border border-border px-2.5 py-1.5">
            <Trash2 size={14} color={ICON_MUTED} />
            <Text className="text-xs text-muted-foreground">{t('action.clear_all')}</Text>
          </Pressable>
        </View>
      </View>

      {/* Toolbar: filter + sort */}
      <View className="flex-row items-center gap-3 px-4 pb-3">
        <View className="flex-1 flex-row items-center rounded-lg border border-border bg-background px-3 py-2">
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

        <Pressable
          onPress={() => setSortMode((m) => m === 'newest' ? 'alpha' : 'newest')}
          className="flex-row items-center gap-1.5 rounded-md border border-border px-3 py-2"
        >
          <ArrowUpDown size={14} color={ICON_MUTED} />
          {sortMode === 'newest' ? (
            <>
              <Clock size={14} color={ICON_MUTED} />
              <Text className="text-xs text-muted-foreground">{t('sort.newest')}</Text>
            </>
          ) : (
            <>
              <ArrowDownAZ size={14} color={ICON_MUTED} />
              <Text className="text-xs text-muted-foreground">{t('sort.alphabetical')}</Text>
            </>
          )}
        </Pressable>
      </View>

      {/* Word list with sections */}
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <View className="bg-muted/50 px-4 py-1.5">
            <Text className="text-xs font-medium text-muted-foreground">{section.title}</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => handleWordPress(item)}
            className="flex-row items-center border-b border-border px-4 py-3 active:bg-muted"
          >
            {/* Remove button (bookmark icon like Next.js) */}
            <Pressable onPress={() => handleRemove(item)} className="mr-3" hitSlop={8}>
              <BookmarkCheck size={20} color={ICON_MUTED} />
            </Pressable>

            {/* Content */}
            <View className="flex-1">
              <Text className="text-base font-medium text-foreground">
                {item.head || item.forms?.[0] || item.id}
              </Text>
              <Text className="mt-0.5 text-xs text-muted-foreground">
                {item.dictionaryId ? `${item.dictionaryId} • ` : ''}{item.id}
                {(() => {
                  const ts = item.date ?? new Date(item.savedAt ?? 0).getTime();
                  return ts ? ` • ${new Date(ts).toLocaleDateString()}` : '';
                })()}
              </Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
