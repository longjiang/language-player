'use client';

import { useMemo, type ReactNode } from 'react';
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
  /**
   * When provided, rows are grouped consecutively by this key (adjacent rows
   * sharing a key form one group) and `renderGroupHeader` is called before
   * each new group. Headers don't carry `data-row-index`, so lazy-loading
   * observers stay aligned with flat row indexes.
   */
  groupKeyFor?: (item: T, index: number) => string | null | undefined;
  /** Group keys whose rows should be hidden (collapsed) but whose header stays visible. */
  collapsedGroups?: ReadonlySet<string>;
  /** Called with a group key when the user toggles a group header. */
  onToggleGroup?: (key: string) => void;
  /** Renders the collapsible header that begins each group. */
  renderGroupHeader?: (group: {
    key: string;
    item: T;
    /** Flat index of the first row in the group. */
    index: number;
    /** Number of rows in the group. */
    count: number;
    /** Whether this group's rows are hidden. */
    collapsed: boolean;
    /** Toggle this group's collapsed state. */
    onToggle: () => void;
    /** True for the first group rendered in the list. */
    isFirst: boolean;
  }) => ReactNode;
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
  groupKeyFor,
  collapsedGroups,
  onToggleGroup,
  renderGroupHeader,
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
        <GroupedRows
          items={items}
          keyFor={keyFor}
          renderRow={renderRow}
          groupKeyFor={groupKeyFor}
          collapsedGroups={collapsedGroups}
          onToggleGroup={onToggleGroup}
          renderGroupHeader={renderGroupHeader}
        />
      )}
    </div>
  );
}

interface GroupedRowsProps<T> {
  items: readonly T[];
  keyFor: (item: T, index: number) => string;
  renderRow: (item: T, index: number) => ReactNode;
  groupKeyFor?: (item: T, index: number) => string | null | undefined;
  collapsedGroups?: ReadonlySet<string>;
  onToggleGroup?: (key: string) => void;
  renderGroupHeader?: (group: {
    key: string;
    item: T;
    index: number;
    count: number;
    collapsed: boolean;
    /** True for the first group rendered in the list. */
    isFirst: boolean;
    onToggle: () => void;
  }) => ReactNode;
}

/** Renders rows in `space-y-1`, partitioning them into consecutive groups by
 *  `groupKeyFor` (when provided). Each group begins with its header (rendered
 *  by `renderGroupHeader`); rows in a collapsed group are not rendered. Header
 *  handles stay mounted so toggling is always possible. Row elements keep
 *  `data-row-index` aligned to their flat index so lazy observers can find them. */
function GroupedRows<T>({
  items,
  keyFor,
  renderRow,
  groupKeyFor,
  collapsedGroups,
  onToggleGroup,
  renderGroupHeader,
}: GroupedRowsProps<T>) {
  // Consecutive runs of rows sharing the same (truthy) group key.
  const groups = useMemo(() => {
    if (!groupKeyFor || !renderGroupHeader) return null;
    const runs: { key: string; start: number; end: number }[] = [];
    for (let i = 0; i < items.length; i++) {
      const key = groupKeyFor(items[i]!, i);
      if (!key) continue;
      const last = runs[runs.length - 1];
      if (last && last.key === key) last.end = i + 1;
      else runs.push({ key, start: i, end: i + 1 });
    }
    return runs;
  }, [items, groupKeyFor, renderGroupHeader]);

  if (!groupKeyFor || !renderGroupHeader || !groups) {
    // No grouping — plain row list.
    return (
      <div className="space-y-1">
        {items.map((item, i) => (
          <div key={keyFor(item, i)} data-row-index={i}>
            {renderRow(item, i)}
          </div>
        ))}
      </div>
    );
  }

  const rows: ReactNode[] = [];
  let gi = 0; // next group whose start === i (groups sorted by start)
  for (let i = 0; i < items.length; i++) {
    // A group begins at exactly this flat index: emit its header (and, when
    // collapsed, skip its rows). When expanded we still render the first row
    // below in the same iteration.
    if (gi < groups.length && groups[gi]!.start === i) {
      const group = groups[gi]!;
      const collapsed = collapsedGroups?.has(group.key) ?? false;
      const isFirst = gi === 0;
      rows.push(
        <div key={`group-${group.key}-${group.start}`}>
          {renderGroupHeader({
            key: group.key,
            item: items[i]!,
            index: i,
            count: group.end - group.start,
            collapsed,
            isFirst,
            onToggle: () => onToggleGroup?.(group.key),
          })}
        </div>,
      );
      gi++;
      if (collapsed) {
        i = group.end - 1; // skip the group's rows; loop i++ lands past the group
        continue;
      }
      // not collapsed — fall through to render this first row of the group
    }
    rows.push(
      <div key={keyFor(items[i]!, i)} data-row-index={i}>
        {renderRow(items[i]!, i)}
      </div>,
    );
  }
  return <div className="space-y-1">{rows}</div>;
}
