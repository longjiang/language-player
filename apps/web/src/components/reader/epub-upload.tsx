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
  /** Called with the raw ArrayBuffer when a new file is uploaded. */
  onFileLoaded: (data: ArrayBuffer, fileName: string) => void;
  /** Stored EPUB file name (shown as "last opened"). */
  fileName?: string | null;
}

export function EpubUpload({
  onFileLoaded,
  fileName,
}: EpubUploadProps) {
  const t = useT();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

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

