import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import { cn } from '@/lib/utils';
import { Button, buttonTextClass } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { router } from 'expo-router';
import { useT } from '@/hooks/use-t';
import type { DictionaryEntry } from '@langplayer/shared';
import { decomposeWordId } from '@langplayer/shared';
import { Sidebar } from '@/components/ui/sidebar';
import { DictionaryEntryCard } from '@/components/dictionary/DictionaryEntryCard';
import { getCachedEntries, enqueueLookupWords, getCachedEntryById, setCachedEntryById } from '@/lib/dictionary-cache';
import { getOfflineEntryById } from '@/lib/dictionary-db';
import { apiClient } from '@langplayer/api-client';
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
 * Resolve an entry for a sidebar item, lazily fetching it (mirrors the web
 * SidebarEntryCard / fetchSavedWordEntry). Search-fallback items (unknown
 * dictionary id) resolve by head; everything else resolves by its composite
 * id — shared id cache first, then the offline dictionary, then the exact
 * `/dictionary/entry` fetch (the same call the entry detail page makes), with
 * a head lookup as the last resort for legacy/unrecognized ids. The returned
 * entry's id is normalized to the list item's id so the card's bookmark state
 * and saved-metadata stay tied to the list item (web parity). Never throws —
 * failures resolve to null so the card falls back to the clickable head row.
 */
async function resolveItemEntry(
  item: SidebarListItem,
  l2Code: string,
  l2Base: string,
  l1Code: string,
): Promise<DictionaryEntry | null> {
  try {
    if (item.dictionaryId === 'unknown') {
      if (!item.head) return null;
      const cached = getCachedEntries(l2Base, item.head);
      if (cached && cached.length > 0) return cached[0] ?? null;
      await enqueueLookupWords([{ text: item.head, l2Code: l2Base }], PYTHON_API_URL);
      return getCachedEntries(l2Base, item.head)?.[0] ?? null;
    }

    // ── 1. Shared id cache (populated by batch lookups / detail fetches) ──
    const cached = getCachedEntryByIdEither(l2Code, l2Base, item.id);
    if (cached) return cached;

    const decomposed = decomposeWordId(item.id, l2Code);
    if (decomposed) {
      // ── 2. Offline dictionary first (works in airplane mode) ──
      try {
        const offline = await getOfflineEntryById(l2Base, decomposed.id);
        if (offline) {
          const normalized = offline.id === item.id ? offline : { ...offline, id: item.id };
          setCachedEntryById(l2Base, offline);
          setCachedEntryById(l2Base, normalized);
          return normalized;
        }
      } catch { /* no offline dict / corrupt — try the network */ }

      // ── 3. Exact entry fetch — same endpoint as the entry detail page.
      // A head batch lookup can't be used here: it may return a different
      // sense of a multi-sense head, or nothing at all for LLM entries. ──
      try {
        const res = await apiClient.get<{ entry: DictionaryEntry }>('/dictionary/entry', {
          params: { l2: l2Base, dict: decomposed.dict, id: decomposed.id, l1: l1Code },
        });
        const entry = res.entry;
        if (entry) {
          const normalized = entry.id === item.id ? entry : { ...entry, id: item.id };
          setCachedEntryById(l2Base, entry);
          setCachedEntryById(l2Code, entry);
          setCachedEntryById(l2Base, normalized);
          setCachedEntryById(l2Code, normalized);
          return normalized;
        }
      } catch {
        // 404 / network failure — fall through to the head lookup below.
      }
    }

    // ── 4. Legacy/unrecognized ids — find the entry by its head form
    // (e.g. LLM words saved without a resolvable prefix). ──
    if (item.head) {
      const byHead = getCachedEntries(l2Base, item.head);
      if (byHead && byHead.length > 0) return byHead[0] ?? null;
      await enqueueLookupWords([{ text: item.head, l2Code: l2Base }], PYTHON_API_URL);
      return getCachedEntries(l2Base, item.head)?.[0] ?? null;
    }
    return null;
  } catch {
    // Resolution must never crash the card — fall back to the head row.
    return null;
  }
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
  // NOTE: no `useRouter()` here — the sidebar sheet renders in an RN Modal
  // (ui/sidebar.tsx), and the dictionary popup renders through a portal;
  // neither is guaranteed to be inside the expo-router per-screen context.
  // The imperative `router` dispatches on the global navigation ref and works
  // in every rendering context.
  const [entry, setEntry] = useState<DictionaryEntry | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const e = await resolveItemEntry(item, l2Code, l2Base, l1Code);
        if (!cancelled) setEntry(e);
      } catch {
        // Resolution already guards itself; this is belt-and-suspenders so an
        // unexpected rejection can never crash the sidebar with a redbox.
        if (!cancelled) setEntry(null);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [item.id, item.head, item.dictionaryId, l2Code, l2Base, l1Code]);

  let content: React.ReactNode;
  // Head fallback: a source item with an empty head (legacy/malformed
  // records) must still show something — the entry id, then the raw id.
  const displayHead = item.head || item.entryId || item.id;
  if (entry === undefined) {
    content = (
      <Card className="flex-row items-center">
        <CardContent className="flex-row items-center gap-2">
          <Text className="flex-1 text-sm font-medium text-muted-foreground" numberOfLines={1}>{displayHead}</Text>
          <ActivityIndicator size="small" color={ICON_MUTED} />
        </CardContent>
      </Card>
    );
  } else if (!entry) {
    content = (
      <Pressable
        onPress={() => onOpen(item)}
        className="w-full rounded-lg border border-border bg-card p-3 active:bg-muted"
      >
        <Text className="text-lg font-bold text-foreground" numberOfLines={1}>{displayHead}</Text>
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
  // Imperative `router` (not useRouter) — see SidebarEntryCard note: the sheet
  // renders in an RN Modal / the popup in a portal, so navigation must not
  // depend on the surrounding React context.

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
            <Button
              onPress={() => {
                const prev = currentIdx > 0 ? items[currentIdx - 1] : null;
                if (prev) {
                  onOpenChange(false);
                  onNavigate?.(items, prev.id, source.kind === 'wordlist' ? source.source : undefined);
                }
              }}
              disabled={currentIdx <= 0}
              variant="ghost"
              size="sm"
              accessibilityLabel={t('action.previous')}
            >
              <ChevronLeft size={16} color={ICON_MUTED} />
              <Text className={cn(buttonTextClass('ghost'), 'text-xs')}>{t('action.previous')}</Text>
            </Button>
            <Button
              onPress={() => {
                const next = currentIdx >= 0 && currentIdx < items.length - 1 ? items[currentIdx + 1] : null;
                if (next) {
                  onOpenChange(false);
                  onNavigate?.(items, next.id, source.kind === 'wordlist' ? source.source : undefined);
                }
              }}
              disabled={currentIdx < 0 || currentIdx >= items.length - 1}
              variant="ghost"
              size="sm"
              accessibilityLabel={t('action.next')}
            >
              <Text className={cn(buttonTextClass('ghost'), 'text-xs')}>{t('action.next')}</Text>
              <ChevronRight size={16} color={ICON_MUTED} />
            </Button>
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
