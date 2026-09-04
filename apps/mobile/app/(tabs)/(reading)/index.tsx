import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, Alert, ActivityIndicator } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as Clipboard from 'expo-clipboard';
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
import { ReaderAskAiSheet } from '@/components/reader/ReaderAskAiSheet';
import { READER_ASK_AI_TEXT_PRESETS, truncateReaderAiContent, type ReaderAiContent } from '@langplayer/utils';
import { NotesSidebar } from '@/components/reader/NotesSidebar';
import { useReaderTocSearch, ReaderTocSearchOverlays } from '@/components/reader/reader-toc-search';
import { Sidebar, useSidebar } from '@/components/ui/sidebar';
import { saveNoteAnchor, getNoteAnchor } from '@/lib/reader-storage';
import { apiClient } from '@langplayer/api-client';
import type { Note } from '@langplayer/shared';
import { log, logwarn } from '@/lib/logger';
import { BookOpen, PenLine, PanelRightOpen, PanelRightClose, Sparkles, FileText, FolderOpen, Clipboard as ClipboardIcon } from 'lucide-react-native';
import { PageContainer } from '@/components/layout/PageContainer';
import { ICON_MUTED, ICON_ON_PRIMARY } from '@/lib/theme-colors';
import { loadSampleContent } from '@langplayer/shared';

export default function ReaderScreen() {
  const { l1Lang, l2Lang } = useLanguage();
  const { display, updateDisplay } = useSettingsContext();
  const t = useT();
  const notes = useReaderNotes(l2Lang.code);
  const { isWide, sidebarOpen, setSidebarOpen, mobileOpen, setMobileOpen, toggle } = useSidebar();
  // Reader translation goes side-by-side from md (>=768px) — portrait iPads —
  // while the outer sidebar layout still switches at the wider breakpoint.
  const { isMd } = useResponsive();

  const [text, setText] = useState('');
  const [activeTab, setActiveTab] = useState<'edit' | 'read'>('edit');
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [loadingSample, setLoadingSample] = useState(false);
  const [initialAnchor, setInitialAnchor] = useState<string | null>(null);
  /** Reader's current global block (for the TOC active-entry highlight). */
  const [currentBlockIndex, setCurrentBlockIndex] = useState<number | null>(null);
  /** Reader "Ask AI" summary chat. */
  const [askAiOpen, setAskAiOpen] = useState(false);
  const [currentPageText, setCurrentPageText] = useState('');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const justCreatedRef = useRef(false);
  // ── Default screen (no note open) ──
  /** Per-session ids of notes created by a text-file import — they show the
   *  "Imported" badge in the sidebar until the app restarts (session-only). */
  const [importedIds, setImportedIds] = useState<Set<number>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const importingRef = useRef(false);

  /** A note is open — the reader UI. Null → the default screen. */
  const hasOpenNote = notes.currentNoteId != null && notes.currentNote != null;

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
  }, [notes.currentNote]);

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
    onBlockChange: setCurrentBlockIndex,
  });

  const tocSearch = useReaderTocSearch({
    blocks: pagination.blocks,
    goToBlock: pagination.goToBlock,
    currentBlockIndex,
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

  // ── Default screen: text-file import (Browse) + clipboard paste ──

  /** Import text files: each becomes its own note titled with its file name
   *  (extension included). The LAST import opens; multiple imports also open
   *  the side panel so the "Imported" badges are visible (web parity). */
  const importTextFiles = useCallback(async () => {
    if (importingRef.current) return;
    importingRef.current = true;
    const startedAt = Date.now();
    try {
      const pick = await DocumentPicker.getDocumentAsync({
        type: ['text/plain', 'text/markdown', 'application/octet-stream', '*/*'],
        copyToCacheDirectory: true,
        multiple: true,
      });
      if (pick.canceled || !pick.assets?.length) return;
      const imported: { id: number; title: string }[] = [];
      const skipped: string[] = [];
      for (const asset of pick.assets) {
        const isText = /\.(txt|md|markdown)$/i.test(asset.name)
          || (asset.mimeType?.startsWith('text/') ?? false);
        if (!isText) { skipped.push(asset.name); continue; }
        try {
          const content = await fetch(asset.uri).then(r => r.text());
          if (!content.trim()) { skipped.push(asset.name); continue; }
          const created = await apiClient.post<Note>('/user-notes', {
            title: asset.name, text: content, translation: '', l2: l2Lang.code,
          });
          imported.push({ id: created.id, title: created.title || asset.name });
          log('[LP Mobile] notes import ok', { file: asset.name, chars: content.length, noteId: created.id });
        } catch (e: any) {
          skipped.push(asset.name);
          logwarn('[LP Mobile] notes import failed:', asset.name, e?.message ?? e);
        }
      }
      log('[LP Mobile] notes import batch', {
        files: pick.assets.length, imported: imported.length, skipped: skipped.length, elapsed: `${Date.now() - startedAt}ms`,
      });
      if (imported.length > 0) {
        setImportedIds(prev => new Set([...prev, ...imported.map(im => im.id)]));
        // Refresh the list from the hook's cache path, then open the LAST
        // imported note; multiple files also open the side panel.
        await notes.loadNotes();
        const last = imported[imported.length - 1]!;
        await notes.selectNote(last.id);
        if (imported.length > 1) {
          if (isWide) setSidebarOpen(true);
          else setMobileOpen(true);
        }
      }
      setNotice(skipped.length > 0 ? `${t('msg.notes_import_failed')} ${skipped.join(', ')}` : null);
    } finally {
      importingRef.current = false;
    }
  }, [l2Lang.code, notes, isWide, t]);

  /** Paste button — create a new note from the clipboard text. The note is
   *  saved before the note-change effect flips the reader into it, so the
   *  pasted text is already in the note body when the editor opens. */
  const pasteClipboardIntoNewNote = useCallback(async () => {
    try {
      const content = await Clipboard.getStringAsync();
      if (!content.trim()) { setNotice(t('msg.no_text_in_clipboard')); return; }
      setNotice(null);
      setMobileOpen(false);
      const id = await notes.createNote(t('msg.untitled_note'));
      if (id >= 0) {
        await notes.saveNote(id, content, '');
        // Mark as a fresh create AFTER saving so the note-change effect keeps
        // the editor open on this note (with its text) instead of read mode.
        justCreatedRef.current = true;
      }
    } catch {
      setNotice(t('msg.no_text_in_clipboard'));
    }
  }, [notes, t]);

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
      {/* ── Default screen (no note open): dashed import area ── */}
      {!hasOpenNote ? (
        <View className="flex-1 px-4 pb-6">
          {/* List All Notes — its own row ABOVE the drop area, aligned right
              (the usual sidebar-toggle button position). */}
          <View className="flex-row justify-end pb-2">
            <Pressable
              onPress={() => (isWide ? setSidebarOpen(true) : setMobileOpen(true))}
              className="flex-row items-center gap-1.5 rounded-md border border-border px-3.5 py-2 active:bg-muted"
              accessibilityRole="button"
              accessibilityLabel={t('action.list_all_notes')}
            >
              <PanelRightOpen size={14} color={ICON_MUTED} />
              <Text className="text-xs font-medium text-foreground">{t('action.list_all_notes')}</Text>
            </Pressable>
          </View>
          <View className="flex-1 items-center justify-center gap-4 rounded-xl border-2 border-dashed border-border px-6 py-10">
            <FileText size={44} color={ICON_MUTED} />
            <Text className="text-center text-sm font-medium text-foreground">
              {t('title.notes_reader')}
            </Text>
            <Text className="max-w-md text-center text-xs leading-relaxed text-muted-foreground">
              {t('msg.notes_reader_intro')}
            </Text>
            {notice && <Text className="text-center text-xs text-destructive">{notice}</Text>}
            {/* New + Import Files on one row, Paste centered below */}
            <View className="flex-row items-center justify-center gap-2">
              <Pressable
                onPress={handleNewNote}
                className="flex-row items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 active:opacity-90"
                accessibilityRole="button"
                accessibilityLabel={t('action.new')}
              >
                <FileText size={14} color={ICON_ON_PRIMARY} />
                <Text className="text-xs font-medium text-primary-foreground">{t('action.new')}</Text>
              </Pressable>
              <Pressable
                onPress={() => void importTextFiles()}
                className="flex-row items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 active:opacity-90"
                accessibilityRole="button"
                accessibilityLabel={t('action.import_files')}
              >
                <FolderOpen size={14} color={ICON_ON_PRIMARY} />
                <Text className="text-xs font-medium text-primary-foreground">{t('action.import_files')}</Text>
              </Pressable>
            </View>
            <View className="flex-row items-center justify-center gap-2">
              <Pressable
                onPress={() => void pasteClipboardIntoNewNote()}
                className="flex-row items-center gap-1.5 rounded-md border border-border px-3.5 py-2 active:bg-muted"
                accessibilityRole="button"
                accessibilityLabel={t('action.paste')}
              >
                <ClipboardIcon size={14} color={ICON_MUTED} />
                <Text className="text-xs font-medium text-foreground">{t('action.paste')}</Text>
              </Pressable>
            </View>
          </View>

          {/* Notes sidebar — shared panel + sheet (List All Notes target) */}
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
              importedNoteIds={importedIds}
              onSelectNote={handleSelectNote}
              onNewNote={handleNewNote}
              onRenameNote={(id, title) => notes.renameNote(id, title)}
              onDeleteNote={handleDelete}
            />
          </Sidebar>
        </View>
      ) : (
      <>
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
                onOpenToc={tocSearch.headings.length > 0 ? tocSearch.openToc : undefined}
                onOpenSearch={tocSearch.openSearch}
                onOpenAskAi={() => setAskAiOpen(true)}
                onPageTextChange={setCurrentPageText}
                highlight={tocSearch.highlight}
                // Saved words carry the note's title (web parity:
                // apps/web reader page passes `title || 'Reader'`).
                ctx={{ textTitle: notes.currentNote?.title || t('title.notes_reader') }}
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
            importedNoteIds={importedIds}
            onSelectNote={handleSelectNote}
            onNewNote={handleNewNote}
            onRenameNote={(id, title) => notes.renameNote(id, title)}
            onDeleteNote={handleDelete}
          />
        </Sidebar>
      </View>

      {/* ── Heading TOC + Search modals (notes reader; SPEC-087 §8) ── */}
      <ReaderTocSearchOverlays
        headings={tocSearch.headings}
        tocOpen={tocSearch.tocOpen}
        onTocClose={() => tocSearch.setTocOpen(false)}
        onTocSelect={tocSearch.handleTocSelect}
        searchOpen={tocSearch.searchOpen}
        onSearchClose={() => tocSearch.setSearchOpen(false)}
        onSearchSelect={tocSearch.handleSearchSelect}
        blocks={pagination.blocks}
        activeIndex={currentBlockIndex}
        searchQuery={tocSearch.searchQuery}
        searchNonce={tocSearch.searchNonce}
      />
      </>
      )}

      {/* ── "Ask AI" summary chat (notes reader) ── */}
      <ReaderAskAiSheet
        open={askAiOpen}
        onClose={() => setAskAiOpen(false)}
        title={notes.currentNote?.title || t('title.notes_reader')}
        presets={READER_ASK_AI_TEXT_PRESETS}
        content={
          {
            text: truncateReaderAiContent(text),
            page: truncateReaderAiContent(currentPageText),
            chapter: null,
            bookUpToChapter: null,
          } satisfies ReaderAiContent
        }
        onQuotePress={tocSearch.openSearchFor}
      />
    </PageContainer>
  );
}
