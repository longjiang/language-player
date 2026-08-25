import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, Alert, ActivityIndicator } from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import { Button, buttonTextClass } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useT } from '@/hooks/use-t';
import { useResponsive } from '@/hooks/use-responsive';
import { useReaderNotes } from '@/hooks/use-reader-notes';
import { useEpubPagination } from '@/hooks/use-epub-pagination';
import { PaginatedReader } from '@/components/reader/PaginatedReader';
import { NotesSidebar } from '@/components/reader/NotesSidebar';
import { Sidebar, useSidebar } from '@/components/ui/sidebar';
import { useFocusEffect } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import { saveNoteAnchor, getNoteAnchor } from '@/lib/reader-storage';
import { peekPendingOpen, consumePendingOpen } from '@/lib/file-open';
import { log } from '@/lib/logger';
import { BookOpen, PenLine, PanelRightOpen, PanelRightClose, Sparkles } from 'lucide-react-native';
import { PageContainer } from '@/components/layout/PageContainer';
import { ICON_MUTED } from '@/lib/theme-colors';
import { loadSampleContent } from '@langplayer/shared';

export default function ReaderScreen() {
  const { l1Lang, l2Lang } = useLanguage();
  const { display, updateDisplay } = useSettingsContext();
  const t = useT();
  const notes = useReaderNotes(l2Lang.code);
  const { isWide, sidebarOpen, mobileOpen, setMobileOpen, toggle } = useSidebar();
  // Reader translation goes side-by-side from md (>=768px) — portrait iPads —
  // while the outer sidebar layout still switches at the wider breakpoint.
  const { isMd } = useResponsive();

  const [text, setText] = useState('');
  const [activeTab, setActiveTab] = useState<'edit' | 'read'>('edit');
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [loadingSample, setLoadingSample] = useState(false);
  const [initialAnchor, setInitialAnchor] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const justCreatedRef = useRef(false);

  // OS file-open (file handling): .txt/.md files create a note with the file
  // text and open it in the notes reader.
  useFocusEffect(
    useCallback(() => {
      const f = peekPendingOpen();
      if (!f || f.kind !== 'notes') return;
      consumePendingOpen();
      log('[notes] file-open → create note', { name: f.name });
      void (async () => {
        try {
          const fileText = await FileSystem.readAsStringAsync(f.uri, {
            encoding: FileSystem.EncodingType.UTF8,
          });
          const title = f.name.replace(/\.(txt|md|markdown)$/i, '');
          const noteId = await notes.createNote(title);
          await notes.saveNote(noteId, fileText, '');
          justCreatedRef.current = true;
          await notes.selectNote(noteId);
        } catch (err) {
          log('[notes] file-open failed:', (err as Error)?.message ?? err);
        }
      })();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [notes]),
  );

  // Clear saved-flash timers on unmount.
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (savedFlashTimerRef.current) clearTimeout(savedFlashTimerRef.current);
    };
  }, []);

  // When current note changes, load its text and saved anchor
  useEffect(() => {
    setSavedFlash(false);
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
    // Only tokenize/measure when the Read tab is actually visible — the
    // kuromoji data-pack load otherwise freezes the UI on every Notes Reader
    // open while the user is still editing.
    text: activeTab === 'read' ? text : '',
    l1Code: l1Lang.code,
    l2Code: l2Lang.code,
    showTranslation: display.translation,
    translationSplit: display.translationSplit,
    resetKey: notes.currentNoteId !== null ? String(notes.currentNoteId) : null,
    initialAnchor,
    onAnchorChange: handleAnchorChange,
  });

  // Auto-save with 2s debounce
  const autoSave = useCallback((newText: string) => {
    // Show "Saving…" from the moment typing stops (the debounce window), not
    // just during the brief save call.
    setSaving(true);
    setSavedFlash(false);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      if (!notes.currentNoteId) {
        setSaving(false);
        return;
      }
      try {
        await notes.saveNote(notes.currentNoteId, newText, '');
        setSaving(false);
        // Keep "Saved locally" visible long enough to notice.
        setSavedFlash(true);
        if (savedFlashTimerRef.current) clearTimeout(savedFlashTimerRef.current);
        savedFlashTimerRef.current = setTimeout(() => setSavedFlash(false), 1500);
      } catch {
        setSaving(false);
      }
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

  // Load the per-language sample (long for popular L2s, short otherwise) into
  // the editor, matching the web Notes reader's "Add Sample Text" button.
  const handleAddSampleText = async () => {
    setLoadingSample(true);
    try {
      const content = await loadSampleContent(l2Lang.code);
      handleTextChange(content.long ?? content.short);
    } catch {
      // Sample load failed — leave the editor untouched.
    } finally {
      setLoadingSample(false);
    }
  };

  return (
    <PageContainer maxWidth="7xl">
      <View className="px-4 py-5">
        <Text className="text-xl font-bold text-foreground" numberOfLines={1}>
          {notes.currentNote ? notes.currentNote.title : t('title.notes_reader')}
        </Text>
      </View>

      {/* Main content — persistent panel on wide screens, sheet on narrow */}
      <View className="flex-1 pt-2" style={{ flexDirection: isWide ? 'row' : 'column' }}>
        {/* Left panel: tab bar + editor/reader (tabs must not span the sidebar) */}
        <View className="flex-1">
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
            {saving
              ? <Text className="mr-2 text-xs text-muted-foreground">{t('msg.saving')}</Text>
              : savedFlash
                ? <Text className="mr-2 text-xs text-muted-foreground">{t('msg.saved_locally')}</Text>
                : null}
            <Button
              onPress={toggle}
              variant="ghost"
              size="icon"
              accessibilityLabel={t(isWide && sidebarOpen ? 'action.hide_sidebar' : 'action.show_sidebar')}
            >
              {isWide && sidebarOpen ? (
                <PanelRightClose size={18} color={ICON_MUTED} />
              ) : (
                <PanelRightOpen size={18} color={ICON_MUTED} />
              )}
            </Button>
          </View>

          {/* Editor / Reader */}
          {activeTab === 'edit' && (
            <View className="flex-1">
              <Textarea
                className="flex-1"
                placeholder={t('placeholder.enter_text', { l2: l2Lang.name }) ?? 'Enter text in {l2}…'}
                placeholderTextColor={ICON_MUTED}
                value={text}
                onChangeText={handleTextChange}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <View className="flex-row gap-2 border-t border-border px-4 py-3">
                <Button
                  onPress={handleAddSampleText}
                  disabled={loadingSample}
                  variant="outline"
                >
                  {loadingSample ? (
                    <ActivityIndicator size="small" color={ICON_MUTED} />
                  ) : (
                    <Sparkles size={14} color={ICON_MUTED} />
                  )}
                  <Text className={buttonTextClass('outline')}>
                    {t('action.add_sample_text')}
                  </Text>
                </Button>
                <Button
                  onPress={() => setActiveTab('read')}
                  disabled={!text.trim()}
                  variant="default"
                >
                  <Sparkles size={14} color="#fff" />
                  <Text className={buttonTextClass('default')}>
                    {t('action.tokenize')}
                  </Text>
                </Button>
              </View>
            </View>
          )}

          {/* Read tab: paginated reader */}
          {activeTab === 'read' && text.trim() && (
            <View className="flex-1 pt-4">
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
                onVisibleBlocksChange={pagination.onVisibleBlocksChange}
                contentWidth={pagination.contentWidth}
                l2Code={l2Lang.code}
                l1Code={l1Lang.code}
                showTranslation={display.translation}
                onToggleTranslation={() => updateDisplay({ translation: !display.translation })}
                showTextActions
                translationSideBySide={isMd}
                selectionDictionary
                t={t}
              />
            </View>
          )}

          {/* Read tab: empty state */}
          {activeTab === 'read' && !text.trim() && (
            <View className="flex-1 items-center justify-center px-6 pb-12">
              <BookOpen size={48} color={ICON_MUTED} style={{ marginBottom: 16 }} />
              <Text className="text-center text-sm leading-relaxed text-muted-foreground">{t('msg.reader_empty_state', { l2: l2Lang.name })}</Text>
              <Button
                onPress={() => setActiveTab('edit')}
                variant="outline"
                className="mt-4"
              >
                <PenLine size={14} color={ICON_MUTED} />
                <Text className={buttonTextClass('outline')}>{t('action.edit')}</Text>
              </Button>
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
