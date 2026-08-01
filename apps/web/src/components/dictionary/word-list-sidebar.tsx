'use client';

import { usePathname } from 'next/navigation';
import * as Dialog from '@radix-ui/react-dialog';
import { useT } from '@/hooks/use-t';
import { SaveButton } from '@/components/save-button';
import { SavedWordEntryCard } from '@/components/dictionary/saved-word-entry-card';
import { WordListItem } from '@/components/dictionary/word-list';
import { cn } from '@/lib/utils';
import type { SidebarSource } from '@/providers/dictionary-provider';
import type { WordListNavItem } from '@/lib/word-list-navigation';
import type { SavedLexicalItemRecord } from '@langplayer/shared';
import { BookOpen, X } from 'lucide-react';

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

type SidebarPanelProps = Omit<
  WordListSidebarProps,
  'open' | 'onOpenChange' | 'sidebarOpen'
> & {
  title: string;
  /** When provided, renders the close button (mobile sheet). */
  onClose?: () => void;
  /** Whether the empty state is visible (hidden when the desktop panel is collapsed). */
  showEmptyState: boolean;
};

/**
 * Dictionary sidebar — the shared panel rendered in the desktop aside and the
 * mobile slide-in sheet. The mobile sheet is a Radix Dialog so it gets focus
 * trapping, scroll locking, Escape handling, and proper ARIA wiring for free.
 */
export function WordListSidebar({
  open,
  onOpenChange,
  sidebarOpen,
  ...panelProps
}: WordListSidebarProps) {
  const t = useT();
  const title =
    panelProps.source.kind === 'results'
      ? t('msg.result_count', { count: panelProps.source.items.length })
      : t('title.saved_words');

  return (
    <>
      {/* Desktop: persistent collapsible panel */}
      <aside
        className={cn(
          'hidden lg:flex flex-shrink-0 transition-all duration-200',
          sidebarOpen ? 'lg:flex-1 lg:min-w-0 w-56 ml-3' : 'lg:w-0 overflow-hidden',
        )}
      >
        <SidebarPanel
          {...panelProps}
          title={title}
          showEmptyState={sidebarOpen}
        />
      </aside>

      {/* Mobile: Radix Dialog sheet */}
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/10 duration-200 supports-backdrop-filter:backdrop-blur-xs data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
          <Dialog.Content
            aria-describedby={undefined}
            className="fixed inset-y-0 right-0 z-50 flex h-full w-80 max-w-[85vw] flex-col bg-background shadow-lg outline-none duration-200 data-[state=open]:animate-in data-[state=open]:slide-in-from-right-full data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right-full"
          >
            <Dialog.Title className="sr-only">{title}</Dialog.Title>
            <SidebarPanel
              {...panelProps}
              title={title}
              showEmptyState
              onClose={() => onOpenChange(false)}
            />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

function SidebarPanel({
  source,
  savedLoaded,
  getSavedWords,
  l1Code,
  l2Code,
  onResultClick,
  onSavedWordClick,
  title,
  onClose,
  showEmptyState,
}: SidebarPanelProps) {
  const t = useT();
  const pathname = usePathname();

  return (
    <div className="w-full rounded-xl border border-border bg-card h-full flex flex-col overflow-hidden">
      <div className="flex items-center border-b border-border px-3 py-2">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {title}
        </h3>
        {onClose && (
          <button
            onClick={onClose}
            className="ml-auto rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label={t('action.close')}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto px-1 py-1">
        {source.kind === 'saved' && savedLoaded ? (
          <SavedWordsSidebarContent
            l2Code={l2Code}
            l1Code={l1Code}
            getSavedWords={getSavedWords}
            onWordClick={onSavedWordClick}
            currentEntryId={currentEntryIdFromPath(pathname)}
          />
        ) : source.kind === 'results' && source.items.length > 0 ? (
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
        ) : showEmptyState ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center p-4">
              <BookOpen className="mx-auto h-8 w-8 text-muted-foreground/50" />
              <p className="mt-2 text-xs text-muted-foreground">
                {savedLoaded ? t('msg.no_saved_words') : t('msg.loading')}
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
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
