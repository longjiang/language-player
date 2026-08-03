'use client';

import type { TocMarker, TocNode } from '@/lib/epub-book-types';
import { markerForLocation } from '@/hooks/use-epub';

interface EpubChapterSidebarProps {
  toc: TocNode[];
  /** Resolved TOC markers (may be null while building). */
  markers: TocMarker[] | null;
  /** Current reading location — determines the highlighted entry. */
  activeLocation: { spineIndex: number; blockIndex: number; offset: number } | null;
  onLoadChapter: (href: string) => void;
}

/** Recursively render TOC items with indentation and ancestor highlighting. */
function TocTree({
  items,
  activePath,
  onSelect,
  depth = 0,
}: {
  items: TocNode[];
  activePath: TocNode[];
  onSelect: (href: string) => void;
  depth?: number;
}) {
  return (
    <>
      {items.map((item, i) => {
        const active = activePath.includes(item);
        const isCurrent = activePath[activePath.length - 1] === item;
        return (
          <div key={item.id ?? `${depth}-${i}`}>
            <button
              onClick={() => onSelect(item.href)}
              className={`block w-full text-left rounded px-3 py-1.5 text-sm transition-colors hover:bg-muted ${
                isCurrent
                  ? 'bg-primary/10 text-primary font-medium'
                  : active
                    ? 'text-primary/80'
                    : 'text-foreground'
              }`}
              style={{ paddingLeft: `${12 + depth * 16}px` }}
            >
              {item.label}
            </button>
            {item.children.length > 0 && (
              <TocTree
                items={item.children}
                activePath={activePath}
                onSelect={onSelect}
                depth={depth + 1}
              />
            )}
          </div>
        );
      })}
    </>
  );
}

/**
 * EPUB chapter TOC content, rendered inside the shared Sidebar primitive.
 * Highlights the TOC entry containing the current location, including its
 * ancestors (a mid-spine fragment inside a part highlights the part too).
 */
export function EpubChapterSidebar({
  toc,
  markers,
  activeLocation,
  onLoadChapter,
}: EpubChapterSidebarProps) {
  const activePath: TocNode[] = activeLocation && markers
    ? markerForLocation(markers, activeLocation)?.path ?? []
    : [];
  return (
    <div className="p-2">
      <TocTree items={toc} activePath={activePath} onSelect={onLoadChapter} />
    </div>
  );
}
