import React, { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useT } from '@/hooks/use-t';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDictionaryContext } from '@/contexts/DictionaryContext';
import { useDictionary } from '@langplayer/api-client';
import { DictionaryEntryCard } from '@/components/dictionary/DictionaryEntryCard';
import { DictionaryEntryTabs } from '@/components/dictionary/DictionaryEntryTabs';
import { SearchBar } from '@/components/dictionary/SearchBar';
import { WordListSidebar, isSidebarAvailable, type SidebarListItem } from '@/components/dictionary/WordListSidebar';
import { ErrorNotice } from '@/components/ui/error-notice';
import { localizedError } from '@/lib/errors';
import { log, logwarn } from '@/lib/logger';
import { useSidebar } from '@/components/ui/sidebar';
import { ICON_MUTED } from '@/lib/theme-colors';
import { PanelRight, PanelRightClose } from 'lucide-react-native';
import { getCachedEntryById, setCachedEntryById } from '@/lib/dictionary-cache';
import { getOfflineEntryById } from '@/lib/dictionary-db';
import { SUPPORTED_L2S, type DictionaryEntry } from '@langplayer/shared';
import { decomposeWordId } from '@langplayer/shared';

// Remember the last entry-detail tab the user opened (AsyncStorage) so the
// same tab opens automatically next time. 'word' is excluded — the detail
// page doesn't render the embedded Dictionary tab.
const ENTRY_TAB_KEY = 'lp-entry-tab';
const ENTRY_TAB_OPTIONS = ['examples', 'images', 'inflections', 'deepseek', 'corpus'];

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
    detailHead,
    setDetailHead,
    setSidebarSource,
    setQuery,
    doSearch,
    clearSearch,
  } = useDictionaryContext();
  const dict = useDictionary();

  const { isWide, sidebarOpen, mobileOpen, setMobileOpen, toggle } = useSidebar();
  const [searchInput, setSearchInput] = useState('');
  const searchUserEditedRef = useRef(false);
  const prevEntryIdRef = useRef(entryId);
  const [activeTab, setActiveTab] = useState<string>('examples');
  const tabLoadedRef = useRef(false);

  // Restore the remembered tab once, then persist every change.
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(ENTRY_TAB_KEY)
      .then((stored) => {
        if (!cancelled && stored && ENTRY_TAB_OPTIONS.includes(stored)) {
          setActiveTab(stored);
        }
      })
      .catch(() => {})
      .finally(() => { tabLoadedRef.current = true; });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!tabLoadedRef.current) return;
    AsyncStorage.setItem(ENTRY_TAB_KEY, activeTab).catch(() => {});
  }, [activeTab]);

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

  // The word currently being viewed — used to prefill the search field.
  const entryHead = contextEntry?.head ?? apiEntry?.head ?? detailHead ?? '';

  // Reset the "user edited" flag when navigating to a different entry so the
  // new entry's head word can prefill again.
  useEffect(() => {
    if (prevEntryIdRef.current !== entryId) {
      prevEntryIdRef.current = entryId;
      searchUserEditedRef.current = false;
    }
  }, [entryId]);

  // Prefill the search field with the displayed entry's head word (e.g.
  // 自欺欺人), unless the user has typed their own query.
  useEffect(() => {
    if (entryHead && !searchUserEditedRef.current) {
      setSearchInput(entryHead);
    }
  }, [entryHead]);

  // Deep-link fallback: check ID cache first, then fetch from API.
  useEffect(() => {
    if (contextEntry || !entryId) return;
    const l2 = l2Code;
    // CEDICT ids contain commas, which are encoded as ~ in the route.
    const decodedId = entryId.replace(/~/g, ',');

    // Check ID cache first (populated by bulkLookupWords or previous fetches)
    const cached = getCachedEntryById(l2, decodedId);
    if (cached) {
      setApiEntry(cached);
      return;
    }

    // Sidebar items may carry a composite id (e.g. saved words) even though
    // the route shows the raw id. Prefer the item's entryId when present.
    const sidebarItem =
      sidebarSource.kind === 'wordlist'
        ? sidebarSource.items.find(
            (it) =>
              it.id === entryId ||
              it.id === decodedId ||
              it.entryId === entryId ||
              it.entryId === decodedId,
          )
        : null;
    const lookupId = sidebarItem?.entryId || decodedId;
    const decomposed = decomposeWordId(lookupId, l2);
    if (!decomposed) {
      setApiError(t('error.entry_not_found'));
      return;
    }
    const { dict: dictId, id: scopedId } = decomposed;

    void (async () => {
      // Offline first: the entry may be in the downloaded dictionary even when
      // the network (or Offline Mode) blocks /dictionary/entry.
      const offline = await getOfflineEntryById(l2, scopedId);
      if (offline) {
        setCachedEntryById(l2, offline);
        setApiEntry(offline);
        return;
      }

      log('[WordDetail] fetching entry — l2:', l2, 'entryId:', decodedId, 'lookupId:', lookupId, 'dict:', dictId, 'scopedId:', scopedId);
      setApiLoading(true);
      setApiError(null);
      dict.getEntry(l2, dictId, scopedId, l1Lang.code)
        .then((res) => {
          setCachedEntryById(l2, res.entry);
          setApiEntry(res.entry);
        })
        .catch((e) => {
          logwarn('[WordDetail] ❌ getEntry failed — l2:', l2, 'entryId:', decodedId, 'error:', e?.message ?? e);
          setApiError(localizedError(t, e));
        })
        .finally(() => setApiLoading(false));
    })();
  }, [contextEntry, entryId, l2Code, sidebarSource]);

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
    // Replace the current detail page so the stack stays Search → Detail —
    // swiping back always returns to the search page, not a chain of entries.
    router.replace(`word/${safeId}` as any);
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
        <Pressable onPress={() => router.push('/(tabs)/(vocab)' as any)} className="self-start px-1 py-3">
          <Text className="text-sm text-primary">← {t('action.back')}</Text>
        </Pressable>
        <ErrorNotice message={error} />
      </View>
    );
  }

  // ── No entry ──
  if (!entry) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-4">
        <Pressable onPress={() => router.push('/(tabs)/(vocab)' as any)} className="self-start px-1 py-3">
          <Text className="text-sm text-primary">← {t('action.back')}</Text>
        </Pressable>
        <Text className="text-muted-foreground">{t('msg.no_notes_yet')}</Text>
      </View>
    );
  }

  // ── Entry detail: definitions card + tabs panel (siblings, ADR 0007) ──
  const sidebarAvailable = isSidebarAvailable(sidebarSource);

  return (
    <View className="flex-1 bg-background">
      <View className="w-full flex-1 self-center" style={{ maxWidth: 1280 }}>
        {/* Header bar — persistent search + sidebar toggle when a list is available */}
        <View className="flex-row items-center gap-2 border-b border-border px-4 py-2">
          <View className="flex-1">
            <SearchBar
              value={searchInput}
              onChangeText={(text) => {
                searchUserEditedRef.current = true;
                setSearchInput(text);
              }}
              onSubmit={() => {
                const term = searchInput.trim();
                if (!term) return;
                setQuery(term);
                doSearch(term);
                router.push('/(tabs)/(vocab)' as any);
              }}
              onClear={() => {
                setSearchInput('');
                clearSearch();
                // Pop back to the search page with the native swipe animation.
                router.dismissTo('/(tabs)/(vocab)' as any);
              }}
            />
          </View>
          {sidebarAvailable && (
            <Pressable
              onPress={toggle}
              className="flex-row items-center gap-1.5 rounded-md border border-border px-3 py-1.5 active:bg-muted"
              accessibilityLabel={t(isWide && sidebarOpen ? 'action.hide_sidebar' : 'action.show_sidebar')}
            >
              {isWide && sidebarOpen ? (
                <PanelRightClose size={16} color={ICON_MUTED} />
              ) : (
                <PanelRight size={16} color={ICON_MUTED} />
              )}
              <Text className="text-xs text-muted-foreground">
                {t(isWide && sidebarOpen ? 'action.hide_sidebar' : 'action.show_sidebar')}
              </Text>
            </Pressable>
          )}
        </View>

        <View className="flex-1" style={{ flexDirection: isWide ? 'row' : 'column' }}>
          <ScrollView className="flex-1">
            {/* lg+: definitions left + tabs right side-by-side (web parity) */}
            <View className={isWide ? 'flex-row items-start gap-4 px-4 pt-4 pb-8' : ''}>
              {/* Definitions card — web's left panel (flex-1) */}
              <View
                className={
                  isWide
                    ? 'min-w-0 flex-1 rounded-xl border border-border bg-card p-6'
                    : 'mx-4 mt-4 rounded-xl border border-border bg-card p-6'
                }
              >
                <DictionaryEntryCard
                  entry={entry}
                  variant="full"
                  l2Code={l2Code}
                />
              </View>

              {/* Tabs panel: Examples, Conjugations, DeepSeek — web's right panel (flex-[2]) */}
              <View className={isWide ? 'min-w-0 flex-[2]' : 'mx-4 mt-4 mb-8'}>
                <DictionaryEntryTabs
                  entry={entry}
                  l2Code={l2Code}
                  showDefinitionTab={false}
                  activeTab={activeTab}
                  onTabChange={setActiveTab}
                />
              </View>
            </View>
          </ScrollView>

          {/* Sidebar — shared panel + sheet, source list + prev/next + highlight */}
          <WordListSidebar
            open={mobileOpen}
            onOpenChange={setMobileOpen}
            sidebarOpen={sidebarOpen}
            source={sidebarSource}
            l1Code={l1Lang.code}
            l2Code={l2Code}
            l2Base={l2Code.split('-')[0]}
            currentEntryId={currentEntryId}
            onNavigate={handleSidebarNavigate}
          />
        </View>
      </View>
    </View>
  );
}
