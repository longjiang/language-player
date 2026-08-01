'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { NoteListItem } from '@langplayer/shared';
import { useT } from '@/hooks/use-t';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  Loader2, Plus, PenLine, Trash2,
  MoreHorizontal,
} from 'lucide-react';

export interface NotesSidebarProps {
  notes: NoteListItem[];
  notesLoading: boolean;
  notesError: string | null;
  currentNoteId: number | null;
  session: any;
  onSelectNote: (noteId: number) => void;
  onNewNote: () => void;
  onRenameNote: (noteId: number, newTitle: string) => Promise<void>;
  onDeleteNote: (noteId: number) => Promise<void>;
}

export function NotesSidebar({
  notes,
  notesLoading,
  notesError,
  currentNoteId,
  session,
  onSelectNote,
  onNewNote,
  onRenameNote,
  onDeleteNote,
}: NotesSidebarProps) {
  const t = useT();
  const [menuOpen, setMenuOpen] = useState<number | null>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
  const [renameTarget, setRenameTarget] = useState<NoteListItem | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<NoteListItem | null>(null);
  const [busy, setBusy] = useState(false);

  const openRename = (noteId: number) => {
    setMenuOpen(null);
    const note = notes.find((n) => n.id === noteId);
    setRenameTarget(note ?? null);
    setRenameDraft(note?.title || '');
  };

  const confirmRename = async () => {
    if (!renameTarget) return;
    const newTitle = renameDraft.trim();
    if (newTitle && newTitle !== renameTarget.title) {
      setBusy(true);
      try {
        await onRenameNote(renameTarget.id, newTitle);
      } finally {
        setBusy(false);
      }
    }
    setRenameTarget(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await onDeleteNote(deleteTarget.id);
    } finally {
      setBusy(false);
      setDeleteTarget(null);
    }
  };

  return (
    <>
      <div className="px-3 py-2">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-1.5"
          onClick={onNewNote}
        >
          <Plus className="h-3.5 w-3.5" />
          {t('action.new_note')}
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto px-1">
        {notesLoading && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
        {notesError && (
          <p className="px-3 py-4 text-xs text-red-500">{notesError}</p>
        )}
        {!notesLoading && !notesError && notes.length === 0 && session && (
          <p className="px-3 py-4 text-xs text-muted-foreground">{t('msg.no_notes_yet')}</p>
        )}
        {!notesLoading && !session && (
          <p className="px-3 py-4 text-xs text-muted-foreground">{t('msg.login_to_save_notes')}</p>
        )}
        {notes.map((note) => (
          <div
            key={note.id}
            className={cn(
              'group flex w-full items-start gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors cursor-pointer',
              'hover:bg-muted',
              currentNoteId === note.id && 'bg-primary/10 text-primary font-medium',
            )}
            onClick={() => onSelectNote(note.id)}
          >
            <div className="min-w-0 flex-1">
              <div className="truncate">{note.title || t('msg.untitled_note')}</div>
              {note.created_on && (
                <div className="text-xs text-muted-foreground">
                  {new Date(note.created_on).toLocaleDateString()}
                </div>
              )}
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                const rect = e.currentTarget.getBoundingClientRect();
                setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
                setMenuOpen(menuOpen === note.id ? null : note.id);
              }}
              className="flex-shrink-0 rounded p-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-muted transition-all"
              title={t('action.more')}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Portal action menu */}
      {menuOpen !== null && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-50" onClick={() => setMenuOpen(null)}>
          <div
            className="absolute rounded-lg border border-border bg-card p-1 shadow-lg"
            style={{ top: menuPos.top, right: menuPos.right, minWidth: 140 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => openRename(menuOpen)}
              className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <PenLine className="h-3.5 w-3.5" /> {t('action.rename')}
            </button>
            <button
              onClick={() => { setDeleteTarget(notes.find((n) => n.id === menuOpen) ?? null); setMenuOpen(null); }}
              className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" /> {t('action.delete')}
            </button>
          </div>
        </div>,
        document.body,
      )}

      {/* Rename dialog */}
      <Dialog open={!!renameTarget} onOpenChange={(o) => { if (!o) setRenameTarget(null); }}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t('action.rename')}</DialogTitle>
          </DialogHeader>
          <input
            autoFocus
            value={renameDraft}
            onChange={(e) => setRenameDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); confirmRename(); }
            }}
            placeholder={t('msg.untitled_note')}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>
              {t('action.cancel')}
            </Button>
            <Button onClick={confirmRename} disabled={busy || !renameDraft.trim()}>
              {t('action.rename')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t('action.delete')}</DialogTitle>
            <DialogDescription>{t('msg.confirm_delete_note')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              {t('action.cancel')}
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={busy}>
              {t('action.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
