import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, Animated, useWindowDimensions } from 'react-native';
import * as DialogPrimitive from '@rn-primitives/dialog';
import { useDictionary } from '@langplayer/api-client';
import { useLanguage } from '@/contexts/LanguageContext';
import { DictionaryEntryCard } from '@/components/dictionary/DictionaryEntryCard';
import { SaveButton } from '@/components/dictionary/SaveButton';
import type { DictionaryEntry } from '@langplayer/shared';
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
  translatedContext?: string;
  onClose: () => void;
  onViewDetail?: (entry: DictionaryEntry, allResults: DictionaryEntry[]) => void;
}

export function DictionaryPopup({
  visible,
  word,
  lemma,
  tokenPron,
  context,
  translatedContext,
  onClose,
  onViewDetail,
}: DictionaryPopupProps) {
  const { l1Lang, l2Lang } = useLanguage();
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

  // ── Look up the word when the popup opens ──
  useEffect(() => {
    if (!visible || !word) return;
    setLoading(true);
    setError(null);
    setResults(null);

    const l2 = l2Lang.code;
    const l1 = l1Lang.code;
    const lookupWord = lemma && lemma !== word ? lemma : word;
    const alsoLookupSurface = lookupWord !== word;

    (async () => {
      try {
        // Primary: lookup by lemma
        const primaryRes = await dict.lookup(lookupWord, l2, l1);
        const primaryResults = primaryRes.results ?? [];

        if (!alsoLookupSurface) {
          setResults(primaryResults);
          return;
        }

        // Secondary: also lookup surface form, merge deduplicated
        const surfaceRes = await dict.lookup(word, l2, l1);
        const surfaceResults = (surfaceRes.results ?? []).filter(
          (entry: DictionaryEntry) => !primaryResults.some((p: DictionaryEntry) => p.id === entry.id),
        );
        setResults([...primaryResults, ...surfaceResults]);
      } catch (e: any) {
        setError(e?.message ?? t('error.general'));
      } finally {
        setLoading(false);
      }
    })();
  }, [visible, word, lemma, l2Lang.code, l1Lang.code]);

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
          <DialogPrimitive.Content
            testID="dictionary-popup"
            className="rounded-t-xl bg-background"
            style={{
              maxHeight: screenHeight * 0.75,
              minHeight: screenHeight * 0.35,
            }}
          >
            <View
              className="px-4 pt-6 pb-8"
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
                      <Text className="text-sm text-muted-foreground">{tokenPron}</Text>
                    )}
                  </View>
                  {lemmaForm && (
                    <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                      lemma: {lemmaForm}
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

              {/* Context */}
              {context ? (
                <View className="mb-2 rounded-lg bg-muted/50 p-2">
                  <Text className="text-sm text-foreground">{context}</Text>
                  {translatedContext ? (
                    <Text className="mt-1 text-sm text-muted-foreground">
                      {translatedContext}
                    </Text>
                  ) : null}
                </View>
              ) : null}

              {/* Results */}
              <ScrollView
                className="flex-1"
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
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
                      l2Code={l2Lang.code}
                      saveButton={<SaveButton entry={entry} size={20} />}
                    />
                  </View>
                ))}
              </ScrollView>
            </View>
          </DialogPrimitive.Content>
        </Animated.View>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
