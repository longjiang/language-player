'use client';

import { useT } from '@/hooks/use-t';
import {
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import type { TocItem } from '@/components/reader/epub-upload';

interface EpubChapterSidebarProps {
  toc: TocItem[];
  currentChapterHref: string | null;
  loading: boolean;
  onLoadChapter: (href: string) => void;
  onPrevChapter: () => void;
  onNextChapter: () => void;
  hasPrevChapter: boolean;
  hasNextChapter: boolean;
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

export function EpubChapterSidebar({
  toc,
  currentChapterHref,
  loading,
  onLoadChapter,
  onPrevChapter,
  onNextChapter,
  hasPrevChapter,
  hasNextChapter,
}: EpubChapterSidebarProps) {
  const t = useT();

  return (
    <>
      {/* Chapter nav buttons */}
      <div className="flex items-center gap-1 border-b border-border px-3 py-2">
        <button
          onClick={onPrevChapter}
          disabled={!hasPrevChapter || loading}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          {t('action.previous_chapter')}
        </button>
        <button
          onClick={onNextChapter}
          disabled={!hasNextChapter || loading}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 transition-colors ml-auto"
        >
          {t('action.next_chapter')}
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* TOC */}
      <div className="flex-1 overflow-y-auto p-2">
        <TocTree
          items={toc}
          currentHref={currentChapterHref}
          onSelect={onLoadChapter}
        />
      </div>

      {/* Progress */}
      <div className="border-t border-border px-3 py-2">
        <p className="text-xs text-muted-foreground">
          {toc.length} {t('msg.chapters')}
        </p>
      </div>
    </>
  );
}
