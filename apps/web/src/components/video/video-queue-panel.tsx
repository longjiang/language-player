'use client';

import type { ReactNode } from 'react';
import { useT } from '@/hooks/use-t';
import { Search, ArrowUpDown } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface QueueSortOption {
  value: string;
  label: string;
}

interface VideoQueuePanelProps<T> {
  /** Items to render (already filtered/sorted by the parent when filter/sort is used). */
  items: readonly T[];
  /** Renders one row. The row element gets `data-row-index` for lazy-loading observers. */
  renderRow: (item: T, index: number) => ReactNode;
  /** Stable key per item. */
  keyFor: (item: T, index: number) => string;
  /** Shown when items is empty. */
  emptyText: string;
  /** Optional header shown above the toolbar/list (e.g. "N videos matching X"). */
  header?: ReactNode;
  /** Optional filter toolbar — shown when onFilterChange is provided. */
  filterValue?: string;
  onFilterChange?: (value: string) => void;
  filterPlaceholder?: string;
  /** Optional sort toolbar — shown when sortOptions is provided. */
  sortValue?: string;
  onSortChange?: (value: string) => void;
  sortOptions?: QueueSortOption[];
  /** Draw a bottom border under the toolbar. Default: true. */
  toolbarBorder?: boolean;
}

/**
 * The shared queue list component used by both the watch page's queue tab
 * (queue videos, no toolbar) and the subs search results' queue tab (search
 * results with filter + sort). Rows are provided by the parent via renderRow.
 */
export function VideoQueuePanel<T>({
  items,
  renderRow,
  keyFor,
  emptyText,
  header,
  filterValue,
  onFilterChange,
  filterPlaceholder,
  sortValue,
  onSortChange,
  sortOptions,
  toolbarBorder = true,
}: VideoQueuePanelProps<T>) {
  const t = useT();
  const showToolbar = Boolean(onFilterChange || (sortOptions && onSortChange));

  return (
    <div>
      {header && <div className="mb-2">{header}</div>}

      {showToolbar && (
        <div
          className={`mb-2 flex items-center gap-2 ${toolbarBorder ? 'border-b border-border pb-2' : 'pb-2'}`}
        >
          {onFilterChange && (
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={filterValue ?? ''}
                onChange={(e) => onFilterChange(e.target.value)}
                placeholder={filterPlaceholder ?? t('placeholder.filter')}
                className="h-8 w-full rounded-md border border-border bg-muted/50 pl-7 pr-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          )}
          {sortOptions && onSortChange && (
            <Select value={sortValue} onValueChange={onSortChange}>
              <SelectTrigger size="default" className="h-8 rounded-md bg-muted/50 text-xs">
                <span className="flex items-center gap-1.5 pl-0.5">
                  <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                  <SelectValue />
                </span>
              </SelectTrigger>
              <SelectContent>
                {sortOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      {items.length === 0 ? (
        <p className="py-8 text-center text-xs text-muted-foreground">{emptyText}</p>
      ) : (
        <div className="space-y-1">
          {items.map((item, i) => (
            <div key={keyFor(item, i)} data-row-index={i}>
              {renderRow(item, i)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
