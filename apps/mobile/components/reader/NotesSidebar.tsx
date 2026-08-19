import React, { useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import { Button, buttonTextClass } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, MoreHorizontal, PenLine, Trash2, Check, Cloud } from 'lucide-react-native';
import { useT } from '@/hooks/use-t';
import { ICON_MUTED, ICON_PRIMARY, ICON_DESTRUCTIVE } from '@/lib/theme-colors';
import type { NoteListItemWithSync } from '@/hooks/use-reader-notes';

interface NotesSidebarProps {
  notes: NoteListItemWithSync[];
  notesLoading: boolean;
  notesError: string | null;
  currentNoteId: number | null;
  onSelectNote: (noteId: number) => void;
  onNewNote: () => void;
  onRenameNote: (noteId: number, title: string) => Promise<void> | void;
  onDeleteNote: (noteId: number) => void;
}

/**
 * Notes reader sidebar body — mirrors apps/web's NotesSidebar, rendered inside
 * the shared mobile Sidebar. Owns the rename/menu UI; the parent owns data.
 */
export function NotesSidebar({
  notes,
  notesLoading,
  notesError,
  currentNoteId,
  onSelectNote,
  onNewNote,
  onRenameNote,
  onDeleteNote,
}: NotesSidebarProps) {
  const t = useT();
  const [renameId, setRenameId] = useState<number | null>(null);
  const [renameText, setRenameText] = useState('');
  const [menuNoteId, setMenuNoteId] = useState<number | null>(null);

  const handleRenameSubmit = async () => {
    if (renameId !== null && renameText.trim()) {
      await onRenameNote(renameId, renameText.trim());
      setRenameId(null);
    }
  };

  return (
    <View>
      <View className="px-3 py-2">
        <Button
          onPress={onNewNote}
          variant="outline"
        >
          <Plus size={14} color={ICON_MUTED} />
          <Text className={buttonTextClass('outline')}>{t('action.new_note')}</Text>
        </Button>
      </View>

      <View className="px-1">
        {notesLoading && (
          <ActivityIndicator size="small" color={ICON_MUTED} style={{ marginTop: 20 }} />
        )}
        {notesError && (
          <Text className="px-3 py-4 text-xs text-red-500">{notesError}</Text>
        )}
        {!notesLoading && notes.length === 0 && (
          <Text className="px-3 py-4 text-xs text-muted-foreground">{t('msg.no_notes_yet')}</Text>
        )}
        {notes.map((n) => (
          <View key={n.id}>
            {renameId === n.id ? (
              <View className="flex-row items-center px-2 py-1">
                <Input
                  className="flex-1"
                  value={renameText}
                  onChangeText={setRenameText}
                  onSubmitEditing={handleRenameSubmit}
                  onBlur={handleRenameSubmit}
                  autoFocus
                />
              </View>
            ) : (
              <Pressable
                onPress={() => onSelectNote(n.id)}
                className={`flex-row items-center gap-2 px-3 py-2 active:bg-muted ${currentNoteId === n.id ? 'bg-primary/10' : ''}`}
              >
                {n._syncStatus === 'synced' ? (
                  <Check size={14} color={ICON_PRIMARY} />
                ) : n._syncStatus === 'error' ? (
                  <Cloud size={14} color={ICON_DESTRUCTIVE} />
                ) : (
                  <Cloud size={14} color={ICON_MUTED} />
                )}
                <View className="flex-1">
                  <Text className={`text-sm truncate ${currentNoteId === n.id ? 'font-medium text-primary' : 'text-foreground'}`} numberOfLines={1}>
                    {n.title ?? t('msg.untitled_note')}
                  </Text>
                  <Text className="text-xs text-muted-foreground">
                    {`#${n.id}`}
                    {n.created_on ? ` · ${new Date(n.created_on).toLocaleDateString()}` : ''}
                  </Text>
                </View>
                <Pressable
                  onPress={() => setMenuNoteId(menuNoteId === n.id ? null : n.id)}
                  className="rounded p-1 active:bg-muted"
                  accessibilityLabel={t('action.more')}
                >
                  <MoreHorizontal size={14} color={ICON_MUTED} />
                </Pressable>
              </Pressable>
            )}

            {/* Context menu */}
            {menuNoteId === n.id && (
              <View className="absolute right-2 top-10 z-20 min-w-[120px] rounded-lg border border-border bg-card py-1 shadow-lg" style={{ elevation: 8 }}>
                <Pressable
                  onPress={() => { setMenuNoteId(null); setRenameId(n.id); setRenameText(n.title ?? ''); }}
                  className="flex-row items-center gap-2 px-3 py-2 active:bg-muted"
                >
                  <PenLine size={12} color={ICON_MUTED} />
                  <Text className="text-xs text-foreground">{t('action.rename')}</Text>
                </Pressable>
                <Pressable
                  onPress={() => { setMenuNoteId(null); onDeleteNote(n.id); }}
                  className="flex-row items-center gap-2 px-3 py-2 active:bg-muted"
                >
                  <Trash2 size={12} color={ICON_DESTRUCTIVE} />
                  <Text className="text-xs text-red-500">{t('action.delete')}</Text>
                </Pressable>
              </View>
            )}
          </View>
        ))}
        {/* Tappable backdrop to close the context menu */}
        {menuNoteId !== null && (
          <Pressable
            onPress={() => setMenuNoteId(null)}
            className="absolute inset-0 z-10"
          />
        )}
      </View>
    </View>
  );
}
