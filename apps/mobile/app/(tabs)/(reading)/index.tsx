import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, TextInput, Pressable, Alert } from 'react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useT } from '@/hooks/use-t';
import { useReaderNotes } from '@/hooks/use-reader-notes';
import { useEpubPagination } from '@/hooks/use-epub-pagination';
import { PaginatedReader } from '@/components/reader/PaginatedReader';
import { NotesSidebar } from '@/components/reader/NotesSidebar';
import { Sidebar, useSidebar } from '@/components/ui/sidebar';
import { saveNoteAnchor, getNoteAnchor } from '@/lib/reader-storage';
import { BookOpen, PenLine, PanelRightOpen, PanelRightClose } from 'lucide-react-native';
import { PageContainer } from '@/components/layout/PageContainer';
import { ICON_MUTED } from '@/lib/theme-colors';

export default function ReaderScreen() {
  const { l1Lang, l2Lang } = useLanguage();
  const { display, updateDisplay } = useSettingsContext();
  const t = useT();
  const notes = useReaderNotes(l2Lang.code);
  const { isWide, sidebarOpen, mobileOpen, setMobileOpen, toggle } = useSidebar();

  const [text, setText] = useState('');
  const [activeTab, setActiveTab] = useState<'edit' | 'read'>('edit');
  const [saving, setSaving] = useState(false);
  const [initialAnchor, setInitialAnchor] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const justCreatedRef = useRef(false);

  // When current note changes, load its text and saved anchor
  useEffect(() => {
    if (notes.currentNote) {
      setText(notes.currentNote.text ?? '');
      if (justCreatedRef.current) {
        // Newly created — stay in edit mode, no anchor to restore
        justCreatedRef.current = false;
        setActiveTab('edit');
        setInitialAnchor(null);
      } else if (!notes.currentNote.text?.trim()) {
        // Empty note — open in edit mode
        setActiveTab('edit');
        setInitialAnchor(null);
      } else {
        setActiveTab('read');
        // Load saved anchor for this note
        (async () => {
          const anchor = notes.currentNoteId != null ? await getNoteAnchor(notes.currentNoteId) : null;
          setInitialAnchor(anchor);
        })();
      }
    }
  }, [notes.currentNoteId]);

  const handleAnchorChange = useCallback((anchor: string) => {
    if (notes.currentNoteId != null) {
      saveNoteAnchor(notes.currentNoteId, anchor);
    }
  }, [notes.currentNoteId]);

  const pagination = useEpubPagination({
    text,
    l1Code: l1Lang.code,
    l2Code: l2Lang.code,
    showTranslation: display.translation,
    resetKey: notes.currentNoteId !== null ? String(notes.currentNoteId) : null,
    initialAnchor,
    onAnchorChange: handleAnchorChange,
  });

  // Auto-save with 2s debounce
  const autoSave = useCallback((newText: string) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      if (!notes.currentNoteId) return;
      setSaving(true);
      await notes.saveNote(notes.currentNoteId, newText, '');
      setSaving(false);
    }, 2000);
  }, [notes]);

  const handleTextChange = (newText: string) => {
    setText(newText);
    autoSave(newText);
  };

  // Delete
  const handleDelete = (noteId: number) => {
    Alert.alert(t('action.delete'), t('msg.confirm_delete_note'), [
      { text: t('action.cancel'), style: 'cancel' },
      { text: t('action.delete'), style: 'destructive', onPress: () => notes.deleteNote(noteId) },
    ]);
  };

  // Selecting/creating a note closes the mobile sheet (matches web).
  const handleSelectNote = (noteId: number) => {
    setMobileOpen(false);
    void notes.selectNote(noteId);
  };

  const handleNewNote = () => {
    setMobileOpen(false);
    justCreatedRef.current = true;
    void notes.createNote(t('msg.untitled_note'));
  };

  return (
    <PageContainer>
      <View className="px-4 py-5">
        <Text className="text-xl font-bold text-foreground" numberOfLines={1}>
          {notes.currentNote ? notes.currentNote.title : t('title.notes_reader')}
        </Text>
      </View>

      {/* Tab bar + actions */}
      <View className="flex-row items-center border-b border-border px-4">
        <Pressable
          onPress={() => setActiveTab('edit')}
          className={`mr-4 flex-row items-center gap-1.5 border-b-2 py-2 ${activeTab === 'edit' ? 'border-primary' : 'border-transparent'}`}
        >
          <PenLine size={14} color={ICON_MUTED} />
          <Text className={`text-sm font-medium ${activeTab === 'edit' ? 'text-foreground' : 'text-muted-foreground'}`}>
            {t('action.edit') ?? 'Edit'}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab('read')}
          className={`flex-row items-center gap-1.5 border-b-2 py-2 ${activeTab === 'read' ? 'border-primary' : 'border-transparent'}`}
        >
          <BookOpen size={14} color={ICON_MUTED} />
          <Text className={`text-sm font-medium ${activeTab === 'read' ? 'text-foreground' : 'text-muted-foreground'}`}>
            {t('action.read') ?? 'Read'}
          </Text>
        </Pressable>
        <View className="flex-1" />
        {saving && <Text className="mr-2 text-xs text-muted-foreground">{t('msg.saving')}</Text>}
        <Pressable
          onPress={toggle}
          className="rounded p-1.5 active:bg-muted"
          accessibilityLabel={t(isWide && sidebarOpen ? 'action.hide_sidebar' : 'action.show_sidebar')}
        >
          {isWide && sidebarOpen ? (
            <PanelRightClose size={18} color={ICON_MUTED} />
          ) : (
            <PanelRightOpen size={18} color={ICON_MUTED} />
          )}
        </Pressable>
      </View>

      {/* Main content — persistent panel on wide screens, sheet on narrow */}
      <View className="flex-1 pt-2" style={{ flexDirection: isWide ? 'row' : 'column' }}>
        {/* Editor / Reader */}
        <View className="flex-1">
          {activeTab === 'edit' && (
            <TextInput
              className="flex-1 px-5 pt-4 pb-20 text-sm text-foreground"
              placeholder={t('placeholder.enter_text', { l2: l2Lang.name }) ?? 'Enter text in {l2}…'}
              placeholderTextColor={ICON_MUTED}
              value={text}
              onChangeText={handleTextChange}
              multiline
              textAlignVertical="top"
              autoCapitalize="none"
              autoCorrect={false}
            />
          )}

          {/* Read tab: paginated reader */}
          {activeTab === 'read' && text.trim() && (
            <PaginatedReader
              blocks={pagination.blocks}
              visibleBlocks={pagination.visibleBlocks}
              page={pagination.page}
              totalPages={pagination.totalPages}
              hasMeasured={pagination.hasMeasured}
              loadingTokens={pagination.loadingTokens}
              tokenCache={pagination.tokenCache}
              blockTranslations={pagination.blockTranslations}
              prevPage={pagination.prevPage}
              nextPage={pagination.nextPage}
              goToPage={pagination.goToPage}
              handleMeasureBlock={pagination.handleMeasureBlock}
              contentWidth={pagination.contentWidth}
              l2Code={l2Lang.code}
              l1Code={l1Lang.code}
              showTranslation={display.translation}
              onToggleTranslation={() => updateDisplay({ translation: !display.translation })}
              showTextActions
              t={t}
            />
          )}

          {/* Read tab: empty state */}
          {activeTab === 'read' && !text.trim() && (
            <View className="flex-1 items-center justify-center px-6 pb-12">
              <BookOpen size={48} color={ICON_MUTED} style={{ marginBottom: 16 }} />
              <Text className="text-center text-sm leading-relaxed text-muted-foreground">{t('msg.reader_empty_state', { l2: l2Lang.name })}</Text>
              <Pressable
                onPress={() => setActiveTab('edit')}
                className="mt-4 flex-row items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2 active:bg-muted"
              >
                <PenLine size={14} color={ICON_MUTED} />
                <Text className="text-xs text-foreground">{t('action.edit')}</Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* Notes sidebar — shared panel + sheet */}
        <Sidebar
          open={mobileOpen}
          onOpenChange={setMobileOpen}
          sidebarOpen={sidebarOpen}
          title={t('title.notes')}
        >
          <NotesSidebar
            notes={notes.notes}
            notesLoading={notes.notesLoading}
            notesError={notes.notesError}
            currentNoteId={notes.currentNoteId}
            onSelectNote={handleSelectNote}
            onNewNote={handleNewNote}
            onRenameNote={(id, title) => notes.renameNote(id, title)}
            onDeleteNote={handleDelete}
          />
        </Sidebar>
      </View>
    </PageContainer>
  );
}
