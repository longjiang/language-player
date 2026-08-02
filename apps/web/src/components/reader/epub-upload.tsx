'use client';

import { useState, useRef, useCallback } from 'react';
import { useT } from '@/hooks/use-t';
import { Button } from '@/components/ui/button';
import {
  Upload, FileText,
} from 'lucide-react';

export interface TocItem {
  href: string;
  label: string;
  subitems?: TocItem[];
}

interface EpubUploadProps {
  /** Called with the decoded contents of every valid .epub file dropped/selected. */
  onFilesLoaded: (files: Array<{ data: ArrayBuffer; fileName: string }>) => void;
  /** Error message to display (e.g. parse failure from parent). */
  error?: string | null;
  /** Compact variant for embedding above the bookshelf. */
  compact?: boolean;
  /** Book-card-sized dashed tile rendered inline in the bookshelf grid. */
  slot?: boolean;
}

export function EpubUpload({
  onFilesLoaded,
  error,
  compact = false,
  slot = false,
}: EpubUploadProps) {
  const t = useT();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const epubFiles = Array.from(files).filter(f => f.name.toLowerCase().endsWith('.epub'));
    if (epubFiles.length === 0) {
      setLocalError(t('msg.epub_not_supported'));
      return;
    }
    setLocalError(null);
    try {
      const loaded = await Promise.all(epubFiles.map(async (file) => ({
        data: await file.arrayBuffer(),
        fileName: file.name,
      })));
      onFilesLoaded(loaded);
    } catch {
      setLocalError(t('msg.epub_file_unreadable'));
    }
  }, [onFilesLoaded, t]);

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
          flex min-h-[150px] h-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-3 text-center transition-all
          focus:outline-none focus-visible:ring-2 focus-visible:ring-primary
          ${dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/30'}
        `}
      >
        <Upload className="h-6 w-6 text-muted-foreground/50" />
        <p className="text-xs leading-snug text-muted-foreground">
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
        {(localError || error) && (
          <p className="text-xs text-destructive">{localError || error}</p>
        )}
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
        {(localError || error) && (
          <p className="mt-4 text-sm text-destructive">{localError || error}</p>
        )}
      </div>
    </div>
  );
}
