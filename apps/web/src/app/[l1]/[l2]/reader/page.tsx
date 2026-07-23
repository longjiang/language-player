'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useLanguage } from '@/providers/language-provider';
import { useT } from '@/hooks/use-t';
import type { LemmatizedToken, SavedWordContext, NoteListItem, Note } from '@langplayer/shared';
import { apiClient } from '@langplayer/api-client';
import { PYTHON_API_URL } from '@/lib/api-url';
import { parseMarkdown, type ReaderBlock, type TextBlock } from '@/lib/parse-markdown';
import { getUseTraditional } from '@/lib/settings';
import { toTraditional } from '@/lib/chinese-script';
import {
  Loader2, BookOpen, PenLine,
  PanelRightClose, PanelRight,
} from 'lucide-react';
import { ReaderPanel } from '@/components/reader/reader-panel';
import { NotesSidebar } from '@/components/reader/notes-sidebar';

// Lazy-load turndown for HTML→markdown conversion
let _turndown: any = null;
async function getTurndown() {
  if (!_turndown) {
    const Turndown = (await import('turndown')).default;
    _turndown = new Turndown({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
  }
  return _turndown;
}

async function htmlToMarkdown(html: string, baseUrl: string): Promise<string> {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, style, nav, header, footer, aside, .sidebar, .menu, .navigation, .mw-jump-link, .mw-editsection, .reference, .noprint, .thumb, .infobox, .navbox, .metadata').forEach(el => el.remove());
  const mainContent = doc.querySelector('#mw-content-text') || doc.querySelector('article') || doc.body;
  mainContent.querySelectorAll('a').forEach(el => {
    const href = el.getAttribute('href');
    if (href) { try { el.setAttribute('href', new URL(href, baseUrl).href); } catch {} }
  });
  const td = await getTurndown();
  return td.turndown(mainContent.innerHTML);
}

const READER_TEXT_KEY = 'lp_reader_text';
const READER_TITLE_KEY = 'lp_reader_title';

function stripMarkdown(md: string): string {
  return md
    .replace(/#{1,6}\s/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1')
    .replace(/\*(.+?)\*/g, '$1').replace(/_(.+?)_/g, '$1')
    .replace(/```[\s\S]*?```/g, '').replace(/`(.+?)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/>\s/g, '')
    .replace(/[-*+]\s/g, '').replace(/\d+\.\s/g, '')
    .replace(/\n{3,}/g, '\n\n').trim();
}

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
  const [convertedText, setConvertedText] = useState(text);

  const isChinese = l2.code === 'zh' || l2.code.startsWith('zh-');
  const useTraditional = isChinese ? getUseTraditional() : false;

  // ── Notes ──
  const { data: session } = useSession();
  const [notes, setNotes] = useState<NoteListItem[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
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
        .then(note => { setText(note.text || ''); setTranslation(note.translation || ''); setTitle(note.title || ''); setCurrentNoteId(id); setActiveTab('read'); })
        .catch((e: any) => setError(e?.message || t('msg.failed_to_load_note')))
        .finally(() => setLoading(false));
    }
  }, [noteIdParam, session, t]);

  // Select a note
  const handleSelectNote = useCallback(async (noteId: number) => {
    setLoading(true); setError(null);
    try {
      const note = await apiClient.get<Note>(`/user-notes/${noteId}`);
      setText(note.text || ''); setTranslation(note.translation || ''); setTitle(note.title || '');
      setCurrentNoteId(noteId); setDirty(false); setActiveTab('read');
      router.replace(`/${l1.code}/${l2.code}/reader?noteId=${noteId}`, { scroll: false });
    } catch (e: any) { setError(e?.message || t('msg.failed_to_load_note')); }
    finally { setLoading(false); }
  }, [t, l1.code, l2.code, router]);

  // New note
  const handleNewNote = useCallback(async () => {
    if (!session) return;
    setLoading(true); setError(null);
    try {
      const created = await apiClient.post<Note>('/user-notes', { title: t('msg.untitled_note'), text: '', translation: '', l2: l2.code });
      setNotes(prev => [{ id: created.id, title: created.title, created_on: created.created_on }, ...prev]);
      setText(''); setTranslation(''); setTitle(t('msg.untitled_note'));
      setCurrentNoteId(created.id); setDirty(false); setActiveTab('edit');
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

  // Script conversion
  useEffect(() => {
    if (!isChinese || !text.trim() || !useTraditional) { setConvertedText(text); return; }
    let cancelled = false;
    toTraditional(text).then(r => { if (!cancelled) setConvertedText(r); });
    return () => { cancelled = true; };
  }, [text, isChinese, useTraditional]);

  // Parse markdown
  useEffect(() => {
    if (!convertedText.trim()) { setBlocks(null); return; }
    try { setBlocks(parseMarkdown(convertedText)); }
    catch { setBlocks(null); }
  }, [convertedText]);

  // Load from localStorage / URL params
  const loadUrl = useCallback(async (url: string, isMarkdown: boolean) => {
    setLoading(true); setError(null);
    router.replace(`/${l1.code}/${l2.code}/reader?url=${encodeURIComponent(url)}`, { scroll: false });
    try {
      const res = await fetch(`${PYTHON_API_URL}/proxy?url=${encodeURIComponent(url)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.text();
      if (isMarkdown) setText(raw);
      else { const md = await htmlToMarkdown(raw, url); setText(md); }
    } catch (e: any) { setError(e?.message || t('msg.failed_to_load_url')); }
    finally { setLoading(false); }
  }, [l1.code, l2.code, router, t]);

  useEffect(() => {
    const storedText = localStorage.getItem(READER_TEXT_KEY);
    if (storedText) {
      setText(storedText); setTitle(localStorage.getItem(READER_TITLE_KEY) || '');
      localStorage.removeItem(READER_TEXT_KEY); localStorage.removeItem(READER_TITLE_KEY);
      setActiveTab('read'); return;
    }
    if (urlParam) { loadUrl(decodeURIComponent(urlParam), false); return; }
    if (method && arg) {
      if (['md', 'html', 'txt'].includes(method)) { setText(decodeURIComponent(arg)); setActiveTab('read'); }
      else if (method === 'md-url') loadUrl(arg, true);
      else if (method === 'html-url') loadUrl(arg, false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const ctx: Partial<SavedWordContext> = { text: stripMarkdown(text).slice(0, 200), textTitle: title || 'Reader' };

  if (loading && !text) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full max-w-7xl flex-col overflow-hidden px-4 py-6">
      {/* ── Full-width title bar ── */}
      <div className="mb-4 flex flex-shrink-0 items-center gap-3">
        <BookOpen className="h-6 w-6 flex-shrink-0 text-primary" />
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
              <button
                onClick={() => setIsEditingTitle(true)}
                className="flex-shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title={t('action.edit')}
              >
                <PenLine className="h-4 w-4" />
              </button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">{l2.name} → {l1.name}</p>
        </div>
        {/* Collapse toggle — top right */}
        <button
          onClick={() => setSidebarOpen(o => !o)}
          className="flex-shrink-0 rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title={sidebarOpen ? t('action.collapse_sidebar') : t('action.expand_sidebar')}
        >
          {sidebarOpen ? <PanelRightClose className="h-5 w-5" /> : <PanelRight className="h-5 w-5" />}
        </button>
      </div>

      {/* ── Content row: reader panel + sidebar ── */}
      <div className="flex flex-1 gap-4 min-h-0">
        <ReaderPanel
            l2={l2} l1={l1}
            text={text}
            loading={loading} activeTab={activeTab}
            translating={translating}
            blocks={blocks}
            ctx={ctx}
            onTextChange={handleTextChange}
            onTabChange={setActiveTab}
            onTokenize={handleTokenize}
            onFillSample={(sampleText, sampleTitle) => { setText(sampleText); setTitle(sampleTitle); }}
            onLemmatize={async (texts) => {
              const res = await fetch(`${PYTHON_API_URL}/lemmatize-normalized/batch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ texts, l2: l2.code }),
              });
              const data = res.ok ? await res.json() : null;
              return data?.results ?? [];
            }}
            onPageTranslate={async (texts) => {
              setTranslating(true);
              try {
                const res = await fetch(`${PYTHON_API_URL}/translate_array`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ texts, l1: l1.code, l2: l2.code }),
                });
                const data = await res.json();
                return data?.translated_texts ?? [];
              } catch (e: any) {
                setError(e?.message || 'Translation failed');
                return [];
              } finally {
                setTranslating(false);
              }
            }}
          />

        <NotesSidebar
          notes={notes} notesLoading={notesLoading} notesError={notesError}
          currentNoteId={currentNoteId} sidebarOpen={sidebarOpen} session={session}
          onSelectNote={handleSelectNote}
          onNewNote={handleNewNote}
          onRenameNote={handleRenameNote}
          onDeleteNote={handleDeleteNote}
        />
      </div>

      {error && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 shadow-lg">{error}</div>
      )}
    </div>
  );
}
