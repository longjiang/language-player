'use client';

import { useRouter } from 'next/navigation';
import { useLanguage } from '@/providers/language-provider';
import { cn } from '@/lib/utils';
import { BookOpen, PanelRightClose } from 'lucide-react';
import { type WordListNavItem } from '@/lib/word-list-navigation';
import { buildEntryRoute } from '@/lib/entry-route';

export interface WordListSidebarProps {
  items: WordListNavItem[];
  currentEntryId: string;
  open: boolean;
  onToggle: () => void;
  /** When provided, called on item click instead of default sessionStorage navigation. */
  onItemClick?: (item: WordListNavItem) => void;
}

/**
 * Collapsible sidebar showing the word list that led to the current entry.
 * Mirrors the NotesSidebar pattern: collapsible panel on the right,
 * current item highlighted, click to navigate.
 */
export function WordListSidebar({
  items,
  currentEntryId,
  open,
  onToggle,
  onItemClick,
}: WordListSidebarProps) {
  const { l1, l2 } = useLanguage();
  const router = useRouter();

  return (
    <aside className={cn(
      'flex-shrink-0 transition-all duration-200',
      open ? 'w-56' : 'w-0 overflow-hidden',
    )}>
      <div className="sticky top-4 rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
          <h3 className="text-sm font-semibold truncate">{items.length} words</h3>
          <button
            onClick={onToggle}
            className="flex-shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title={open ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            <PanelRightClose className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[calc(100vh-16rem)] overflow-y-auto px-1 py-1">
          {items.map((item) => (
            <div
              key={item.id}
              className={cn(
                'group flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm transition-colors cursor-pointer',
                'hover:bg-muted',
                item.id === currentEntryId && 'bg-primary/10 text-primary font-medium',
              )}
              onClick={() => {
                if (onItemClick) {
                  onItemClick(item);
                } else {
                  const route = buildEntryRoute(l1.code, l2.code, item.dictionaryId, item.entryId);
                  router.push(route);
                }
              }}
              title={item.pronunciation ? `${item.head} · ${item.pronunciation}` : item.head}
            >
              <BookOpen className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate">{item.head}</div>
                {(item.pronunciation || item.definition) && (
                  <div className="truncate text-xs text-muted-foreground">
                    {item.pronunciation && <span>{item.pronunciation}</span>}
                    {item.pronunciation && item.definition && <span> · </span>}
                    {item.definition && <span>{item.definition}</span>}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
