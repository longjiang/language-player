'use client';

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { suppressReaderTap } from '@/lib/reader-tap-guard';
import type { SubtitleNoteMarker } from '@langplayer/shared';

/**
 * An inline note badge: a solid circle carrying the note's number, drawn in
 * the flow of a subtitle line where a `[n]` marker appeared. Tapping it opens
 * the note dialog (SPEC-093).
 */
export function NoteBadge({
  id,
  onClick,
  muted = false,
}: {
  id: number;
  onClick: () => void;
  /** When true (note content missing/unresolved) the badge is dimmed and
   *  still opens the dialog — matching the classic PopupNote's "disabled"
   *  look while staying interactive. */
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={`Note ${id}`}
      className={`mx-0.5 inline-flex h-[1.1em] w-[1.1em] -translate-y-[0.1em] items-center justify-center rounded-full align-middle text-[0.62em] font-semibold leading-none select-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        muted
          ? 'bg-muted text-muted-foreground'
          : 'bg-primary text-primary-foreground hover:bg-primary/90'
      }`}
    >
      {id}
    </button>
  );
}

/**
 * The note dialog opened when a note badge is tapped. Reuses the shadcn
 * Dialog primitive so it inherits the app's modal behavior, framing, and
 * light-dismiss — the same surface the dictionary popup uses.
 */
export function NotePopup({
  note,
  onClose,
}: {
  note: SubtitleNoteMarker;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) { suppressReaderTap(); onClose(); } }}>
      <DialogContent className="max-w-md">
        <DialogTitle aria-label={`Note ${note.id}`} className="flex items-center gap-2 text-base font-semibold">
          <NoteBadge id={note.id} onClick={() => {}} muted />
        </DialogTitle>
        <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
          {note.note || '—'}
        </div>
      </DialogContent>
    </Dialog>
  );
}
