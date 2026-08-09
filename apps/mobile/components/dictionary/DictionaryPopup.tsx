import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, Animated, useWindowDimensions, Linking } from 'react-native';
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
import { lookupOfflineByL2 } from '@/lib/dictionary-db';
import { localizedError } from '@/lib/errors';
import { log } from '@/lib/logger';
import { ErrorNotice } from '@/components/ui/error-notice';
import type { DictionaryEntry } from '@langplayer/shared';
import { baseCode } from '@langplayer/utils';
import { useRouter } from 'expo-router';
import { useDictionaryContext } from '@/contexts/DictionaryContext';
import { useSyncStatus } from '@/contexts/SyncStatusContext';
import { useT } from '@/hooks/use-t';
import { useResponsive } from '@/hooks/use-responsive';
import { ExternalLink } from 'lucide-react-native';
import { ICON_MUTED, ICON_PRIMARY } from '@/lib/theme-colors';

interface DictionaryPopupProps {
  visible: boolean;
  word: string;
  /** Lemma (dictionary form) to prioritize in lookup. Falls back to `word` if not set. */
  lemma?: string;
  /** Pronunciation from the lemmatizer, shown in [brackets] next to the headword. */
  tokenPron?: string | null;
  context?: string;
  /** Optional link attached to the tapped token — shows "Open in Reader". */
  linkUrl?: string | null;
  /** Custom handler for the link action (e.g. in-book EPUB navigation). */
  onOpenLink?: (href: string) => void;
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
  const byId = new Map<string, DictionaryEntry>();
  for (const e of cached) if (e.id) byId.set(e.id, e);

  // Merge translations from every text in the batch (lemma + surface form)
  // so ALL entry cards get L1 definitions, not just the first lookup's hits.
  for (const text of texts) {
    const res = await lookup(text, l2, l1);
    const translated = res.results ?? [];
    for (const e of translated) {
      if (!e?.id) continue;
      byId.set(e.id, e);
      setL1CachedEntry(l2, l1, e);
    }
  }

  return byId.size > 0 ? entries.map((e) => byId.get(e.id) ?? e) : entries;
}

export function DictionaryPopup({
  visible,
  word,
  lemma,
  tokenPron,
  context,
  linkUrl,
  onOpenLink,
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
  const { status } = useSyncStatus();
  // `useDictionary()` and `useT()` return fresh objects/functions on every
  // render. Holding them in refs keeps the lookup effect stable so state
  // changes don't cancel and restart the dictionary fetch on every render.
  const dictRef = useRef(dict);
  dictRef.current = dict;
  const tRef = useRef(t);
  tRef.current = t;
  const router = useRouter();
  const { setDetailHead, setSidebarSource, setCameFromSearch } = useDictionaryContext();
  const { height: screenHeight } = useWindowDimensions();
  const { isMd } = useResponsive();
  const [results, setResults] = useState<DictionaryEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Slide-up animation ──
  const slideAnim = useRef(new Animated.Value(screenHeight)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        ...(isMd ? [] : [Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          damping: 30,
          stiffness: 300,
          mass: 0.8,
        })]),
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        ...(isMd ? [] : [Animated.timing(slideAnim, {
          toValue: screenHeight,
          duration: 200,
          useNativeDriver: true,
        })]),
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, screenHeight, slideAnim, overlayOpacity, isMd]);

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

    // Render English/batch results immediately, then upgrade to L1-translated
    // definitions in the background. Translation must never block the cards.
    const translateInBackground = async (merged: DictionaryEntry[]) => {
      if (l1 === 'en' || merged.length === 0) return;
      try {
        const translated = await applyL1Translations(merged, textBatch, l2, l1, dictRef.current.lookup);
        if (!cancelled) setResults(translated);
      } catch {
        // Keep the English results.
      }
    };

    // Log what the popup resolved for a token (surface, lemma, pronunciation,
    // and the entry ids/heads) so lookup mismatches traceable from Metro.
    const publishResults = (merged: DictionaryEntry[], source: string) => {
      for (const e of merged) if (e.id) setCachedEntryById(l2, e);
      if (!cancelled) {
        log(`🎙 POPUP-LOOKUP word=${JSON.stringify(word)} lemma=${JSON.stringify(lookupWord)} pron=${JSON.stringify(tokenPron ?? null)} entries=${JSON.stringify(merged.map((e) => ({ id: e.id, head: e.head })))} (${source})`);
        setResults(merged);
      }
      void translateInBackground(merged);
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
        publishResults(merged, 'cache');
        return;
      }

      // Cache miss — fetch from server
      setLoading(true);
      try {
        const seenIds = new Set<string>();
        const dedupe = (list: DictionaryEntry[]) => list.filter((e) => {
          if (!e.id) return true;
          if (seenIds.has(e.id)) return false;
          seenIds.add(e.id);
          return true;
        });

        // Offline SQLite first (precompiled file or legacy central table).
        // Popup uses exact-only lookups so substring heads (но/ст inside
        // "остановиться") never pollute the cards — mirroring web's exact
        // short-circuit. If neither lemma nor surface has an exact hit,
        // fall back to the full fuzzy/substring chain for unknown/old forms.
        const offlinePrimary = (await lookupOfflineByL2(l2, lookupWord, false, true)) ?? [];
        const offlineSurface = alsoLookupSurface
          ? ((await lookupOfflineByL2(l2, word, false, true)) ?? [])
          : [];
        const offlineExact = dedupe([...offlinePrimary, ...offlineSurface]);
        if (offlineExact.length > 0) {
          setCachedEntries(l2, lookupWord, offlinePrimary);
          if (alsoLookupSurface) setCachedEntries(l2, word, offlineSurface);
          publishResults(offlineExact, 'offline-exact');
          return;
        }

        const offlinePrimaryFuzzy = (await lookupOfflineByL2(l2, lookupWord)) ?? [];
        const offlineSurfaceFuzzy = alsoLookupSurface
          ? ((await lookupOfflineByL2(l2, word)) ?? [])
          : [];
        const offlineMerged = dedupe([...offlinePrimaryFuzzy, ...offlineSurfaceFuzzy]);
        if (offlineMerged.length > 0) {
          setCachedEntries(l2, lookupWord, offlinePrimaryFuzzy);
          if (alsoLookupSurface) setCachedEntries(l2, word, offlineSurfaceFuzzy);
          publishResults(offlineMerged, 'offline');
          return;
        }

        // Use bulkLookupWords to populate cache, then read from cache
        await bulkLookupWords(
          textBatch.map((text) => ({ text, l2Code: l2 })),
          PYTHON_API_URL,
        );

        let primaryResults = getCachedEntries(l2, lookupWord) ?? [];

        // Batch lookup is exact-match SQL only. When it misses (inflected
        // forms, proper nouns, or words that need the LLM fallback), call the
        // single-word endpoint so the popup still shows entry cards.
        if (primaryResults.length === 0) {
          const richRes = await dictRef.current.lookup(lookupWord, l2, l1);
          primaryResults = richRes.results ?? [];
          if (primaryResults.length > 0) {
            setCachedEntries(l2, lookupWord, primaryResults);
            if (l1 !== 'en') {
              for (const e of primaryResults) setL1CachedEntry(l2, l1, e);
            }
          }
        }

        // Also individually fetch the surface form if it wasn't in the batch
        let surfaceResults: DictionaryEntry[] = [];
        if (alsoLookupSurface) {
          const surfaceCached = getCachedEntries(l2, word);
          if (surfaceCached) {
            surfaceResults = surfaceCached;
          } else {
            const surfaceRes = await dictRef.current.lookup(word, l2, l1);
            surfaceResults = surfaceRes.results ?? [];
            setCachedEntries(l2, word, surfaceResults);
          }
          surfaceResults = surfaceResults.filter(
            (entry: DictionaryEntry) => !primaryResults.some((p: DictionaryEntry) => p.id === entry.id),
          );
        }

        const merged = [...primaryResults, ...surfaceResults];
        publishResults(merged, 'online');
      } catch (e: any) {
        if (!cancelled) {
          setError(localizedError(tRef.current, e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    return () => { cancelled = true; };
  }, [visible, word, lemma, l2Lang.code, l1Lang.code]);

  const lemmaForm = lemma && lemma !== word ? lemma : null;

  // ── Force-mount so exit slide-down animation plays ──
  const [wasVisible, setWasVisible] = useState(false);
  useEffect(() => { if (visible) setWasVisible(true); }, [visible]);
  if (!visible && !wasVisible) return null;

  const popupHeight = isMd ? Math.min(screenHeight * 0.75, 640) : screenHeight * 0.75;

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

        {/* Bottom sheet on narrow screens; centered dialog on md+ */}
        <Animated.View
          pointerEvents="box-none"
          className={isMd ? 'absolute inset-0 items-center justify-center px-4' : 'absolute inset-x-0 bottom-0'}
          style={{ transform: isMd ? undefined : [{ translateY: slideAnim }] }}
        >
          <View
            testID="dictionary-popup"
            className={isMd ? 'w-full max-w-lg overflow-hidden rounded-xl bg-background' : 'rounded-t-xl bg-background'}
            style={{
              maxHeight: popupHeight,
              minHeight: isMd ? undefined : screenHeight * 0.35,
            }}
          >
            <View
              className="px-4 pt-4 pb-8"
              style={{ height: popupHeight }}
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
                {linkUrl ? (
                  <Pressable
                    onPress={() => {
                      onClose();
                      if (onOpenLink) {
                        onOpenLink(linkUrl);
                      } else {
                        Linking.openURL(linkUrl).catch(() => {});
                      }
                    }}
                    className="mb-3 flex-row items-center gap-2 rounded-lg border border-border bg-card px-3 py-2"
                  >
                    <ExternalLink size={14} color={ICON_PRIMARY} />
                    <Text className="text-sm font-medium text-primary">{t('action.open_in_reader')}</Text>
                  </Pressable>
                ) : null}

                {/* AI + image sections need the network — hide while offline. */}
                {!status.effectiveOffline && (
                  <>
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
                  </>
                )}

                {loading && (
                  <View className="items-center py-12">
                    <ActivityIndicator size="large" className="text-primary" />
                    <Text className="mt-3 text-sm text-muted-foreground">
                      {t('msg.loading')}
                    </Text>
                  </View>
                )}

                {error && (
                  <ErrorNotice message={error} className="mb-3" />
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
                      saveButton={
                        <SaveButton
                          entry={entry}
                          size={20}
                          context={context ? { form: word, text: context, textTitle: '' } : undefined}
                        />
                      }
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
