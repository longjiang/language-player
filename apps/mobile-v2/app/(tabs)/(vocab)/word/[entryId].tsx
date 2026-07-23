import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useT } from '@/hooks/use-t';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDictionaryContext } from '@/contexts/DictionaryContext';
import { useDictionary } from '@langplayer/api-client';
import { DictionaryEntryCard } from '@/components/dictionary/DictionaryEntryCard';
import { SubsSearchResults } from '@/components/video/SubsSearchResults';
import { InflectionTable } from '@/components/InflectionTable';
import { AiExplanation } from '@/components/AiExplanation';
import { TabbedPanel } from '@/components/TabbedPanel';
import { useInflectedSearchTerms } from '@/hooks/use-inflected-search-terms';
import { SaveButton } from '@/components/dictionary/SaveButton';
import { ICON_MUTED } from '@/lib/theme-colors';
import type { DictionaryEntry } from '@langplayer/shared';
import { decomposeWordId } from '@langplayer/shared';

export default function WordDetailScreen() {
  const { entryId } = useLocalSearchParams<{ entryId: string }>();
  const t = useT();
  const { l2Lang } = useLanguage();
  const { results, loading: ctxLoading, error: ctxError, sidebarSource, cameFromSearch } = useDictionaryContext();
  const dict = useDictionary();

  // State for API-fetched entry (deep-link fallback)
  const [apiEntry, setApiEntry] = useState<DictionaryEntry | null>(null);
  const [apiLoading, setApiLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // DEBUG: This screen receives the entry ID via expo-router params and looks up
  // the full entry from context (sidebarSource set by handleEntryPress, or fallback
  // to results). Logging confirms: navigation reached this screen, entryId populated,
  // and whether the entry was found in context.

  console.log('[Dict] WordDetailScreen render — entryId:', entryId, '— timestamp:', Date.now(), '— cameFromSearch:', cameFromSearch, '— sidebarSource.kind:', sidebarSource.kind, '— results count:', results?.length ?? 0);

  React.useEffect(() => {
    console.log('[Dict] WordDetailScreen mounted with entryId:', entryId);
  }, [entryId]);

  // Find the entry from sidebar source or search results (context).
  // The route may have ~ in place of , (CEDICT encoding), but context entries
  // have the raw ID with commas. Match both forms.
  const contextEntry = React.useMemo(() => {
    const decodedId = entryId.replace(/~/g, ',');
    console.log('[Dict] WordDetailScreen useMemo — entryId:', entryId, 'decodedId:', decodedId, 'sidebarSource.kind:', sidebarSource.kind, 'results count:', results?.length ?? 0);
    if (sidebarSource.kind === 'results') {
      const found = sidebarSource.items.find((e) => e.id === entryId || e.id === decodedId);
      console.log('[Dict] WordDetailScreen — searching sidebarSource.results, found:', !!found);
      return found;
    }
    if (results) {
      const found = results.find((e) => e.id === entryId || e.id === decodedId);
      console.log('[Dict] WordDetailScreen — searching results, found:', !!found);
      return found;
    }
    return null;
  }, [entryId, results, sidebarSource]);

  // Deep-link fallback: fetch entry from API when not found in context.
  // Uses decomposeWordId() (matches Next.js lib/word-id-resolver.ts) to
  // determine the correct dictionary and scoped entry ID for the API call.
  useEffect(() => {
    if (contextEntry || !entryId) return;
    const l2 = l2Lang.code;
    const decomposed = decomposeWordId(entryId, l2);
    if (!decomposed) {
      console.log('[Dict] WordDetailScreen — deep-link: unrecognized entryId format:', entryId);
      setApiError('Unrecognized entry ID format');
      return;
    }
    const { dict: dictId, id: scopedId } = decomposed;
    console.log('[Dict] WordDetailScreen — deep-link: fetching entry from API, l2:', l2, 'dict:', dictId, 'id:', scopedId);
    setApiLoading(true);
    setApiError(null);
    dict.getEntry(l2, dictId, scopedId)
      .then((res) => {
        console.log('[Dict] WordDetailScreen — API returned entry:', res.entry?.head);
        setApiEntry(res.entry);
      })
      .catch((e) => {
        console.log('[Dict] WordDetailScreen — API fetch failed:', e?.message);
        setApiError(e?.message ?? 'Failed to load entry');
      })
      .finally(() => setApiLoading(false));
  }, [contextEntry, entryId, l2Lang.code]);

  const entry = contextEntry ?? apiEntry;
  const loading = ctxLoading || apiLoading;
  const error = ctxError ?? apiError;

  // Inflected search terms for subs-search (head + alternate forms)
  const { allTerms, headTerm, formCount } = useInflectedSearchTerms(entry, l2Lang.code);
  const [exactMatch, setExactMatch] = useState(false);
  const searchTermString = exactMatch ? headTerm : allTerms.join(',');

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color={ICON_MUTED} />
      </View>
    );
  }

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

  if (!entry) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-4">
        <Text className="px-4 py-5 mb-4 text-xl font-bold text-foreground">{t('title.dictionary')}</Text>
        <Text className="text-muted-foreground">{t('msg.no_notes_yet')}</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      {/* Head word + pronunciation header */}
      <View className="px-4 py-4">
        <View className="flex-row items-center justify-between">
          <View className="flex-1">
            <Text className="text-xl font-bold text-foreground">{entry.head}</Text>
            {entry.pronunciation && (
              <Text className="mt-1 text-sm text-muted-foreground">{entry.pronunciation}</Text>
            )}
          </View>
          {entry && <SaveButton entry={entry} />}
        </View>
        {/* Proficiency levels + source inline below head */}
        <View className="mt-2 flex-row flex-wrap items-center gap-1.5">
          {entry.levels?.map((l, i) => (
            <View key={i} className="rounded-full border border-border bg-muted/30 px-2 py-0.5">
              <Text className="text-xs text-muted-foreground">
                {l.scale.toUpperCase()}: {l.value}
              </Text>
            </View>
          ))}
          {entry.part_of_speech && (
            <View className="rounded-full border border-border bg-muted/30 px-2 py-0.5">
              <Text className="text-xs text-muted-foreground">{entry.part_of_speech}</Text>
            </View>
          )}
          <Text className="text-xs text-muted-foreground/50">
            {entry.dictionary.name} ({entry.dictionary.version})
          </Text>
        </View>
      </View>

      {/* Tabbed content — matches Next.js */}
      <TabbedPanel
        tabs={[
          { key: 'definitions', label: t('title.definitions') },
          { key: 'examples', label: t('title.examples_from_videos') },
          { key: 'conjugations', label: t('title.conjugations') },
          { key: 'deepseek', label: 'DeepSeek' },
        ]}
        defaultTab="definitions"
      >
        {/* Tab 1: Definitions */}
        <ScrollView className="px-4 pt-3">
          {entry.definitions && entry.definitions.length > 0 ? (
            entry.definitions.map((def, i) => (
              <View key={i} className="mb-2 rounded-lg bg-muted/50 p-3">
                <Text className="text-sm text-foreground">{def}</Text>
              </View>
            ))
          ) : (
            <Text className="py-4 text-center text-sm text-muted-foreground">
              {t('msg.no_results')}
            </Text>
          )}
        </ScrollView>

        {/* Tab 2: Examples from Videos */}
        <ScrollView className="pt-3">
          <SubsSearchResults
            term={searchTermString}
            exactMatch={exactMatch}
            onExactToggle={setExactMatch}
            formCount={formCount}
          />
        </ScrollView>

        {/* Tab 3: Conjugations */}
        <ScrollView className="px-4 pt-3">
          <InflectionTable head={entry.head} l2Code={l2Lang.code} embedded />
        </ScrollView>

        {/* Tab 4: DeepSeek AI */}
        <AiExplanation word={entry.head} entryFound={true} autoLoad />
      </TabbedPanel>
    </View>
  );
}
