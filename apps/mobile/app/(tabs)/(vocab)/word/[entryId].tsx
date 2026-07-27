import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Film, Binary, Sparkles } from 'lucide-react-native';
import { useT } from '@/hooks/use-t';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDictionaryContext } from '@/contexts/DictionaryContext';
import { useDictionary } from '@langplayer/api-client';
import { SubsSearchResults } from '@/components/video/SubsSearchResults';
import { InflectionTable } from '@/components/InflectionTable';
import { AiExplanation } from '@/components/AiExplanation';
import { TabbedPanel } from '@/components/TabbedPanel';
import { DictionaryDefinitionsPanel } from '@/components/dictionary/DictionaryDefinitionsPanel';
import { useInflectedSearchTerms } from '@/hooks/use-inflected-search-terms';
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

  // Inflected search terms for subs-search (head + alternate forms)
  const { allTerms, headTerm, formCount } = useInflectedSearchTerms(entry, l2Lang.code);
  const [exactMatch, setExactMatch] = useState(false);
  const searchTermString = exactMatch ? headTerm : allTerms.join(',');

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

  // ── Entry detail: definitions panel + tabs panel (siblings, ADR 0007) ──
  return (
    <ScrollView className="flex-1 bg-background">
      {/* Definitions panel — card at the top (like web's left panel on lg+) */}
      <View className="mx-4 mt-4 rounded-xl border border-border bg-card p-6">
        <DictionaryDefinitionsPanel
          entry={entry}
          l2Code={l2Lang.code}
        />
      </View>

      {/* Tabs panel: Examples, Conjugations, DeepSeek (matches web right panel) */}
      <View className="mx-4 mt-4 mb-8">
        <TabbedPanel
          tabs={[
            { key: 'examples', label: t('title.examples_from_videos'), icon: () => <Film size={16} color={ICON_MUTED} /> },
            { key: 'conjugations', label: t('title.conjugations'), icon: () => <Binary size={16} color={ICON_MUTED} /> },
            { key: 'deepseek', label: t('action.let_ai_explain'), icon: () => <Sparkles size={16} color={ICON_MUTED} /> },
          ]}
          defaultTab="examples"
        >
          <ScrollView>
            <SubsSearchResults
              term={searchTermString}
              exactMatch={exactMatch}
              onExactToggle={setExactMatch}
              formCount={formCount}
            />
          </ScrollView>

          <ScrollView className="px-4 pt-3">
            <InflectionTable head={entry.head} l2Code={l2Lang.code} embedded />
          </ScrollView>

          <AiExplanation word={entry.head} entryFound={true} autoLoad />
        </TabbedPanel>
      </View>
    </ScrollView>
  );
}
