'use client';

import type { TocItem } from '@/components/reader/epub-upload';

interface EpubChapterSidebarProps {
  toc: TocItem[];
  currentChapterHref: string | null;
  onLoadChapter: (href: string) => void;
}

/** Recursively render TOC items with indentation. */
function TocTree({
  items,
  currentHref,
  onSelect,
  depth = 0,
}: {
  items: TocItem[];
  currentHref: string | null;
  onSelect: (href: string) => void;
  depth?: number;
}) {
  return (
    <>
      {items.map((item, i) => (
        <div key={`${depth}-${i}`}>
          <button
            onClick={() => onSelect(item.href)}
            className={`block w-full text-left rounded px-3 py-1.5 text-sm transition-colors hover:bg-muted ${
              item.href === currentHref
                ? 'bg-primary/10 text-primary font-medium'
                : 'text-foreground'
            }`}
            style={{ paddingLeft: `${12 + depth * 16}px` }}
          >
            {item.label}
          </button>
          {item.subitems && item.subitems.length > 0 && (
            <TocTree
              items={item.subitems}
              currentHref={currentHref}
              onSelect={onSelect}
              depth={depth + 1}
            />
          )}
        </div>
      ))}
    </>
  );
}

/**
 * EPUB chapter TOC content, rendered inside the shared Sidebar primitive.
 * Chapter navigation lives in the sidebar header; the chapter-count footer
 * lives in the sidebar footer slot.
 */
export function EpubChapterSidebar({
  toc,
  currentChapterHref,
  onLoadChapter,
}: EpubChapterSidebarProps) {
  return (
    <div className="p-2">
      <TocTree
        items={toc}
        currentHref={currentChapterHref}
        onSelect={onLoadChapter}
      />
    </div>
  );
}
