import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, Animated, useWindowDimensions } from 'react-native';
import * as DialogPrimitive from '@rn-primitives/dialog';
import { useDictionary } from '@langplayer/api-client';
import { useLanguage } from '@/contexts/LanguageContext';
import { DictionaryEntryCard } from '@/components/dictionary/DictionaryEntryCard';
import { SaveButton } from '@/components/dictionary/SaveButton';
import { AiExplanation } from '@/components/dictionary/AiExplanation';
import { ImageSearchResults } from '@/components/dictionary/ImageSearchResults';
import {
  getCachedEntries,
  setCachedEntries,
  setCachedEntryById,
  getL1CachedEntries,
  setL1CachedEntry,
  bulkLookupWords,
} from '@/lib/dictionary-cache';
import { PYTHON_API_URL } from '@/lib/api-url';
import type { DictionaryEntry } from '@langplayer/shared';
import { baseCode } from '@langplayer/utils';
import { useRouter } from 'expo-router';
import { useDictionaryContext } from '@/contexts/DictionaryContext';
import { useT } from '@/hooks/use-t';

interface DictionaryPopupProps {
  visible: boolean;
  word: string;
  /** Lemma (dictionary form) to prioritize in lookup. Falls back to `word` if not set. */
  lemma?: string;
  /** Pronunciation from the lemmatizer, shown in [brackets] next to the headword. */
  tokenPron?: string | null;
  context?: string;
  onClose: () => void;
  onViewDetail?: (entry: DictionaryEntry, allResults: DictionaryEntry[]) => void;
}

/**
 * When the user's L1 is not English, swap the English batch-lookup results
 * for L1-translated entries (fetched once per entry and cached by id).
 */
async function applyL1Translations(
  entries: DictionaryEntry[],
  texts: string[],
  l2: string,
  l1: string,
  lookup: (text: string, l2: string, l1: string) => Promise<{ results?: DictionaryEntry[] }>,
): Promise<DictionaryEntry[]> {
  if (l1 === 'en' || entries.length === 0) return entries;

  const ids = entries.map((e) => e.id).filter(Boolean);
  const cached = getL1CachedEntries(l2, l1, ids);
  if (cached.length > 0) {
    const byId = new Map(cached.map((e) => [e.id, e]));
    return entries.map((e) => byId.get(e.id) ?? e);
  }

  for (const text of texts) {
    const res = await lookup(text, l2, l1);
    const translated = res.results ?? [];
    if (translated.length === 0) continue;
    for (const e of translated) setL1CachedEntry(l2, l1, e);
    const byId = new Map(translated.map((e) => [e.id, e]));
    return entries.map((e) => byId.get(e.id) ?? e);
  }

  return entries;
}

export function DictionaryPopup({
  visible,
  word,
  lemma,
  tokenPron,
  context,
  onClose,
  onViewDetail,
}: DictionaryPopupProps) {
  const { l1Lang, l2Lang } = useLanguage();
  // The shared dictionary cache and backend both key on the base L2 code
  // (e.g. "zh" not "zh-Hans"). Using the regional code here misses the cache
  // TokenizedText has already populated and can make the popup look empty.
  const l2 = baseCode(l2Lang.code);
  const dict = useDictionary();
  const t = useT();
  const router = useRouter();
  const { setDetailHead, setSidebarSource, setCameFromSearch } = useDictionaryContext();
  const { height: screenHeight } = useWindowDimensions();
  const [results, setResults] = useState<DictionaryEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Slide-up animation ──
  const slideAnim = useRef(new Animated.Value(screenHeight)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          damping: 30,
          stiffness: 300,
          mass: 0.8,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: screenHeight,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, screenHeight, slideAnim, overlayOpacity]);

  // ── Look up the word when the popup opens (cache-first) ──
  useEffect(() => {
    if (!visible || !word) return;
    let cancelled = false;
    setError(null);
    setResults(null);

    const l1 = l1Lang.code;
    const lookupWord = lemma && lemma !== word ? lemma : word;
    const alsoLookupSurface = lookupWord !== word;
    const textBatch = alsoLookupSurface ? [lookupWord, word] : [lookupWord];

    // Check cache first — show instantly if all texts are cached
    const allCached = textBatch.every((t) => getCachedEntries(l2, t) !== undefined);

    const finalize = async (merged: DictionaryEntry[]): Promise<DictionaryEntry[]> => {
      if (l1 === 'en' || merged.length === 0) return merged;
      const ids = merged.map((e) => e.id).filter(Boolean);
      const cachedL1 = getL1CachedEntries(l2, l1, ids);
      if (cachedL1.length > 0) {
        const byId = new Map(cachedL1.map((e) => [e.id, e]));
        return merged.map((e) => byId.get(e.id) ?? e);
      }
      return applyL1Translations(merged, textBatch, l2, l1, dict.lookup);
    };

    const run = async () => {
      if (allCached) {
        const primaryResults = getCachedEntries(l2, lookupWord) ?? [];
        const surfaceResults = alsoLookupSurface
          ? (getCachedEntries(l2, word) ?? []).filter(
              (entry: DictionaryEntry) => !primaryResults.some((p: DictionaryEntry) => p.id === entry.id),
            )
          : [];
        const merged = [...primaryResults, ...surfaceResults];
        // Index by ID for the detail page cache
        for (const e of merged) if (e.id) setCachedEntryById(l2, e);
        if (!cancelled) setResults(await finalize(merged));
        return;
      }

      // Cache miss — fetch from server
      setLoading(true);
      try {
        // Use bulkLookupWords to populate cache, then read from cache
        await bulkLookupWords(
          textBatch.map((text) => ({ text, l2Code: l2 })),
          PYTHON_API_URL,
        );

        const primaryResults = getCachedEntries(l2, lookupWord) ?? [];

        // Also individually fetch the surface form if it wasn't in the batch
        let surfaceResults: DictionaryEntry[] = [];
        if (alsoLookupSurface) {
          const surfaceCached = getCachedEntries(l2, word);
          if (surfaceCached) {
            surfaceResults = surfaceCached;
          } else {
            const surfaceRes = await dict.lookup(word, l2, l1);
            surfaceResults = surfaceRes.results ?? [];
            setCachedEntries(l2, word, surfaceResults);
          }
          surfaceResults = surfaceResults.filter(
            (entry: DictionaryEntry) => !primaryResults.some((p: DictionaryEntry) => p.id === entry.id),
          );
        }

        const merged = [...primaryResults, ...surfaceResults];
        // Index by ID for the detail page cache
        for (const e of merged) if (e.id) setCachedEntryById(l2, e);
        if (!cancelled) setResults(await finalize(merged));
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? t('error.general'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    return () => { cancelled = true; };
  }, [visible, word, lemma, l2Lang.code, l1Lang.code, dict, t]);

  const lemmaForm = lemma && lemma !== word ? lemma : null;

  // ── Force-mount so exit slide-down animation plays ──
  const [wasVisible, setWasVisible] = useState(false);
  useEffect(() => { if (visible) setWasVisible(true); }, [visible]);
  if (!visible && !wasVisible) return null;

  return (
    <DialogPrimitive.Root open={visible} onOpenChange={(open) => { if (!open) setTimeout(onClose, 250); }}>
      <DialogPrimitive.Portal>
        {/* Overlay */}
        <Animated.View
          pointerEvents={visible ? 'auto' : 'none'}
          className="absolute inset-0"
          style={{ opacity: overlayOpacity }}
        >
          <DialogPrimitive.Overlay
            className="absolute inset-0 bg-black/40"
            onPress={onClose}
          />
        </Animated.View>

        {/* Bottom sheet */}
        <Animated.View
          pointerEvents="box-none"
          className="absolute inset-x-0 bottom-0"
          style={{ transform: [{ translateY: slideAnim }] }}
        >
          <View
            testID="dictionary-popup"
            className="rounded-t-xl bg-background"
            style={{
              maxHeight: screenHeight * 0.75,
              minHeight: screenHeight * 0.35,
            }}
          >
            <View
              className="px-4 pt-4 pb-8"
              style={{ height: screenHeight * 0.75 }}
            >
              {/* Header — surface form as headline, lemma below when different */}
              <View className="mb-3 flex-row items-center justify-between">
                <View className="flex-1 mr-2">
                  <View className="flex-row items-baseline gap-2 flex-wrap">
                    <Text className="text-lg font-bold text-foreground" numberOfLines={1} testID="dictionary-popup-word">
                      {word}
                    </Text>
                    {tokenPron && (
                      <Text className="text-sm text-muted-foreground">[{tokenPron}]</Text>
                    )}
                  </View>
                  {lemmaForm && (
                    <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                      {t('label.lemma')}: {lemmaForm}
                    </Text>
                  )}
                </View>
                <Pressable
                  onPress={onClose}
                  className="rounded-full bg-muted p-1.5 active:opacity-70"
                  hitSlop={8}
                >
                  <Text className="text-base text-muted-foreground">✕</Text>
                </Pressable>
              </View>

              {/* Results */}
              <ScrollView
                className="flex-1"
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {/* AI Explanation — inside scrollable area, matching web + Classic */}
                <AiExplanation
                  word={word}
                  contextText={context}
                  entryFound={(results?.length ?? 0) > 0}
                />

                {/* Compact image strip — Openverse thumbnails for the looked-up term */}
                <View className="mb-3">
                  <ImageSearchResults
                    term={results?.[0]?.head ?? lemmaForm ?? word}
                    l2Code={l2}
                    l2Name={l2Lang.name}
                    l1Code={l1Lang.code}
                    variant="compact"
                  />
                </View>

                {loading && (
                  <View className="items-center py-12">
                    <ActivityIndicator size="large" className="text-primary" />
                    <Text className="mt-3 text-sm text-muted-foreground">
                      {t('msg.loading')}
                    </Text>
                  </View>
                )}

                {error && (
                  <View className="rounded-lg border border-red-200 bg-red-50 p-3">
                    <Text className="text-sm text-red-700">{error}</Text>
                  </View>
                )}

                {results && results.length === 0 && !loading && (
                  <View className="items-center py-12">
                    <Text className="text-muted-foreground">
                      {t('msg.no_results')}
                    </Text>
                  </View>
                )}

                {results?.map((entry) => (
                  <View key={entry.id} className="mb-2">
                    <DictionaryEntryCard
                      entry={entry}
                      variant="compact"
                      onPress={(e) => {
                        if (onViewDetail) {
                          onViewDetail(e, results ?? []);
                        } else {
                          const safeId = e.id.replace(/,/g, '~');
                          setDetailHead(e.head);
                          setSidebarSource({ kind: 'results', items: results ?? [] });
                          setCameFromSearch(true);
                          onClose();
                          router.push(`/word/${safeId}` as any);
                        }
                      }}
                      l2Code={l2}
                      saveButton={<SaveButton entry={entry} size={20} />}
                    />
                  </View>
                ))}
              </ScrollView>
            </View>
          </View>
        </Animated.View>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
