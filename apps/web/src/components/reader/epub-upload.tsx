'use client';

import { useState, useRef, useCallback } from 'react';
import { useT } from '@/hooks/use-t';
import { Button } from '@/components/ui/button';
import {
  Upload, FileText,
} from 'lucide-react';
import {
  folderFilesFromDrop,
  folderNameFromFiles,
  unwrapEpubZip,
  zipEpubFolder,
  type EpubFolderFile,
} from '@/lib/epub-folder';

/**
 * True when any item in a drag-drop `DataTransfer` is a directory (an
 * extracted EPUB folder). A drop of one or more plain files — including a
 * multi-file selection of `.epub` files — never contains a directory entry,
 * so it must go through the normal file handler, not the folder-EPUB import.
 */
function dropHasDirectory(items: DataTransferItemList | DataTransferItem[]): boolean {
  const list = Array.from(items);
  for (const item of list) {
    const getEntry = (item as unknown as { webkitGetAsEntry?: () => FileSystemEntry | null }).webkitGetAsEntry;
    const entry = getEntry?.call(item);
    if (entry?.isDirectory) return true;
  }
  return false;
}

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
    const loaded: EpubFileInput[] = [];
    for (const f of list) {
      if (f.name.toLowerCase().endsWith('.epub')) {
        try {
          const data = await f.arrayBuffer();
          loaded.push({ data, fileName: f.name, fileSize: f.size });
        } catch {
          failures.push({ fileName: f.name, fileSize: f.size, reasonKey: 'msg.epub_file_unreadable' });
        }
        continue;
      }
      // .epub.zip / .zip — an EPUB (or extracted EPUB folder) wrapped in a
      // ZIP container; unwrap it before importing.
      if (/\.(epub\.)?zip$/i.test(f.name)) {
        try {
          const unwrapped = await unwrapEpubZip(f);
          if (unwrapped) {
            loaded.push({
              data: unwrapped.data,
              fileName: unwrapped.fileName,
              fileSize: unwrapped.data.byteLength,
            });
            continue;
          }
        } catch {
          // Fall through to the not-supported error below.
        }
      }
      failures.push({ fileName: f.name, fileSize: f.size, reasonKey: 'msg.epub_not_supported' });
    }
    onFilesProcessed({ files: loaded, failures });
  }, [onFilesProcessed]);

  const importFolderFiles = useCallback(async (folderFiles: EpubFolderFile[]) => {
    const folderName = folderNameFromFiles(folderFiles);
    const looksLikeEpub = folderFiles.some(
      (f) => f.path === 'mimetype' || /(^|\/)content\.opf$/i.test(f.path),
    );
    if (!looksLikeEpub) {
      onFilesProcessed({
        files: [],
        failures: [{ fileName: folderName, fileSize: 0, reasonKey: 'msg.epub_not_supported' }],
      });
      return;
    }
    try {
      const data = await zipEpubFolder(folderFiles);
      const fileName = folderName.toLowerCase().endsWith('.epub')
        ? folderName
        : `${folderName}.epub`;
      onFilesProcessed({
        files: [{ data, fileName, fileSize: data.byteLength }],
        failures: [],
      });
    } catch {
      onFilesProcessed({
        files: [],
        failures: [{ fileName: folderName, fileSize: 0, reasonKey: 'msg.epub_file_unreadable' }],
      });
    }
  }, [onFilesProcessed]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    // A drop is a folder-EPUB import only when it actually contains a
    // directory entry. A single `.epub`/`.zip` file — and, crucially, a
    // multi-file selection of `.epub` files — never does, so it must go
    // through the normal file handler. (Previously a multi-file `.epub` drop
    // was misrouted here and rejected as "not an epub".)
    if (dropHasDirectory(e.dataTransfer.items)) {
      const folderFiles = await folderFilesFromDrop(e.dataTransfer.items);
      if (folderFiles && folderFiles.length > 0) {
        await importFolderFiles(folderFiles);
      }
      return;
    }
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
  }, [handleFiles, importFolderFiles]);

  const input = (
    <input
      ref={fileInputRef}
      type="file"
      accept=".epub,.epub.zip,.zip"
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
