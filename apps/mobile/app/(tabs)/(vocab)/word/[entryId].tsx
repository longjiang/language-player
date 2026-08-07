import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useT } from '@/hooks/use-t';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDictionaryContext } from '@/contexts/DictionaryContext';
import { useDictionary } from '@langplayer/api-client';
import { DictionaryEntryCard } from '@/components/dictionary/DictionaryEntryCard';
import { DictionaryEntryTabs } from '@/components/dictionary/DictionaryEntryTabs';
import { WordListSidebar, isSidebarAvailable, type SidebarListItem } from '@/components/dictionary/WordListSidebar';
import { ICON_MUTED } from '@/lib/theme-colors';
import { PanelRight } from 'lucide-react-native';
import { getCachedEntryById, setCachedEntryById } from '@/lib/dictionary-cache';
import { SUPPORTED_L2S, type DictionaryEntry } from '@langplayer/shared';
import { decomposeWordId } from '@langplayer/shared';

export default function WordDetailScreen() {
  const { entryId, l2 } = useLocalSearchParams<{ entryId: string; l2?: string }>();
  const t = useT();
  const router = useRouter();
  const { l1Lang, l2Lang, setL2Lang } = useLanguage();
  const requestedL2 =
    typeof l2 === 'string' && (SUPPORTED_L2S as readonly string[]).includes(l2.trim())
      ? l2.trim()
      : null;
  // Deep links can carry ?l2=... to switch the stored L2 before loading
  // content (SPEC-048 Tier 9). The param wins over the persisted pair.
  const l2Code = requestedL2 ?? l2Lang.code;
  const {
    results,
    loading: ctxLoading,
    error: ctxError,
    sidebarSource,
    cameFromSearch,
    setDetailHead,
    setSidebarSource,
  } = useDictionaryContext();
  const dict = useDictionary();

  const [sidebarOpen, setSidebarOpen] = useState(false);

  // State for API-fetched entry (deep-link fallback)
  const [apiEntry, setApiEntry] = useState<DictionaryEntry | null>(null);
  const [apiLoading, setApiLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Persist the deep-link L2 override so the header, dictionary context, and
  // saved-words state all agree with the language of the linked content.
  useEffect(() => {
    if (requestedL2 && requestedL2 !== l2Lang.code) {
      setL2Lang(requestedL2);
    }
  }, [requestedL2, l2Lang.code, setL2Lang]);

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

  // Deep-link fallback: check ID cache first, then fetch from API.
  useEffect(() => {
    if (contextEntry || !entryId) return;
    const l2 = l2Code;

    // Check ID cache first (populated by bulkLookupWords or previous fetches)
    const cached = getCachedEntryById(l2, entryId);
    if (cached) {
      setApiEntry(cached);
      return;
    }

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
        setCachedEntryById(l2, res.entry);
        setApiEntry(res.entry);
      })
      .catch((e) => {
        setApiError(e?.message ?? 'Failed to load entry');
      })
      .finally(() => setApiLoading(false));
  }, [contextEntry, entryId, l2Code]);

  const entry = contextEntry ?? apiEntry;
  const loading = ctxLoading || apiLoading;
  const error = ctxError ?? apiError;

  // Update context detail head when entry loads (for navigation header display)
  useEffect(() => {
    if (entry?.head) {
      setDetailHead(entry.head);
    }
  }, [entry?.head, setDetailHead]);

  // Composite id of the entry currently being viewed (highlight + prev/next in
  // the sidebar). Search results and saved words carry raw ids; wordlist nav
  // items carry their own composite id.
  const currentEntryId = entry ? entry.id : null;

  // Navigate to a neighbouring item in the source list. Preserves the list so
  // the sidebar stays available (matches web's updateCurrentEntryId + route).
  const handleSidebarNavigate = (items: SidebarListItem[], currentId: string, source?: 'search' | 'saved' | 'corpus') => {
    setSidebarSource({ kind: 'wordlist', items, currentId, source });
    const safeId = currentId.replace(/,/g, '~');
    router.push(`word/${safeId}` as any);
  };

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
  const sidebarAvailable = isSidebarAvailable(sidebarSource);

  return (
    <View className="flex-1 bg-background">
      {/* Header bar — dictionary title + sidebar toggle when a list is available */}
      <View className="flex-row items-center justify-between border-b border-border px-4 py-3">
        <Text className="text-lg font-bold text-foreground">{t('title.dictionary')}</Text>
        {sidebarAvailable && (
          <Pressable
            onPress={() => setSidebarOpen(true)}
            className="flex-row items-center gap-1.5 rounded-md border border-border px-3 py-1.5 active:bg-muted"
            accessibilityLabel={t('action.show_sidebar')}
          >
            <PanelRight size={16} color={ICON_MUTED} />
            <Text className="text-xs text-muted-foreground">{t('action.show_sidebar')}</Text>
          </Pressable>
        )}
      </View>

      <ScrollView className="flex-1">
        {/* Definitions card at the top (like web's left panel on lg+) */}
        <View className="mx-4 mt-4 rounded-xl border border-border bg-card p-6">
          <DictionaryEntryCard
            entry={entry}
            variant="full"
            l2Code={l2Code}
          />
        </View>

        {/* Tabs panel: Examples, Conjugations, DeepSeek (matches web right panel) */}
        <View className="mx-4 mt-4 mb-8">
          <DictionaryEntryTabs
            entry={entry}
            l2Code={l2Code}
            showDefinitionTab={false}
          />
        </View>
      </ScrollView>

      {/* Sidebar drawer (rn-primitives) — source list + prev/next + highlight */}
      <WordListSidebar
        open={sidebarOpen}
        onOpenChange={setSidebarOpen}
        source={sidebarSource}
        l1Code={l1Lang.code}
        l2Code={l2Code}
        l2Base={l2Code.split('-')[0]}
        currentEntryId={currentEntryId}
        onNavigate={handleSidebarNavigate}
      />
    </View>
  );
}
