'use client';

import { useState, useEffect, useCallback, useRef, type DragEvent } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useLanguage } from '@/providers/language-provider';
import { useT } from '@/hooks/use-t';
import type { LemmatizedToken, SavedWordContext, NoteListItem, Note } from '@langplayer/shared';
import { fetchReaderPage, htmlToMarkdown } from '@langplayer/shared';
import { apiClient } from '@langplayer/api-client';
import { PYTHON_API_URL } from '@/lib/api-url';
import { translateTextsKeyed } from '@/lib/translate';
import { parseMarkdown, type ReaderBlock, type TextBlock } from '@/lib/parse-markdown';
import { log } from '@/lib/logger';
import {
  Loader2, FileText, PenLine,
  PanelRightClose, PanelRight,
  Plus, Clipboard, FolderOpen,
} from 'lucide-react';
import { ReaderPanel } from '@/components/reader/reader-panel';
import type { ReaderLoc } from '@/components/reader/paginated-reader';
import { NotesSidebar } from '@/components/reader/notes-sidebar';
import { Sidebar } from '@/components/ui/sidebar';
import { getNotePosition, saveNotePosition } from '@/lib/reader-position';
import { notesImportLogger } from '@/lib/logger';

// HTML→Markdown conversion and the reader fetch live in @langplayer/shared
// (htmlToMarkdown, fetchReaderPage) so web and mobile share one pipeline
// (SPEC-083 / SPEC-087 §2).

const READER_TEXT_KEY = 'lp_reader_text';
const READER_TITLE_KEY = 'lp_reader_title';

/** Accepted text-file MIME types for the notes reader's Browse/Drag-drop
 *  import. `.md` may arrive as text/markdown or application/octet-stream,
 *  so the picker also accepts those and we sniff the extension per file. */
const NOTES_TEXT_ACCEPT = '.txt,.md,.markdown,text/plain,text/markdown';
/** Per-session ids of notes created by a text-file import — they show the
 *  "Imported" badge in the sidebar until the page reloads (user decision:
 *  badge is session-only, no data-model change). */
const importedNoteIds = new Set<number>();
/** localStorage key of the last-open note id (auto-restore on return). */
const LAST_OPEN_KEY = 'lp_reader_last_note';

export default function ReaderPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { l1, l2 } = useLanguage();
  const t = useT();
  const method = searchParams.get('method');
  const arg = searchParams.get('arg');
  const noteIdParam = searchParams.get('noteId');
  const urlParam = searchParams.get('url');

  const [text, setText] = useState('');
  const [translation, setTranslation] = useState('');
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'edit' | 'read'>('read');
  const [isEditingTitle, setIsEditingTitle] = useState(false);

  const [blocks, setBlocks] = useState<ReaderBlock[] | null>(null);
  // Saved reading position (block index) restored on note load, so a refresh
  // / navigation returns to the same spot in the text instead of page 1.
  const [initialLocation, setInitialLocation] = useState<ReaderLoc | null>(null);

  // ── Notes ──
  const { data: session } = useSession();
  const [notes, setNotes] = useState<NoteListItem[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);
  const [currentNoteId, setCurrentNoteId] = useState<number | null>(
    noteIdParam ? Number(noteIdParam) : null,
  );
  const [dirty, setDirty] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noteLoadedFromUrl = useRef(false);
  // ── Import (Browse / drag-drop of text files) ──
  const [dragOver, setDragOver] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  /** True once a restored last-open note has been applied this mount (the
   *  auto-restore effect may run again when `notes` refetches; the guard
   *  keeps the restore one-shot, matching the mobile hook). */
  const restoredRef = useRef(false);
  /** Set when the user taps Nav → Notes Reader while a note is open: the
   *  same-route re-entry must land on the default screen instead of the
   *  open note (user requirement; mirrors the epub reader's Rule A). */
  const skipRestoreOnceRef = useRef(false);

  // Load notes list
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setNotesLoading(true);
    setNotesError(null);
    apiClient.get<NoteListItem[]>('/user-notes', { params: { l2: l2.code } })
      .then(r => { if (!cancelled) setNotes(r.sort((a, b) => (b.created_on || '').localeCompare(a.created_on || ''))); })
      .catch((e: any) => { if (!cancelled) setNotesError(e?.message || 'Failed to load notes'); })
      .finally(() => { if (!cancelled) setNotesLoading(false); });
    return () => { cancelled = true; };
  }, [session, l2.code]);

  // Load note from URL on mount
  useEffect(() => {
    if (noteIdParam && session && !noteLoadedFromUrl.current) {
      noteLoadedFromUrl.current = true;
      const id = Number(noteIdParam);
      setLoading(true);
      apiClient.get<Note>(`/user-notes/${id}`)
        .then(note => {
          setText(note.text || ''); setTranslation(note.translation || ''); setTitle(note.title || ''); setCurrentNoteId(id); setActiveTab('read');
          const saved = getNotePosition(id);
          setInitialLocation(saved != null ? { blockIndex: saved } : null);
        })
        .catch((e: any) => setError(e?.message || t('msg.failed_to_load_note')))
        .finally(() => setLoading(false));
    }
  }, [noteIdParam, session, t]);

  // ── Auto-restore the last-open note (once per mount) ──
  // A note open in the previous visit is reopened (parity with the mobile
  // reader's saved-active-note restore). The restore needs the notes list to
  // know the saved id still exists. Nav re-entry (already on the reader with
  // a note open, then Nav → Notes Reader) is handled separately below — it
  // lands on the default screen.
  useEffect(() => {
    if (!session || notes.length === 0 || restoredRef.current) return;
    restoredRef.current = true;
    if (noteIdParam) return; // a note is already loading from the URL
    let id: number | null = null;
    try { id = Number(localStorage.getItem(LAST_OPEN_KEY)) || null; } catch { /* private mode */ }
    if (id != null && notes.some(n => n.id === id)) {
      log('[LP Web] notes reader: auto-restoring last-open note', { id });
      void handleSelectNote(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, notes]);

  // Persist the open note id so a fresh visit restores it; cleared whenever
  // the reader is left without a note open (delete-to-empty).
  useEffect(() => {
    try {
      if (currentNoteId != null) localStorage.setItem(LAST_OPEN_KEY, String(currentNoteId));
      else localStorage.removeItem(LAST_OPEN_KEY);
    } catch { /* private mode */ }
  }, [currentNoteId]);

  // ── Nav re-entry → default screen ──
  // Tapping Nav → Notes Reader while a note is open pushes the bare reader
  // URL (`?noteId` disappears from useSearchParams). Closing the note here
  // lands the user on the default screen (user requirement; mirrors the epub
  // reader's same-route Rule A). The auto-restore guard keeps this one-shot.
  useEffect(() => {
    if (!noteIdParam && currentNoteId != null) {
      log('[LP Web] notes reader: nav re-entry — returning to default screen', { closedNoteId: currentNoteId });
      setText(''); setTranslation(''); setTitle('');
      setCurrentNoteId(null);
      setInitialLocation(null);
      setDirty(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteIdParam]);

  // Select a note
  const handleSelectNote = useCallback(async (noteId: number) => {
    setMobileSidebarOpen(false);
    setLoading(true); setError(null);
    try {
      const note = await apiClient.get<Note>(`/user-notes/${noteId}`);
      setText(note.text || ''); setTranslation(note.translation || ''); setTitle(note.title || '');
      setCurrentNoteId(noteId); setDirty(false); setActiveTab('read');
      const saved = getNotePosition(noteId);
      setInitialLocation(saved != null ? { blockIndex: saved } : null);
      router.replace(`/${l1.code}/${l2.code}/reader?noteId=${noteId}`, { scroll: false });
    } catch (e: any) { setError(e?.message || t('msg.failed_to_load_note')); }
    finally { setLoading(false); }
  }, [t, l1.code, l2.code, router]);

  // New note
  const handleNewNote = useCallback(async () => {
    if (!session) return;
    setMobileSidebarOpen(false);
    setLoading(true); setError(null);
    try {
      const created = await apiClient.post<Note>('/user-notes', { title: t('msg.untitled_note'), text: '', translation: '', l2: l2.code });
      setNotes(prev => [{ id: created.id, title: created.title, created_on: created.created_on }, ...prev]);
      setText(''); setTranslation(''); setTitle(t('msg.untitled_note'));
      setCurrentNoteId(created.id); setDirty(false); setActiveTab('edit');
      setInitialLocation(null);
      router.replace(`/${l1.code}/${l2.code}/reader?noteId=${created.id}`, { scroll: false });
    } catch (e: any) { setError(e?.message || 'Failed to create note'); }
    finally { setLoading(false); }
  }, [session, t, l1.code, l2.code, router]);

  // ── Text-file import (Browse / drag-drop) ──
  // Each file becomes its own note titled with its file name (extension
  // included, per the request). The LAST import opens on completion; when
  // more than one file was imported the side panel opens too, and the
  // imported notes carry a session-only "Imported" badge.
  const importTextFiles = useCallback(async (files: File[]) => {
    const started = Date.now();
    const skipped: string[] = [];
    const imported: { id: number; title: string }[] = [];
    for (const file of files) {
      const isText = /\.(txt|md|markdown)$/i.test(file.name)
        || file.type.startsWith('text/')
        || file.type === 'application/json';
      if (!isText) { skipped.push(file.name); continue; }
      try {
        const text = await file.text();
        if (!text.trim()) { skipped.push(file.name); continue; }
        const created = await apiClient.post<Note>('/user-notes', {
          title: file.name, text, translation: '', l2: l2.code,
        });
        importedNoteIds.add(created.id);
        imported.push({ id: created.id, title: created.title || file.name });
        notesImportLogger.log(`imported file=${file.name} chars=${text.length} noteId=${created.id}`);
      } catch (e: any) {
        skipped.push(file.name);
        notesImportLogger.logwarn(`import failed file=${file.name}:`, e?.message ?? e);
      }
    }
    notesImportLogger.log(`import batch done files=${files.length} imported=${imported.length} skipped=${skipped.length} elapsed=${Date.now() - started}ms`);
    if (imported.length > 0) {
      // Prepend to the list (server sorts by created_on desc; new notes land on top).
      setNotes(prev => [
        ...imported.map(im => ({ id: im.id, title: im.title, created_on: new Date().toISOString() })),
        ...prev.filter(n => !imported.some(im => im.id === n.id)),
      ]);
      // Open the last imported note.
      const last = imported[imported.length - 1]!;
      await handleSelectNote(last.id);
      // Multiple files → also open the side panel so the badges are visible.
      if (imported.length > 1) {
        if (isDesktop) setSidebarOpen(true);
        else setMobileSidebarOpen(true);
      }
    }
    setNotice(skipped.length > 0 ? `${t('msg.notes_import_failed')} ${skipped.join(', ')}` : null);
  }, [l2.code, t, handleSelectNote, isDesktop]);

  /** Browse button — open the multi-select file picker. */
  const handleBrowse = useCallback(() => fileInputRef.current?.click(), []);

  /** Paste button — create a new note from the clipboard text. */
  const pasteClipboardIntoNewNote = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) { setNotice(t('msg.no_text_in_clipboard')); return; }
      setNotice(null);
      const created = await apiClient.post<Note>('/user-notes', {
        title: t('msg.untitled_note'), text, translation: '', l2: l2.code,
      });
      setNotes(prev => [{ id: created.id, title: created.title, created_on: created.created_on }, ...prev]);
      setText(created.text || text); setTranslation(''); setTitle(created.title || t('msg.untitled_note'));
      setCurrentNoteId(created.id); setDirty(false); setActiveTab('read');
      setInitialLocation(null);
      router.replace(`/${l1.code}/${l2.code}/reader?noteId=${created.id}`, { scroll: false });
    } catch {
      setNotice(t('msg.no_text_in_clipboard'));
    }
  }, [l1.code, l2.code, router, t]);

  /** Ctrl/Cmd+V anywhere on the default screen — same as the Paste button.
   *  Skipped when a note is open (its editor handles paste natively). */
  useEffect(() => {
    if (currentNoteId != null) return;
    const onPaste = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData('text/plain');
      if (!text) return;
      e.preventDefault();
      void pasteClipboardIntoNewNote();
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [currentNoteId, pasteClipboardIntoNewNote]);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length) void importTextFiles(files);
  }, [importTextFiles]);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => setDragOver(false), []);

  // Rename note
  const handleRenameNote = useCallback(async (noteId: number, newTitle: string) => {
    await apiClient.patch(`/user-notes/${noteId}`, { title: newTitle });
    setNotes(prev => prev.map(n => n.id === noteId ? { ...n, title: newTitle } : n));
    if (currentNoteId === noteId) setTitle(newTitle);
  }, [currentNoteId]);

  // Delete note
  const handleDeleteNote = useCallback(async (noteId: number) => {
    await apiClient.delete(`/user-notes/${noteId}`);
    setNotes(prev => prev.filter(n => n.id !== noteId));
    if (currentNoteId === noteId) {
      setText(''); setTranslation(''); setTitle(''); setCurrentNoteId(null);
      router.replace(`/${l1.code}/${l2.code}/reader`, { scroll: false });
    }
  }, [currentNoteId, l1.code, l2.code, router]);

  // Dirty tracking
  const handleTextChange = useCallback((v: string) => { setText(v); if (currentNoteId) setDirty(true); }, [currentNoteId]);
  const handleTitleChange = useCallback((v: string) => { setTitle(v); if (currentNoteId) setDirty(true); }, [currentNoteId]);
  const handleTranslationChange = useCallback((v: string) => { setTranslation(v); if (currentNoteId) setDirty(true); }, [currentNoteId]);

  // Auto-save (debounced)
  useEffect(() => {
    if (!currentNoteId || !dirty || !session) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await apiClient.patch(`/user-notes/${currentNoteId}`, { title: title || t('msg.untitled_note'), text, translation });
        setDirty(false);
        setNotes(prev => prev.map(n => n.id === currentNoteId ? { ...n, title: title || t('msg.untitled_note') } : n));
      } catch { /* ignore */ }
    }, 300);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [text, title, translation, currentNoteId, dirty, session, t]);

  // Flush save now
  const saveNow = useCallback(async () => {
    if (!currentNoteId || !dirty || !session) return;
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    try {
      await apiClient.patch(`/user-notes/${currentNoteId}`, { title: title || t('msg.untitled_note'), text, translation });
      setDirty(false);
      setNotes(prev => prev.map(n => n.id === currentNoteId ? { ...n, title: title || t('msg.untitled_note') } : n));
    } catch { /* ignore */ }
  }, [currentNoteId, dirty, session, text, title, translation, t]);

  const handleTokenize = useCallback(async () => { await saveNow(); setActiveTab('read'); }, [saveNow]);

  // Persist the reading position (block index) whenever the visible page's
  // start block changes, so a refresh / navigation returns to the same spot.
  const handleReaderLocationChange = useCallback((loc: ReaderLoc) => {
    if (currentNoteId != null && 'blockIndex' in loc) {
      saveNotePosition(currentNoteId, loc.blockIndex);
    }
  }, [currentNoteId]);

  const handleLemmatize = useCallback(async (texts: string[]) => {
    const res = await fetch(`${PYTHON_API_URL}/lemmatize-normalized/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts, l2: l2.code }),
    });
    const data = res.ok ? await res.json() : null;
    return data?.results ?? [];
  }, [l2.code]);

  const handlePageTranslate = useCallback(async (texts: string[]) => {
    setTranslating(true);
    try {
      const { byKey } = await translateTextsKeyed(texts, l1.code, l2.code);
      return byKey;
    } catch (e: any) {
      setError(e?.message || 'Translation failed');
      return {};
    } finally {
      setTranslating(false);
    }
  }, [l1.code, l2.code]);

  // Track the sidebar breakpoint (lg = 1024px, matching the Sidebar component)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // Open the notes sidebar (desktop panel + mobile sheet)
  const handleOpenSidebar = useCallback(() => {
    if (isDesktop) setSidebarOpen(true);
    else setMobileSidebarOpen(true);
  }, [isDesktop]);

  // Parse markdown — Chinese script conversion is handled per-token
  // by TokenSpan (ADR-0019), so we parse the original text directly.
  useEffect(() => {
    if (!text.trim()) { setBlocks(null); return; }
    try { setBlocks(parseMarkdown(text)); }
    catch { setBlocks(null); }
  }, [text]);

  // Load from localStorage / URL params
  const loadUrl = useCallback(async (url: string, isMarkdown: boolean) => {
    setLoading(true); setError(null); setInitialLocation(null);
    router.replace(`/${l1.code}/${l2.code}/reader?url=${encodeURIComponent(url)}`, { scroll: false });
    try {
      // Fetch + convert through the shared reader pipeline (same as mobile).
      const raw = await fetchReaderPage(url, PYTHON_API_URL);
      if (isMarkdown) setText(raw);
      else setText(htmlToMarkdown(raw, url));
    } catch (e: any) { setError(e?.message || t('msg.failed_to_load_url')); }
    finally { setLoading(false); }
  }, [l1.code, l2.code, router, t]);

  useEffect(() => {
    const storedText = localStorage.getItem(READER_TEXT_KEY);
    if (storedText) {
      setText(storedText); setTitle(localStorage.getItem(READER_TITLE_KEY) || '');
      localStorage.removeItem(READER_TEXT_KEY); localStorage.removeItem(READER_TITLE_KEY);
      setActiveTab('read'); setInitialLocation(null); return;
    }
    if (urlParam) { setInitialLocation(null); loadUrl(decodeURIComponent(urlParam), false); return; }
    if (method && arg) {
      if (['md', 'html', 'txt'].includes(method)) { setText(decodeURIComponent(arg)); setActiveTab('read'); setInitialLocation(null); }
      else if (method === 'md-url') loadUrl(arg, true);
      else if (method === 'html-url') loadUrl(arg, false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const ctx: Partial<SavedWordContext> = { textTitle: title || 'Reader' };

  if (loading && !text) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Default screen (no note open): the drag-drop import zone ──
  const defaultScreen = (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={`flex min-h-[50vh] flex-1 flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed p-10 text-center transition-colors ${
        dragOver ? 'border-primary bg-primary/5' : 'border-border'
      }`}
    >
      <FileText className="h-10 w-10 text-muted-foreground" />
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-foreground">{t('title.notes_reader')}</p>
        <p className="max-w-md text-xs text-muted-foreground">{t('msg.notes_reader_intro')}</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={handleNewNote}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus className="h-3.5 w-3.5" />
          {t('action.new_note')}
        </button>
        <button
          type="button"
          onClick={handleBrowse}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <FolderOpen className="h-3.5 w-3.5" />
          {t('action.browse')}
        </button>
        <button
          type="button"
          onClick={() => void pasteClipboardIntoNewNote()}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
        >
          <Clipboard className="h-3.5 w-3.5" />
          {t('action.paste')}
        </button>
        <button
          type="button"
          onClick={handleOpenSidebar}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
        >
          <PanelRight className="h-3.5 w-3.5" />
          {t('action.list_all_notes')}
        </button>
      </div>
      {notice && <p className="text-xs text-destructive">{notice}</p>}
    </div>
  );

  // ── Loaded-note screen (note open) ──
  const noteScreen = (
    <>
      <ReaderPanel
        l2={l2} l1={l1}
        text={text}
        loading={loading} activeTab={activeTab}
        translating={translating}
        blocks={blocks}
        ctx={ctx}
        hideModeTabs={currentNoteId == null}
        hasNotes={notes.length > 0}
        sidebarVisible={isDesktop ? sidebarOpen : mobileSidebarOpen}
        onNewNote={handleNewNote}
        onOpenSidebar={handleOpenSidebar}
        onTextChange={handleTextChange}
        onTabChange={setActiveTab}
        onTokenize={handleTokenize}
        onFillSample={(sampleText, sampleTitle) => { setText(sampleText); setTitle(sampleTitle); }}
        initialLocation={initialLocation}
        onLocationChange={handleReaderLocationChange}
        onLemmatize={handleLemmatize}
        onPageTranslate={handlePageTranslate}
      />
    </>
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 h-[calc(100vh-57px)] flex flex-col overflow-hidden">
      {/* ── Full-width title bar ── */}
      <div className="mb-4 flex items-center gap-3 flex-shrink-0">
        <FileText className="h-6 w-6 flex-shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          {isEditingTitle ? (
            <input
              autoFocus
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              onBlur={() => setIsEditingTitle(false)}
              onKeyDown={(e) => { if (e.key === 'Enter') setIsEditingTitle(false); }}
              className="w-full rounded-md border border-primary bg-background px-2 py-1 text-xl font-bold outline-none"
              maxLength={200}
            />
          ) : (
            <div className="flex items-center gap-1.5">
              <h1 className="text-xl font-bold truncate">{title || t('title.notes_reader')}</h1>
              {currentNoteId != null && (
                <button
                  onClick={() => setIsEditingTitle(true)}
                  className="flex-shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  title={t('action.edit')}
                >
                  <PenLine className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
        </div>
        {/* Sidebar toggle — mobile: opens the slide-in sheet */}
        <button
          onClick={() => setMobileSidebarOpen(true)}
          className="lg:hidden flex-shrink-0 rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label={t('action.show_sidebar')}
        >
          <PanelRight className="h-5 w-5" />
        </button>

        {/* Sidebar toggle — desktop: collapses the persistent panel */}
        <button
          onClick={() => setSidebarOpen(o => !o)}
          className="hidden lg:flex flex-shrink-0 rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title={sidebarOpen ? t('action.collapse_sidebar') : t('action.expand_sidebar')}
        >
          {sidebarOpen ? <PanelRightClose className="h-5 w-5" /> : <PanelRight className="h-5 w-5" />}
        </button>
      </div>

      {/* ── Content row ── */}
      <div className="flex gap-4 flex-1 min-h-0">
        <div className="min-w-0 flex-1 flex flex-col min-h-0">
          {/* Default screen only when truly nothing is loaded: no open note AND
              no text pushed in from the extension / ?url= / method-arg flows. */}
          {currentNoteId == null && !loading && !text.trim() ? defaultScreen : noteScreen}
        </div>

        {/* Sidebar — shared desktop panel + mobile sheet */}
        <Sidebar
          open={mobileSidebarOpen}
          onOpenChange={setMobileSidebarOpen}
          sidebarOpen={sidebarOpen}
          title={t('title.notes')}
          desktopClassName="w-64 ml-3"
        >
          <NotesSidebar
            notes={notes}
            notesLoading={notesLoading}
            notesError={notesError}
            currentNoteId={currentNoteId}
            importedNoteIds={importedNoteIds}
            session={session}
            onSelectNote={handleSelectNote}
            onNewNote={handleNewNote}
            onRenameNote={handleRenameNote}
            onDeleteNote={handleDeleteNote}
          />
        </Sidebar>
      </div>

      {error && (
        <div className="flex-shrink-0 mt-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 shadow-lg">{error}</div>
      )}

      {/* Hidden multi-file picker for Browse / re-drop (text files) */}
      <input
        ref={fileInputRef}
        type="file"
        accept={NOTES_TEXT_ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) void importTextFiles(files);
          e.target.value = '';
        }}
      />
    </div>
  );
}
