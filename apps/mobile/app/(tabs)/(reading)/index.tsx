import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, Alert, ActivityIndicator } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as Clipboard from 'expo-clipboard';
import { Pressable } from '@/components/ui/pressable';
import { Button, buttonTextClass } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useT } from '@/hooks/use-t';
import { useResponsive } from '@/hooks/use-responsive';
import { useReaderNotes } from '@/hooks/use-reader-notes';
import { useEpubPagination } from '@/hooks/use-epub-pagination';
import { PaginatedReader } from '@/components/reader/PaginatedReader';
import { ReaderAskAiSheet } from '@/components/reader/ReaderAskAiSheet';
import { READER_ASK_AI_TEXT_PRESETS, type ReaderAiContent } from '@langplayer/utils';
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
  const { display, updateDisplay, getL2, updateL2 } = useSettingsContext();
  const t = useT();
  // Translation lines are PER-L2 (`l2[code].display.translation`).
  const showTranslation = getL2(l2Lang.code).display.translation;
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
  /** Inline title editing in the title bar (web parity: the pencil next to
   *  the note title). `titleEditOpenRef` guards the double commit that a
   *  Return followed by a blur would otherwise trigger. */
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const titleEditOpenRef = useRef(false);
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

  // ── Editor session (which note is open, and its text) ──────────────────
  /** Note id the editor session was initialized for (null = no note open). */
  const sessionNoteIdRef = useRef<number | null>(null);
  /** The body the editor was last loaded with. While `text` still equals it the
   *  user has not edited, so an incoming body refresh may be adopted. */
  const loadedTextRef = useRef('');

  // Opening a note initializes the session — its text, its saved anchor, and
  // the tab it deserves (Edit for a new/empty note, Read for one with text).
  //
  // The Edit/Read tab is NEVER switched as a side effect of the note body
  // changing. `saveNote` replaces the current-note object on every autosave
  // (`setCurrentNote(prev => ({ ...prev, text, translation }))`), so keying the
  // tab off `notes.currentNote` threw the user into Read mode ~2s after they
  // stopped typing. The tab now changes only on an explicit action — tapping
  // the Edit/Read tab, or Tokenize (web parity: apps/web's reader page sets
  // `activeTab` only in its explicit handlers: select note → read, new note →
  // edit, Tokenize → read).
  useEffect(() => {
    const note = notes.currentNote;
    const noteId = notes.currentNoteId;
    if (!note || noteId == null) {
      sessionNoteIdRef.current = null;
      return;
    }
    const body = note.text ?? '';
    const previousId = sessionNoteIdRef.current;

    // An offline-created note is remapped from its temp (negative) id to the
    // server id while it is open. Same note, same session — keep the tab and
    // the user's in-progress text untouched. A remap is told apart from the
    // user selecting a different note by the temp id leaving the notes list
    // (the hook's remap subscriber replaces the id in the list) — picking
    // another note leaves the temp note in the list.
    const remapped = previousId != null && previousId < 0 && noteId >= 0
      && !notes.notes.some(n => n.id === previousId);
    if (remapped) {
      log('[LP Mobile] notes reader: note id remapped, session kept', { from: previousId, to: noteId });
      sessionNoteIdRef.current = noteId;
      return;
    }

    if (previousId === noteId) {
      // Body update for the note already open (autosave echo, sync, or server
      // refresh) — adopt it only while the text is untouched, and never touch
      // the tab. `body === loadedTextRef` is the common no-op case (the note
      // object is replaced on every autosave), so nothing is logged for it.
      if (body === loadedTextRef.current) return;
      const unedited = text === loadedTextRef.current;
      log('[LP Mobile] notes reader: open-note body update', {
        noteId, chars: body.length, adopted: unedited,
      });
      if (unedited) {
        loadedTextRef.current = body;
        setText(body);
      }
      return;
    }

    // A different note is open — initialize the session.
    sessionNoteIdRef.current = noteId;
    loadedTextRef.current = body;
    setSavedFlash(false);
    // A title editor left open belongs to the note that just went away.
    titleEditOpenRef.current = false;
    setEditingTitle(false);
    setText(body);
    const asEdit = justCreatedRef.current || !body.trim();
    justCreatedRef.current = false;
    setActiveTab(asEdit ? 'edit' : 'read');
    if (asEdit) {
      // New/empty note — nothing to restore a position in.
      setInitialAnchor(null);
    } else {
      // Load saved anchor for this note
      (async () => {
        const anchor = await getNoteAnchor(noteId);
        // The user may have opened another note while this was loading.
        if (sessionNoteIdRef.current === noteId) setInitialAnchor(anchor);
      })();
    }
    log('[LP Mobile] notes reader: editor session opened', {
      noteId, tab: asEdit ? 'edit' : 'read', chars: body.length,
    });
  }, [notes.currentNote, notes.currentNoteId, notes.notes, text]);

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
    showTranslation,
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

  /** The ONLY way the Edit/Read tab moves — an explicit user action (tapping a
   *  tab, or Tokenize). Nothing else may switch it (see the editor-session
   *  effect above). Logged so an implicit switch is visible in the logs. */
  const handleTabChange = useCallback((tab: 'edit' | 'read', source: 'tab' | 'tokenize' | 'empty_state') => {
    setActiveTab(prev => {
      if (prev !== tab) log('[LP Mobile] notes reader: tab switched by user', { from: prev, to: tab, source });
      return tab;
    });
  }, []);

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

  // ── Inline title editing (title bar) ───────────────────────────────────
  // Web parity: apps/web's reader page shows a pencil next to the note title
  // that swaps the heading for an input (apps/web …/reader/page.tsx).

  /** Open the title editor seeded with the note's current title. */
  const startTitleEdit = () => {
    setTitleDraft(notes.currentNote?.title ?? '');
    titleEditOpenRef.current = true;
    setEditingTitle(true);
  };

  /** Commit the inline title edit (Return or blur). An empty draft is
   *  discarded — the note keeps the title it had. */
  const commitTitleEdit = async () => {
    if (!titleEditOpenRef.current) return;
    titleEditOpenRef.current = false;
    setEditingTitle(false);
    const noteId = notes.currentNoteId;
    const next = titleDraft.trim();
    if (noteId == null || !next || next === notes.currentNote?.title) return;
    log('[LP Mobile] notes reader: title renamed from the title bar', { noteId, title: next });
    await notes.renameNote(noteId, next);
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
              (the usual sidebar-toggle button position). `pt-4` keeps it off
              the app header, matching the note-open title bar's rhythm. */}
          <View className="flex-row justify-end pt-4 pb-2">
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
      <View className="flex-row items-center gap-2 px-4 py-5">
        {editingTitle ? (
          <Input
            className="flex-1"
            value={titleDraft}
            onChangeText={setTitleDraft}
            onSubmitEditing={() => void commitTitleEdit()}
            onBlur={() => void commitTitleEdit()}
            autoFocus
            returnKeyType="done"
            maxLength={200}
            accessibilityLabel={t('action.edit')}
          />
        ) : (
          <>
            <Text className="flex-1 text-xl font-bold text-foreground" numberOfLines={1}>
              {notes.currentNote ? notes.currentNote.title : t('title.notes_reader')}
            </Text>
            {/* Edit-title button — only for an open note (web parity: the
                pencil is hidden while no note is open). */}
            {notes.currentNoteId != null && (
              <Pressable
                onPress={startTitleEdit}
                className="rounded p-1 active:bg-muted"
                accessibilityRole="button"
                accessibilityLabel={t('action.edit')}
              >
                <PenLine size={16} color={ICON_MUTED} />
              </Pressable>
            )}
          </>
        )}
      </View>

      {/* Main content — persistent panel on wide screens, sheet on narrow */}
      <View className="flex-1 pt-2" style={{ flexDirection: isWide ? 'row' : 'column' }}>
        {/* Left panel: tab bar + editor/reader (tabs must not span the sidebar) */}
        <View className="flex-1">
          {/* Tab bar + actions */}
          <View className="flex-row items-center border-b border-border px-4">
            <Pressable
              onPress={() => handleTabChange('edit', 'tab')}
              className={`mr-4 flex-row items-center gap-1.5 border-b-2 py-2 ${activeTab === 'edit' ? 'border-primary' : 'border-transparent'}`}
            >
              <PenLine size={14} color={ICON_MUTED} />
              <Text className={`text-sm font-medium ${activeTab === 'edit' ? 'text-foreground' : 'text-muted-foreground'}`}>
                {t('action.edit') ?? 'Edit'}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => handleTabChange('read', 'tab')}
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
              {/* Margin around the editor text area, matching apps/web's notes
                  editor (its page pads px-4 and the textarea pads p-4). The
                  margin lives on this wrapper — `components/ui/input.tsx`
                  keeps callsites to layout classes only, so the Textarea's own
                  padding/border/radius stay stock. */}
              <View className="flex-1 p-4">
                <Textarea
                  className="flex-1"
                  placeholder={t('placeholder.enter_text', { l2: l2Lang.name }) ?? 'Enter text in {l2}…'}
                  placeholderTextColor={ICON_MUTED}
                  value={text}
                  onChangeText={handleTextChange}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
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
                  onPress={() => handleTabChange('read', 'tokenize')}
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
                // Measuring-window state (as every other PaginatedReader caller
                // passes it — image/epub reader, tokenizer card). The notes
                // reader is the one NON-estimate caller: it stays on its
                // loading spinner until every block has reported a layout, so
                // it must let PaginatedReader remount the hidden measuring
                // window whenever the hook invalidates the measurements
                // (`measureNonce`). Without these, the window kept its key
                // across note/text changes, React only re-fires onLayout where
                // the layout actually changed, and a block whose height matched
                // the previous stream's left a permanent hole — the reader sat
                // on the spinner forever until the screen was remounted.
                measuredWindow={pagination.measuredWindow}
                measureStart={pagination.measureStart}
                measureEnd={pagination.measureEnd}
                measureNonce={pagination.measureNonce}
                flipping={pagination.flipping}
                measuring={pagination.measuring}
                l2Code={l2Lang.code}
                l1Code={l1Lang.code}
                showTranslation={showTranslation}
                onToggleTranslation={() => updateL2(l2Lang.code, {
                  display: { ...getL2(l2Lang.code).display, translation: !showTranslation },
                })}
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
                onPress={() => handleTabChange('edit', 'empty_state')}
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
        storageKey={notes.currentNoteId != null ? `lp-ask-ai:note:${notes.currentNoteId}` : undefined}
        content={
          {
            text,
            page: currentPageText,
            chapter: null,
            bookUpToChapter: null,
          } satisfies ReaderAiContent
        }
        onQuotePress={tocSearch.openSearchFor}
      />
    </PageContainer>
  );
}
