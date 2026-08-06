'use client';

import { useT } from '@/hooks/use-t';
import { SaveButton } from '@/components/save-button';
import { WordListItem } from '@/components/dictionary/word-list';
import { Sidebar } from '@/components/ui/sidebar';
import type { SidebarSource } from '@/providers/dictionary-provider';
import type { WordListNavItem } from '@/lib/word-list-navigation';

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
}

/**
 * Dictionary sidebar — shows the word list the user navigated to the current
 * entry from (search results or saved words).
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
}: WordListSidebarProps) {
  const t = useT();

  if (source.kind !== 'list' || source.items.length <= 1) return null;

  const title =
    source.source === 'saved'
      ? t('title.saved_words')
      : t('msg.result_count', { count: source.items.length });

  return (
    <Sidebar
      open={open}
      onOpenChange={onOpenChange}
      sidebarOpen={sidebarOpen}
      title={title}
      desktopClassName="lg:flex-1 lg:min-w-0 w-56 ml-3"
    >
      <div className="space-y-0.5">
        {source.items.map((e) => (
          <WordListItem
            key={e.id}
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
              e.pronunciation || e.definition ? (
                <p className="mt-0.5 truncate text-xs text-muted-foreground/80">
                  {e.pronunciation && <span className="mr-1.5 text-muted-foreground/50">{e.pronunciation}</span>}
                  {e.definition ? <span>{e.definition}</span> : null}
                </p>
              ) : undefined
            }
            compact
            onClick={() => onResultClick(e)}
          />
        ))}
      </div>
    </Sidebar>
  );
}

