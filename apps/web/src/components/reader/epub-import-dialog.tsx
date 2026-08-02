'use client';

import { useT } from '@/hooks/use-t';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { EpubFileError } from '@/components/reader/epub-upload';

interface EpubImportDialogProps {
  /** Files that could not be imported (empty hides the dialog). */
  failures: EpubFileError[];
  onClose: () => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function EpubImportDialog({ failures, onClose }: EpubImportDialogProps) {
  const t = useT();

  return (
    <Dialog open={failures.length > 0} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title.import_issues')}</DialogTitle>
          <DialogDescription>{t('msg.epub_import_failures')}</DialogDescription>
        </DialogHeader>
        <ul className="max-h-64 space-y-2 overflow-auto pr-1">
          {failures.map((f, i) => (
            <li key={`${f.fileName}-${i}`} className="rounded-md border border-border bg-muted/40 px-3 py-2">
              <p className="break-all font-medium text-foreground">{f.fileName}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatFileSize(f.fileSize)} · {t(f.reasonKey)}
              </p>
            </li>
          ))}
        </ul>
        <DialogFooter showCloseButton closeLabel={t('action.close')} />
      </DialogContent>
    </Dialog>
  );
}
