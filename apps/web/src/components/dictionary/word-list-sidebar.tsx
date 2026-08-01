'use client';

import { usePathname } from 'next/navigation';
import { useT } from '@/hooks/use-t';
import { SaveButton } from '@/components/save-button';
import { SavedWordEntryCard } from '@/components/dictionary/saved-word-entry-card';
import { WordListItem } from '@/components/dictionary/word-list';
import { Sidebar } from '@/components/ui/sidebar';
import type { SidebarSource } from '@/providers/dictionary-provider';
import type { WordListNavItem } from '@/lib/word-list-navigation';
import type { SavedLexicalItemRecord } from '@langplayer/shared';
import { BookOpen } from 'lucide-react';

export interface WordListSidebarProps {
  /** Mobile: whether the slide-in sheet is open. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Desktop: whether the persistent right panel is expanded. */
  sidebarOpen: boolean;
  source: SidebarSource;
  savedLoaded: boolean;
  getSavedWords: (l2: string) => SavedLexicalItemRecord[];
  l1Code: string;
  l2Code: string;
  onResultClick: (item: WordListNavItem) => void;
  onSavedWordClick: (word: SavedLexicalItemRecord) => void;
}

/**
 * Dictionary sidebar content, rendered inside the shared Sidebar primitive.
 * Shows either the saved-words list or the search results that led to the
 * current entry, with an empty/loading state when neither is available.
 */
export function WordListSidebar({
  open,
  onOpenChange,
  sidebarOpen,
  source,
  savedLoaded,
  getSavedWords,
  l1Code,
  l2Code,
  onResultClick,
  onSavedWordClick,
}: WordListSidebarProps) {
  const t = useT();
  const pathname = usePathname();

  const title =
    source.kind === 'results'
      ? t('msg.result_count', { count: source.items.length })
      : t('title.saved_words');

  let content: React.ReactNode = null;
  if (source.kind === 'saved' && savedLoaded) {
    content = (
      <SavedWordsSidebarContent
        l2Code={l2Code}
        l1Code={l1Code}
        getSavedWords={getSavedWords}
        onWordClick={onSavedWordClick}
        currentEntryId={currentEntryIdFromPath(pathname)}
      />
    );
  } else if (source.kind === 'results' && source.items.length > 0) {
    content = (
      <div className="space-y-0.5">
        {source.items.map((e) => {
          const compositeId = `${e.dictionary?.id ?? 'llm'}-${e.id}`;
          const parts = pathname.split('/');
          const dIdx = parts.indexOf('entry') + 1;
          const eIdx = dIdx + 1;
          const d = parts[dIdx] ?? '';
          const entry = parts[eIdx] ? decodeURIComponent(parts[eIdx]).replace(/~/g, ',') : '';
          const isActive = `${d}-${entry}` === compositeId;
          return (
            <WordListItem
              key={compositeId}
              head={e.head}
              prefix={
                <div onClick={(ev) => ev.stopPropagation()} className="-m-1">
                  <SaveButton
                    wordId={e.id}
                    head={e.head}
                    context={{
                      form: e.head,
                      text: e.head,
                      textTitle: 'Dictionary',
                    }}
                    size="icon"
                  />
                </div>
              }
              definitionSlot={
                (e.pronunciation || e.definitions?.length) ? (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground/80">
                    {e.pronunciation && <span className="mr-1.5 text-muted-foreground/50">{e.pronunciation}</span>}
                    {e.definitions?.length ? <span>{e.definitions.join('; ')}</span> : null}
                  </p>
                ) : undefined
              }
              compact
              onClick={() => onResultClick({
                head: e.head,
                dictionaryId: e.dictionary?.id ?? 'llm',
                entryId: e.id,
                id: compositeId,
              })}
            />
          );
        })}
      </div>
    );
  }

  const emptyState = (sidebarOpen || open) ? (
    <div className="flex items-center justify-center h-full">
      <div className="text-center p-4">
        <BookOpen className="mx-auto h-8 w-8 text-muted-foreground/50" />
        <p className="mt-2 text-xs text-muted-foreground">
          {savedLoaded ? t('msg.no_saved_words') : t('msg.loading')}
        </p>
      </div>
    </div>
  ) : undefined;

  return (
    <Sidebar
      open={open}
      onOpenChange={onOpenChange}
      sidebarOpen={sidebarOpen}
      title={title}
      desktopClassName="lg:flex-1 lg:min-w-0 w-56 ml-3"
      emptyState={emptyState}
    >
      {content}
    </Sidebar>
  );
}

// ── Saved Words sidebar content ──────────────

function SavedWordsSidebarContent({
  l2Code,
  l1Code,
  getSavedWords,
  onWordClick,
  currentEntryId,
}: {
  l2Code: string;
  l1Code: string;
  getSavedWords: (l2: string) => SavedLexicalItemRecord[];
  onWordClick: (word: SavedLexicalItemRecord) => void;
  currentEntryId: string | null;
}) {
  const t = useT();
  const words = getSavedWords(l2Code);

  if (words.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-xs text-muted-foreground px-3 py-4">{t('msg.no_saved_words')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-2">
      {words.map((word) => (
        <SavedWordEntryCard
          key={word.id}
          word={word}
          l1Code={l1Code}
          l2Code={l2Code}
          onClick={() => onWordClick(word)}
        />
      ))}
    </div>
  );
}

/** Extract the `dictionaryId-entryId` composite from the current path, if on an entry page. */
function currentEntryIdFromPath(pathname: string): string | null {
  if (!pathname.includes('/entry/')) return null;
  const parts = pathname.split('/');
  const dIdx = parts.indexOf('entry') + 1;
  const eIdx = dIdx + 1;
  const d = parts[dIdx] ?? '';
  const e = parts[eIdx] ? decodeURIComponent(parts[eIdx]).replace(/~/g, ',') : '';
  return `${d}-${e}`;
}
