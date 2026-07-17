'use client';

import { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { NoteListItem } from '@langplayer/shared';
import { useT } from '@/hooks/use-t';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Loader2, Plus, StickyNote, PenLine, Trash2,
  MoreHorizontal, PanelRightClose, PanelRight,
} from 'lucide-react';

export interface NotesSidebarProps {
  notes: NoteListItem[];
  notesLoading: boolean;
  notesError: string | null;
  currentNoteId: number | null;
  sidebarOpen: boolean;
  session: any;
  onSelectNote: (noteId: number) => void;
  onNewNote: () => void;
  onRenameNote: (noteId: number, newTitle: string) => Promise<void>;
  onDeleteNote: (noteId: number) => Promise<void>;
  onToggleSidebar: () => void;
}

export function NotesSidebar({
  notes,
  notesLoading,
  notesError,
  currentNoteId,
  sidebarOpen,
  session,
  onSelectNote,
  onNewNote,
  onRenameNote,
  onDeleteNote,
  onToggleSidebar,
}: NotesSidebarProps) {
  const t = useT();
  const [menuOpen, setMenuOpen] = useState<number | null>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });

  const handleRename = useCallback(async (noteId: number) => {
    setMenuOpen(null);
    const note = notes.find(n => n.id === noteId);
    const newTitle = prompt(t('action.rename'), note?.title || '');
    if (!newTitle || newTitle.trim() === '' || newTitle.trim() === note?.title) return;
    await onRenameNote(noteId, newTitle.trim());
  }, [notes, t, onRenameNote]);

  const handleDelete = useCallback(async (noteId: number) => {
    setMenuOpen(null);
    if (!confirm(t('msg.confirm_delete_note'))) return;
    await onDeleteNote(noteId);
  }, [t, onDeleteNote]);

  return (
    <>
      {/* Toggle button */}
      <Button
        variant="ghost"
        size="icon"
        className="mt-2 h-8 w-8 flex-shrink-0"
        onClick={onToggleSidebar}
        title={sidebarOpen ? t('action.collapse_sidebar') : t('action.expand_sidebar')}
      >
        {sidebarOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRight className="h-4 w-4" />}
      </Button>

      {/* Sidebar */}
      <aside className={cn(
        'flex-shrink-0 transition-all duration-200',
        sidebarOpen ? 'w-56' : 'w-0 overflow-hidden',
      )}>
        <div className="sticky top-4 rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
            <h3 className="text-sm font-semibold">{t('title.notes')}</h3>
          </div>
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
          <div className="max-h-[calc(100vh-16rem)] overflow-y-auto px-1">
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
                <StickyNote className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
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
        </div>
      </aside>

      {/* Portal action menu */}
      {menuOpen !== null && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-50" onClick={() => setMenuOpen(null)}>
          <div
            className="absolute rounded-lg border border-border bg-card p-1 shadow-lg"
            style={{ top: menuPos.top, right: menuPos.right, minWidth: 140 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => handleRename(menuOpen)}
              className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <PenLine className="h-3.5 w-3.5" /> {t('action.rename')}
            </button>
            <button
              onClick={() => handleDelete(menuOpen)}
              className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" /> {t('action.delete')}
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
