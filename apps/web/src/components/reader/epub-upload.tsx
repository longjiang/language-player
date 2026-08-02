'use client';

import { useState, useRef, useCallback } from 'react';
import { useT } from '@/hooks/use-t';
import { Button } from '@/components/ui/button';
import {
  Upload, FileText,
} from 'lucide-react';

/** A successfully read .epub file, ready to be stored. */
export interface EpubFileInput {
  data: ArrayBuffer;
  fileName: string;
  fileSize: number;
}

/** A file that could not be imported, with the reason as a translation key. */
export interface EpubFileError {
  fileName: string;
  fileSize: number;
  reasonKey: string;
}

export interface EpubUploadResult {
  files: EpubFileInput[];
  failures: EpubFileError[];
}

export interface TocItem {
  href: string;
  label: string;
  subitems?: TocItem[];
}

interface EpubUploadProps {
  /** Called with readable .epub files plus any files that failed up front. */
  onFilesProcessed: (result: EpubUploadResult) => void;
  /** Global error message to display (e.g. parse failure from parent). */
  error?: string | null;
  /** Compact variant for embedding above the bookshelf. */
  compact?: boolean;
  /** Book-card-sized dashed tile rendered inline in the bookshelf grid. */
  slot?: boolean;
}

export function EpubUpload({
  onFilesProcessed,
  error,
  compact = false,
  slot = false,
}: EpubUploadProps) {
  const t = useT();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files);
    const failures: EpubFileError[] = [];
    const epubFiles: File[] = [];
    for (const f of list) {
      if (f.name.toLowerCase().endsWith('.epub')) {
        epubFiles.push(f);
      } else {
        failures.push({ fileName: f.name, fileSize: f.size, reasonKey: 'msg.epub_not_supported' });
      }
    }

    const loaded: EpubFileInput[] = [];
    for (const file of epubFiles) {
      try {
        const data = await file.arrayBuffer();
        loaded.push({ data, fileName: file.name, fileSize: file.size });
      } catch {
        failures.push({ fileName: file.name, fileSize: file.size, reasonKey: 'msg.epub_file_unreadable' });
      }
    }
    onFilesProcessed({ files: loaded, failures });
  }, [onFilesProcessed]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const input = (
    <input
      ref={fileInputRef}
      type="file"
      accept=".epub"
      multiple
      hidden
      onChange={(e) => {
        if (e.target.files && e.target.files.length > 0) handleFiles(e.target.files);
        e.target.value = '';
      }}
    />
  );

  if (slot) {
    return (
      <div className="flex h-full flex-col items-start gap-2 p-2">
        <div
          role="button"
          tabIndex={0}
          aria-label={t('action.browse')}
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          className={`
            flex aspect-[2/3] w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-3 text-center transition-all
            focus:outline-none focus-visible:ring-2 focus-visible:ring-primary
            ${dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/30'}
          `}
        >
          <Upload className="h-6 w-6 text-muted-foreground/50" />
          <p className="my-3 text-xs leading-snug text-muted-foreground">
            {t('msg.drop_epub_here')}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
          >
            <FileText className="mr-1.5 h-4 w-4" />
            {t('action.browse')}
          </Button>
          {input}
          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}
        </div>
        <span className="w-full truncate text-sm font-medium text-muted-foreground">
          {t('msg.add_book')}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center justify-center ${compact ? '' : 'min-h-[40vh]'}`}>
      <div
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        className={`
          w-full max-w-lg rounded-xl border-2 border-dashed text-center transition-all
          ${compact ? 'p-6' : 'p-10'}
          ${dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/30'}
        `}
      >
        <Upload className={`mx-auto mb-3 text-muted-foreground/40 ${compact ? 'h-8 w-8' : 'h-12 w-12'}`} />
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
        {input}
        {error && (
          <p className="mt-4 text-sm text-destructive">{error}</p>
        )}
      </div>
    </div>
  );
}
