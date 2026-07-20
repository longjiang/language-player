'use client';

import { useState, useRef, useCallback } from 'react';
import { useT } from '@/hooks/use-t';
import { Button } from '@/components/ui/button';
import {
  BookOpen, Upload, FileText, ChevronLeft, ChevronRight, Loader2, X,
} from 'lucide-react';

export interface TocItem {
  href: string;
  label: string;
  subitems?: TocItem[];
}

interface EpubUploadProps {
  /** Called when a chapter is selected and its HTML is ready. */
  onChapterLoaded: (html: string, title: string, href: string) => void;
  /** Called with the raw ArrayBuffer when a new file is uploaded. */
  onFileLoaded: (data: ArrayBuffer, fileName: string) => void;
  /** The current TOC (null if no book loaded). */
  toc: TocItem[] | null;
  /** Current chapter href for highlighting. */
  currentChapterHref: string | null;
  /** Cover image data URL. */
  coverUrl: string | null;
  /** Callback to load a chapter by href. */
  onLoadChapter: (href: string) => Promise<void>;
  /** Callback to close/go back from EPUB mode. */
  onClose: () => void;
  /** Whether the book is currently loading a chapter. */
  loading?: boolean;
  /** Previous/next chapter callbacks. */
  onPrevChapter?: () => void;
  onNextChapter?: () => void;
  hasPrevChapter?: boolean;
  hasNextChapter?: boolean;
  /** Current chapter title. */
  chapterTitle?: string | null;
  /** Whether the user has tapped the cover to start reading. */
  coverTapped: boolean;
  onCoverTap: () => void;
  /** Stored EPUB file name. */
  fileName?: string | null;
}

export function EpubUpload({
  onChapterLoaded,
  onFileLoaded,
  toc,
  currentChapterHref,
  coverUrl,
  onLoadChapter,
  onClose,
  loading,
  onPrevChapter,
  onNextChapter,
  hasPrevChapter,
  hasNextChapter,
  chapterTitle,
  coverTapped,
  onCoverTap,
  fileName,
}: EpubUploadProps) {
  const t = useT();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showToc, setShowToc] = useState(false);

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.endsWith('.epub')) return;
    const arrayBuffer = await file.arrayBuffer();
    onFileLoaded(arrayBuffer, file.name);
  }, [onFileLoaded]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  /** Recursively render TOC items with indentation for nesting. */
  function renderTocItems(
    items: TocItem[],
    currentHref: string | null,
    onSelect: (href: string) => void,
    depth: number = 0,
  ) {
    return items.map((item, i) => (
      <div key={`${depth}-${i}`}>
        <button
          onClick={() => onSelect(item.href)}
          className={`block w-full text-left rounded px-3 py-1.5 text-sm transition-colors hover:bg-muted ${
            item.href === currentHref ? 'bg-muted font-medium' : ''
          }`}
          style={{ paddingLeft: `${12 + depth * 16}px` }}
        >
          {item.label}
        </button>
        {item.subitems && item.subitems.length > 0 &&
          renderTocItems(item.subitems, currentHref, onSelect, depth + 1)}
      </div>
    ));
  }

  // ── Upload zone ──
  if (!toc) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh]">
        <div
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          className={`
            w-full max-w-lg rounded-xl border-2 border-dashed p-10 text-center transition-all
            ${dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/30'}
          `}
        >
          <Upload className="mx-auto mb-4 h-12 w-12 text-muted-foreground/40" />
          <p className="mb-2 text-sm text-muted-foreground">
            {t('msg.drop_epub_here')}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            <FileText className="mr-1.5 h-4 w-4" />
            {t('action.browse')}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".epub"
            hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
          {fileName && (
            <p className="mt-4 text-xs text-muted-foreground">
              {t('msg.last_epub', { name: fileName })}
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── Book loaded — cover / reading ──
  return (
    <div className="flex flex-col min-h-0 flex-1">
      {/* Header bar with chapter nav */}
      <div className="flex items-center gap-2 mb-3 text-sm">
        <button
          onClick={onClose}
          className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title={t('action.close')}
        >
          <X className="h-4 w-4" />
        </button>
        <span className="text-xs text-muted-foreground truncate flex-1">
          {chapterTitle || fileName}
        </span>
        <button
          onClick={() => setShowToc(o => !o)}
          className="rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          {t('action.table_of_contents')}
        </button>
        {onPrevChapter && (
          <button
            onClick={onPrevChapter}
            disabled={!hasPrevChapter}
            className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
        {onNextChapter && (
          <button
            onClick={onNextChapter}
            disabled={!hasNextChapter}
            className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* TOC dropdown */}
      {showToc && toc.length > 0 && (
        <div className="mb-3 rounded-lg border border-border bg-card p-2 max-h-60 overflow-y-auto">
          {renderTocItems(toc, currentChapterHref, async (href) => {
            setShowToc(false);
            await onLoadChapter(href);
          })}
        </div>
      )}

      {/* Cover */}
      {coverUrl && !coverTapped && (
        <div className="flex items-center justify-center min-h-0 flex-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={coverUrl}
            alt="Cover"
            className="max-h-[70vh] max-w-full cursor-pointer rounded-lg shadow-xl transition-transform hover:scale-[1.02]"
            onClick={onCoverTap}
          />
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center min-h-0 flex-1">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}
