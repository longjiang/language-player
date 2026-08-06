'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@/hooks/use-t';
import { DictionaryEntryCard } from '@/components/dictionary-entry-card';
import { fetchSavedWordEntry } from '@/components/dictionary/saved-word-entry-card';
import { Sidebar } from '@/components/ui/sidebar';
import type { SidebarSource } from '@/providers/dictionary-provider';
import type { WordListNavItem } from '@/lib/word-list-navigation';
import type { DictionaryEntry } from '@langplayer/shared';
import { Loader2 } from 'lucide-react';

export interface WordListSidebarProps {
  /** Mobile: whether the slide-in sheet is open. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Desktop: whether the persistent right panel is expanded. */
  sidebarOpen: boolean;
  /** The word list the user navigated to the current entry from (or none). */
  source: SidebarSource;
  /** Click handler for a word in the sidebar list. */
  onResultClick: (item: WordListNavItem) => void;
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

  return (
    <Sidebar
      open={open}
      onOpenChange={onOpenChange}
      sidebarOpen={sidebarOpen}
      title={title}
      desktopClassName="lg:flex-1 lg:min-w-0 w-56 ml-3"
    >
      <div className="space-y-3 p-2">
        {source.items.map((item) => (
          <SidebarEntryCard
            key={item.id}
            item={item}
            l1Code={l1Code}
            l2Code={l2Code}
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
  onOpen,
}: {
  item: WordListNavItem;
  l1Code: string;
  l2Code: string;
  onOpen: (item: WordListNavItem) => void;
}) {
  const router = useRouter();
  const [entry, setEntry] = useState<DictionaryEntry | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void fetchSavedWordEntry(item.id, item.head, l1Code, l2Code).then((e) => {
      if (!cancelled) setEntry(e);
    });
    return () => { cancelled = true; };
  }, [item.id, item.head, l1Code, l2Code]);

  // Still loading — show the head with a spinner.
  if (entry === undefined) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-3">
        <span className="text-sm font-medium text-muted-foreground" lang={l2Code}>{item.head}</span>
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Unresolvable word — clickable head that opens a dictionary search.
  if (!entry) {
    return (
      <button
        type="button"
        onClick={() => router.push(`/${l1Code}/${l2Code}/dictionary?q=${encodeURIComponent(item.head)}`)}
        className="w-full rounded-lg border border-border bg-card p-3 text-left text-lg font-bold text-foreground transition-colors hover:bg-muted/30"
        lang={l2Code}
      >
        {item.head}
      </button>
    );
  }

  return (
    <DictionaryEntryCard
      entry={entry}
      variant="compact"
      l2Code={l2Code}
      l1Code={l1Code}
      saveContext={{ form: item.head, text: item.head, textTitle: 'Dictionary' }}
      onClick={() => onOpen(item)}
    />
  );
}

