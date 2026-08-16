import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import { useRouter } from 'expo-router';
import { useT } from '@/hooks/use-t';
import type { DictionaryEntry } from '@langplayer/shared';
import { decomposeWordId } from '@langplayer/shared';
import { Sidebar } from '@/components/ui/sidebar';
import { DictionaryEntryCard } from '@/components/dictionary/DictionaryEntryCard';
import { getCachedEntries, enqueueLookupWords, getCachedEntryById, bulkLookupWords } from '@/lib/dictionary-cache';
import { PYTHON_API_URL } from '@/lib/api-url';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { ICON_MUTED } from '@/lib/theme-colors';
import type { SidebarSource } from '@/contexts/DictionaryContext';

export interface SidebarListItem {
  id: string;
  head: string;
  dictionaryId: string;
  entryId: string;
  pronunciation?: string;
  definition?: string;
}

interface WordListSidebarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Wide screens: whether the persistent right panel is expanded. */
  sidebarOpen: boolean;
  source: SidebarSource;
  l1Code: string;
  l2Code: string;
  /** ISO 639-1 base code of the target language (for cache lookups). */
  l2Base?: string;
  /** Composite id of the entry currently being viewed (highlight + prev/next). */
  currentEntryId?: string | null;
  /** Called with a source-list item when the user taps a neighbouring entry. */
  onNavigate?: (items: SidebarListItem[], currentId: string, source?: 'search' | 'saved' | 'corpus') => void;
}

/**
 * Mobile dictionary sidebar — the word list the user navigated to the current
 * entry from (search results / saved words / related words), rendered as
 * compact DictionaryEntryCards. Mirrors the web WordListSidebar.
 *
 * Implemented with @rn-primitives/dialog (slide-from-right DrawerContent) for
 * consistency with the rest of the app's interaction primitives.
 *
 * The sidebar is only available when the source is a list with more than one
 * item — otherwise it returns null and shouldn't be opened.
 */
export function isSidebarAvailable(source: SidebarSource): boolean {
  if (source.kind === 'results') return source.items.length > 1;
  if (source.kind === 'wordlist') return source.items.length > 1;
  return false;
}

/** Normalize a sidebar source into a flat, renderable list of items. */
function itemsFromSource(source: SidebarSource, currentId?: string | null): SidebarListItem[] {
  if (source.kind === 'results') {
    return source.items.map((e) => ({
      id: e.id,
      head: e.head,
      dictionaryId: e.dictionary?.id ?? 'llm',
      entryId: e.id,
      pronunciation: e.pronunciation,
      definition: e.definitions?.length ? e.definitions.join('; ') : undefined,
    }));
  }
  if (source.kind === 'wordlist') {
    return source.items.map((it) => ({ ...it }));
  }
  return [];
}

function sidebarTitle(source: SidebarSource, t: (k: string, vars?: any) => string): string {
  if (source.kind === 'saved') return t('title.saved_words');
  if (source.kind === 'wordlist' && source.source === 'corpus') return t('title.related');
  if (source.kind === 'wordlist' && source.source === 'saved') return t('title.saved_words');
  const count = source.kind === 'results' ? source.items.length : source.kind === 'wordlist' ? source.items.length : 0;
  return t('msg.result_count', { count });
}

/** Look up an entry id in both full and base L2 cache keys. */
function getCachedEntryByIdEither(
  l2Code: string,
  l2Base: string,
  id: string,
): DictionaryEntry | undefined {
  return getCachedEntryById(l2Code, id) ?? getCachedEntryById(l2Base, id);
}

/**
 * Resolve an entry for a sidebar item, lazily fetching it through the shared
 * batch lookup cache (mirrors the web SidebarEntryCard). Search-fallback items
 * (unknown dictionary id) resolve by head; everything else by composite id.
 */
async function resolveItemEntry(
  item: SidebarListItem,
  l2Code: string,
  l2Base: string,
): Promise<DictionaryEntry | null> {
  if (item.dictionaryId === 'unknown') {
    const cached = getCachedEntries(l2Base, item.head);
    if (cached && cached.length > 0) return cached[0] ?? null;
    await enqueueLookupWords([{ text: item.head, l2Code: l2Base }], PYTHON_API_URL);
    return getCachedEntries(l2Base, item.head)?.[0] ?? null;
  }
  const cached = getCachedEntryByIdEither(l2Code, l2Base, item.id);
  if (cached) return cached;
  const decomposed = decomposeWordId(item.id, l2Code);
  if (!decomposed) return null;
  // Try bulk lookup via the shared cache (populates the id cache too).
  await bulkLookupWords([{ text: item.head, l2Code: l2Base }], PYTHON_API_URL);
  return getCachedEntryByIdEither(l2Code, l2Base, item.id) ?? null;
}

function SidebarEntryCard({
  item,
  l1Code,
  l2Code,
  l2Base,
  isActive,
  onOpen,
}: {
  item: SidebarListItem;
  l1Code: string;
  l2Code: string;
  l2Base: string;
  isActive: boolean;
  onOpen: (item: SidebarListItem, entry?: DictionaryEntry) => void;
}) {
  const router = useRouter();
  const [entry, setEntry] = useState<DictionaryEntry | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const e = await resolveItemEntry(item, l2Code, l2Base);
      if (!cancelled) setEntry(e);
    };
    void load();
    return () => { cancelled = true; };
  }, [item.id, item.head, item.dictionaryId, l2Code, l2Base]);

  let content: React.ReactNode;
  if (entry === undefined) {
    content = (
      <View className="flex-row items-center gap-2 rounded-lg border border-border bg-card p-3">
        <Text className="flex-1 text-sm font-medium text-muted-foreground" numberOfLines={1}>{item.head}</Text>
        <ActivityIndicator size="small" color={ICON_MUTED} />
      </View>
    );
  } else if (!entry) {
    content = (
      <Pressable
        onPress={() => onOpen(item)}
        className="w-full rounded-lg border border-border bg-card p-3 active:bg-muted"
      >
        <Text className="text-lg font-bold text-foreground" numberOfLines={1}>{item.head}</Text>
      </Pressable>
    );
  } else {
    content = (
      <DictionaryEntryCard
        entry={entry}
        variant="compact"
        l2Code={l2Code}
        l1Code={l1Code}
        saveContext={{ form: item.head, text: item.head, textTitle: 'Dictionary' }}
        onPress={() => onOpen(item, entry)}
      />
    );
  }

  return isActive ? (
    <View className="mb-3 rounded-lg ring-2 ring-primary">{content}</View>
  ) : (
    <View className="mb-3">{content}</View>
  );
}

export function WordListSidebar({
  open,
  onOpenChange,
  sidebarOpen,
  source,
  l1Code,
  l2Code,
  l2Base,
  currentEntryId,
  onNavigate,
}: WordListSidebarProps) {
  const t = useT();
  const router = useRouter();

  if (!isSidebarAvailable(source)) return null;

  const items = itemsFromSource(source);
  const title = sidebarTitle(source, t);

  // Prev/next over the source list, relative to the entry being viewed.
  const currentId =
    (source.kind === 'wordlist' ? source.currentId : null) ?? currentEntryId ?? null;
  const headIds = items.map((it) => it.id);
  const currentIdx = currentId ? headIds.indexOf(currentId) : -1;

  return (
    <Sidebar
      open={open}
      onOpenChange={onOpenChange}
      sidebarOpen={sidebarOpen}
      title={title}
      desktopClassName="w-56 ml-3"
      headerActions={
        currentIdx >= 0 ? (
          <View className="flex-row items-center gap-1">
            <Pressable
              onPress={() => {
                const prev = currentIdx > 0 ? items[currentIdx - 1] : null;
                if (prev) {
                  onOpenChange(false);
                  onNavigate?.(items, prev.id, source.kind === 'wordlist' ? source.source : undefined);
                }
              }}
              disabled={currentIdx <= 0}
              className="flex-row items-center gap-1 rounded px-2 py-1 active:bg-muted disabled:opacity-30"
              accessibilityLabel={t('action.previous')}
            >
              <ChevronLeft size={16} color={ICON_MUTED} />
              <Text className="text-xs text-muted-foreground">{t('action.previous')}</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                const next = currentIdx >= 0 && currentIdx < items.length - 1 ? items[currentIdx + 1] : null;
                if (next) {
                  onOpenChange(false);
                  onNavigate?.(items, next.id, source.kind === 'wordlist' ? source.source : undefined);
                }
              }}
              disabled={currentIdx < 0 || currentIdx >= items.length - 1}
              className="flex-row items-center gap-1 rounded px-2 py-1 active:bg-muted disabled:opacity-30"
              accessibilityLabel={t('action.next')}
            >
              <Text className="text-xs text-muted-foreground">{t('action.next')}</Text>
              <ChevronRight size={16} color={ICON_MUTED} />
            </Pressable>
          </View>
        ) : undefined
      }
    >
      {/* List of entry cards */}
      <View className="p-2">
        {items.map((item) => (
          <SidebarEntryCard
            key={item.id}
            item={item}
            l1Code={l1Code}
            l2Code={l2Code}
            l2Base={l2Base ?? l2Code.split('-')[0]!}
            isActive={item.id === currentId}
            onOpen={(it, entry) => {
              onOpenChange(false);
              if (!entry && it.dictionaryId === 'unknown') {
                router.push(`/(tabs)/(vocab)/?q=${encodeURIComponent(it.head)}` as any);
                return;
              }
              // Unknown items resolve to a real entry while the sidebar is
              // open — replace the head-as-id with the real entry id so the
              // tapped word navigates to its entry, not a search page.
              const resolvedItems = entry && it.dictionaryId === 'unknown'
                ? items.map((x) =>
                    x.id === it.id
                      ? { ...x, id: entry.id, entryId: entry.id, dictionaryId: entry.dictionary?.id ?? 'llm', head: entry.head }
                      : x,
                  )
                : items;
              onNavigate?.(resolvedItems, entry?.id ?? it.id, source.kind === 'wordlist' ? source.source : undefined);
            }}
          />
        ))}
      </View>
    </Sidebar>
  );
}
