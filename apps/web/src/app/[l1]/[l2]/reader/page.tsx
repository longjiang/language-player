'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
import {
  Loader2, FileText, PenLine,
  PanelRightClose, PanelRight,
} from 'lucide-react';
import { ReaderPanel } from '@/components/reader/reader-panel';
import type { ReaderLoc } from '@/components/reader/paginated-reader';
import { NotesSidebar } from '@/components/reader/notes-sidebar';
import { Sidebar } from '@/components/ui/sidebar';
import { getNotePosition, saveNotePosition } from '@/lib/reader-position';

// HTML→Markdown conversion and the reader fetch live in @langplayer/shared
// (htmlToMarkdown, fetchReaderPage) so web and mobile share one pipeline
// (SPEC-083 / SPEC-087 §2).

const READER_TEXT_KEY = 'lp_reader_text';
const READER_TITLE_KEY = 'lp_reader_title';

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
    </div>
  );
}
