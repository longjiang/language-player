'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@/hooks/use-t';
import { useGlyphLang } from '@/hooks/use-glyph-lang';
import { baseCode } from '@/lib/language-data';
import { PYTHON_API_URL } from '@/lib/api-url';
import { getCachedEntries, enqueueLookupWords } from '@/lib/dictionary-cache';
import { DictionaryEntryCard } from '@/components/dictionary-entry-card';
import { fetchSavedWordEntry } from '@/components/dictionary/saved-word-entry-card';
import { Sidebar } from '@/components/ui/sidebar';
import type { SidebarSource } from '@/providers/dictionary-provider';
import type { WordListNavItem } from '@/lib/word-list-navigation';
import type { DictionaryEntry } from '@langplayer/shared';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

export interface WordListSidebarProps {
  /** Mobile: whether the slide-in sheet is open. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Desktop: whether the persistent right panel is expanded. */
  sidebarOpen: boolean;
  /** The word list the user navigated to the current entry from (or none). */
  source: SidebarSource;
  /** Click handler for a word in the sidebar list. The resolved entry is
   *  passed when the item was a search-fallback that has since resolved. */
  onResultClick: (item: WordListNavItem, entry?: DictionaryEntry) => void;
  /** ISO 639-1 code of the target language. */
  l2Code: string;
  /** ISO 639-1 code of the user's L1 (card pronunciation + save context). */
  l1Code: string;
}

/**
 * Whether the dictionary sidebar has a source word list to show. It appears
 * only when the user navigated to the entry from a word list with more than
 * one item — otherwise it is unavailable.
 */
export function isSidebarAvailable(
  source: SidebarSource,
): source is Extract<SidebarSource, { kind: 'list' }> {
  return source.kind === 'list' && source.items.length > 1;
}

/**
 * Dictionary sidebar — shows the word list the user navigated to the current
 * entry from (search results, saved words, or related words), rendered as the
 * same DictionaryEntryCard used everywhere else.
 *
 * Only rendered when there is a source list with more than one item; if the
 * user didn't navigate from a word list (or the list has a single item) the
 * sidebar is unavailable.
 */
export function WordListSidebar({
  open,
  onOpenChange,
  sidebarOpen,
  source,
  onResultClick,
  l1Code,
  l2Code,
}: WordListSidebarProps) {
  const t = useT();

  if (!isSidebarAvailable(source)) return null;

  const title =
    source.source === 'saved'
      ? t('title.saved_words')
      : source.source === 'corpus'
        ? t('title.related')
        : t('msg.result_count', { count: source.items.length });

  // Prev/next over the source list, relative to the entry being viewed.
  const currentIdx = source.items.findIndex((it) => it.id === source.currentId);
  const prevItem = currentIdx > 0 ? source.items[currentIdx - 1] ?? null : null;
  const nextItem =
    currentIdx >= 0 && currentIdx < source.items.length - 1
      ? source.items[currentIdx + 1] ?? null
      : null;

  // Navigate to a neighbouring item. Search-fallback items are resolved first
  // so the click routes to the real entry and keeps the list intact.
  const goTo = async (item: WordListNavItem) => {
    const entry =
      item.dictionaryId === 'unknown' ? (await resolveByHead(item.head, l2Code)) ?? undefined : undefined;
    onResultClick(item, entry);
  };

  return (
    <Sidebar
      open={open}
      onOpenChange={onOpenChange}
      sidebarOpen={sidebarOpen}
      title={title}
      desktopClassName="lg:flex-1 lg:min-w-0 w-56 ml-3"
      headerActions={
        <>
          <button
            type="button"
            onClick={() => prevItem && void goTo(prevItem)}
            disabled={!prevItem}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 transition-colors"
            title={t('action.previous')}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            {t('action.previous')}
          </button>
          <button
            type="button"
            onClick={() => nextItem && void goTo(nextItem)}
            disabled={!nextItem}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 transition-colors"
            title={t('action.next')}
          >
            {t('action.next')}
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </>
      }
    >
      <div className="space-y-3 p-2">
        {source.items.map((item) => (
          <SidebarEntryCard
            key={item.id}
            item={item}
            l1Code={l1Code}
            l2Code={l2Code}
            isActive={item.id === source.currentId}
            onOpen={onResultClick}
          />
        ))}
      </div>
    </Sidebar>
  );
}

/**
 * A single sidebar item — the full DictionaryEntryCard with lazy entry
 * fetching (mirrors SavedWordEntryCard / the Related grid). Entries that
 * can't be resolved fall back to a clickable head that opens a dictionary
 * search.
 */
function SidebarEntryCard({
  item,
  l1Code,
  l2Code,
  isActive,
  onOpen,
}: {
  item: WordListNavItem;
  l1Code: string;
  l2Code: string;
  /** Highlight the card for the entry currently being viewed. */
  isActive: boolean;
  onOpen: (item: WordListNavItem, entry?: DictionaryEntry) => void;
}) {
  const router = useRouter();
  const [entry, setEntry] = useState<DictionaryEntry | null | undefined>(undefined);
  const glyphLang = useGlyphLang(l2Code);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      // Search-fallback items (unknown dictionary id) resolve by head and keep
      // the real entry id; everything else resolves via its composite id.
      const e = item.dictionaryId === 'unknown'
        ? await resolveByHead(item.head, l2Code)
        : await fetchSavedWordEntry(item.id, item.head, l1Code, l2Code);
      if (!cancelled) setEntry(e);
    };
    void load();
    return () => { cancelled = true; };
  }, [item.id, item.head, item.dictionaryId, l1Code, l2Code]);

  let content: ReactNode;
  if (entry === undefined) {
    // Still loading — show the head with a spinner.
    content = (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-3">
        <span className="text-sm font-medium text-muted-foreground" lang={glyphLang}>{item.head}</span>
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
      </div>
    );
  } else if (!entry) {
    // Unresolvable word — clickable head that opens a dictionary search.
    content = (
      <button
        type="button"
        onClick={() => router.push(`/${l1Code}/${l2Code}/dictionary?q=${encodeURIComponent(item.head)}`)}
        className="w-full rounded-lg border border-border bg-card p-3 text-left text-lg font-bold text-foreground transition-colors hover:bg-muted/30"
        lang={glyphLang}
      >
        {item.head}
      </button>
    );
  } else {
    content = (
      <DictionaryEntryCard
        entry={entry}
        variant="compact"
        l2Code={l2Code}
        l1Code={l1Code}
        saveContext={{ form: item.head, text: item.head, textTitle: 'Dictionary' }}
        onClick={() => onOpen(item, entry)}
      />
    );
  }

  // Highlight the entry currently being viewed.
  return isActive ? (
    <div className="rounded-lg ring-2 ring-primary">{content}</div>
  ) : (
    content
  );
}

/**
 * Resolve an entry by its head, keeping the real dictionary entry id (unlike
 * fetchSavedWordEntry, which normalizes the id to the saved composite). Used
 * for search-fallback sidebar items whose real ids weren't known when the
 * source list was built.
 */
async function resolveByHead(head: string, l2Code: string): Promise<DictionaryEntry | null> {
  const base = baseCode(l2Code);
  const cached = getCachedEntries(base, head);
  if (cached && cached.length > 0) return cached[0] ?? null;
  await enqueueLookupWords([{ text: head, l2Code: base }], PYTHON_API_URL);
  return getCachedEntries(base, head)?.[0] ?? null;
}

