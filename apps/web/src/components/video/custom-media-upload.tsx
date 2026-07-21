'use client';

import { useState, useCallback } from 'react';
import { useT } from '@/hooks/use-t';
import { Button } from '@/components/ui/button';
import { Upload, FileVideo, FileAudio, FileText, X, RefreshCw } from 'lucide-react';

interface CustomMediaUploadProps {
  /** Called when user selects a media file. */
  onOpenFile: () => void;
  /** Called when user selects a caption file. */
  onLoadCaptions: () => void;
  /** Called when user clears stored media. */
  onClear: () => void;
  /** Called when user re-requests file permission. */
  onRequestPermission: () => void;
  /** Current file name, or null if none loaded. */
  fileName: string | null;
  /** Whether this is audio-only. */
  isAudio: boolean;
  /** Whether subtitles have been loaded. */
  hasSubtitles: boolean;
  /** Whether the user needs to re-grant permission. */
  needsPermission: boolean;
  /** Whether media is currently loaded. */
  hasMedia: boolean;
}

export function CustomMediaUpload({
  onOpenFile,
  onLoadCaptions,
  onClear,
  onRequestPermission,
  fileName,
  isAudio,
  hasSubtitles,
  needsPermission,
  hasMedia,
}: CustomMediaUploadProps) {
  const t = useT();
  const [dragOver, setDragOver] = useState(false);

  // ── Needs permission state ──
  if (needsPermission) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-border bg-card p-10">
        <RefreshCw className="h-12 w-12 text-muted-foreground/40" />
        <div className="text-center">
          <p className="text-sm font-medium">{fileName}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Permission needed to re-open this file.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="default" size="sm" onClick={onRequestPermission}>
            <RefreshCw className="mr-1.5 h-4 w-4" />
            Re-open File
          </Button>
          <Button variant="ghost" size="sm" onClick={onClear}>
            <X className="mr-1.5 h-4 w-4" />
            Remove
          </Button>
        </div>
      </div>
    );
  }

  // ── Media loaded state (compact bar) ──
  if (hasMedia && fileName) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
        {isAudio ? (
          <FileAudio className="h-4 w-4 flex-shrink-0" />
        ) : (
          <FileVideo className="h-4 w-4 flex-shrink-0" />
        )}
        <span className="truncate font-medium text-foreground">{fileName}</span>
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onLoadCaptions}
            className="h-7 text-xs"
          >
            <FileText className="mr-1 h-3.5 w-3.5" />
            {hasSubtitles ? 'Captions loaded' : 'Add captions'}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onClear}
            title={t('action.close')}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    );
  }

  // ── Upload state ──
  return (
    <div
      onDrop={(e) => { e.preventDefault(); setDragOver(false); onOpenFile(); }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      className={`
        flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 text-center transition-all
        ${dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/30'}
      `}
    >
      <Upload className="mx-auto mb-4 h-12 w-12 text-muted-foreground/40" />
      <p className="mb-2 text-sm text-muted-foreground">
        Drop a video or audio file here
      </p>
      <p className="mb-4 text-xs text-muted-foreground/60">
        Supports MP4, WebM, MKV, MP3, WAV, and more
      </p>
      <Button variant="outline" size="sm" onClick={onOpenFile}>
        <Upload className="mr-1.5 h-4 w-4" />
        {t('action.browse')}
      </Button>
    </div>
  );
}
