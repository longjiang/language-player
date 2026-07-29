import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useT } from '@/hooks/use-t';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDictionaryContext } from '@/contexts/DictionaryContext';
import { useDictionary } from '@langplayer/api-client';
import { DictionaryEntryCard } from '@/components/dictionary/DictionaryEntryCard';
import { DictionaryEntryTabs } from '@/components/dictionary/DictionaryEntryTabs';
import { ICON_MUTED } from '@/lib/theme-colors';
import type { DictionaryEntry } from '@langplayer/shared';
import { decomposeWordId } from '@langplayer/shared';

export default function WordDetailScreen() {
  const { entryId } = useLocalSearchParams<{ entryId: string }>();
  const t = useT();
  const { l2Lang } = useLanguage();
  const {
    results,
    loading: ctxLoading,
    error: ctxError,
    sidebarSource,
    cameFromSearch,
    setDetailHead,
  } = useDictionaryContext();
  const dict = useDictionary();

  // State for API-fetched entry (deep-link fallback)
  const [apiEntry, setApiEntry] = useState<DictionaryEntry | null>(null);
  const [apiLoading, setApiLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Find the entry from sidebar source or search results (context).
  // The route may have ~ in place of , (CEDICT encoding), but context entries
  // have the raw ID with commas. Match both forms.
  const contextEntry = useMemo(() => {
    const decodedId = entryId.replace(/~/g, ',');
    if (sidebarSource.kind === 'results') {
      const found = sidebarSource.items.find((e) => e.id === entryId || e.id === decodedId);
      return found ?? null;
    }
    if (results) {
      const found = results.find((e) => e.id === entryId || e.id === decodedId);
      return found ?? null;
    }
    return null;
  }, [entryId, results, sidebarSource]);

  // Deep-link fallback: fetch entry from API when not found in context.
  useEffect(() => {
    if (contextEntry || !entryId) return;
    const l2 = l2Lang.code;
    const decomposed = decomposeWordId(entryId, l2);
    if (!decomposed) {
      setApiError('Unrecognized entry ID format');
      return;
    }
    const { dict: dictId, id: scopedId } = decomposed;
    setApiLoading(true);
    setApiError(null);
    dict.getEntry(l2, dictId, scopedId)
      .then((res) => {
        setApiEntry(res.entry);
      })
      .catch((e) => {
        setApiError(e?.message ?? 'Failed to load entry');
      })
      .finally(() => setApiLoading(false));
  }, [contextEntry, entryId, l2Lang.code]);

  const entry = contextEntry ?? apiEntry;
  const loading = ctxLoading || apiLoading;
  const error = ctxError ?? apiError;

  // Update context detail head when entry loads (for navigation header display)
  useEffect(() => {
    if (entry?.head) {
      setDetailHead(entry.head);
    }
  }, [entry?.head, setDetailHead]);

  // ── Loading ──
  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color={ICON_MUTED} />
      </View>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-4">
        <Text className="px-4 py-5 mb-4 text-xl font-bold text-foreground">{t('title.dictionary')}</Text>
        <View className="mx-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
          <Text className="text-sm text-destructive">{error}</Text>
        </View>
      </View>
    );
  }

  // ── No entry ──
  if (!entry) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-4">
        <Text className="px-4 py-5 mb-4 text-xl font-bold text-foreground">{t('title.dictionary')}</Text>
        <Text className="text-muted-foreground">{t('msg.no_notes_yet')}</Text>
      </View>
    );
  }

  // ── Entry detail: definitions card + tabs panel (siblings, ADR 0007) ──
  return (
    <ScrollView className="flex-1 bg-background">
      {/* Definitions card at the top (like web's left panel on lg+) */}
      <View className="mx-4 mt-4 rounded-xl border border-border bg-card p-6">
        <DictionaryEntryCard
          entry={entry}
          variant="full"
          l2Code={l2Lang.code}
        />
      </View>

      {/* Tabs panel: Examples, Conjugations, DeepSeek (matches web right panel) */}
      <View className="mx-4 mt-4 mb-8">
        <DictionaryEntryTabs
          entry={entry}
          l2Code={l2Lang.code}
          showDefinitionTab={false}
        />
      </View>
    </ScrollView>
  );
}
