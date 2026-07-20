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
import { EpubUpload, type TocItem } from '@/components/reader/epub-upload';
import { saveEpub, loadEpub, updateEpubMeta, deleteEpub } from '@/lib/epub-store';

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
  const [urlInput, setUrlInput] = useState('');

  // ── EPUB state ──
  const [epubBook, setEpubBook] = useState<any>(null);
  const [epubToc, setEpubToc] = useState<TocItem[] | null>(null);
  const [epubCoverUrl, setEpubCoverUrl] = useState<string | null>(null);
  const [epubCoverTapped, setEpubCoverTapped] = useState(false);
  const [epubChapterHref, setEpubChapterHref] = useState<string | null>(null);
  const [epubChapterTitle, setEpubChapterTitle] = useState<string | null>(null);
  const [epubFileName, setEpubFileName] = useState<string | null>(null);
  const [epubPrevHref, setEpubPrevHref] = useState<string | null>(null);
  const [epubNextHref, setEpubNextHref] = useState<string | null>(null);
  const [epubPageProgressionDir, setEpubPageProgressionDir] = useState<'ltr' | 'rtl'>('ltr');
  const [epubChapterLinks, setEpubChapterLinks] = useState<Set<string>>(new Set());
  const [initialAnchor, setInitialAnchor] = useState<string | null>(null);
  const [showEpubUpload, setShowEpubUpload] = useState(false);
  const epubInitRef = useRef(false);

  const [isEditingTitle, setIsEditingTitle] = useState(false);

  const [blocks, setBlocks] = useState<ReaderBlock[] | null>(null);
  const [blockTokens, setBlockTokens] = useState<LemmatizedToken[][] | null>(null);
  const [tokenizing, setTokenizing] = useState(false);
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
    if (!convertedText.trim()) { setBlocks(null); setBlockTokens(null); return; }
    try { setBlocks(parseMarkdown(convertedText)); setBlockTokens(null); }
    catch { setBlocks(null); setBlockTokens(null); }
  }, [convertedText]);

  // Lemmatize
  useEffect(() => {
    if (!blocks || !l2.code) return;
    const textBlocks = blocks.filter((b): b is TextBlock => b.kind === 'text');
    if (textBlocks.length === 0) { setBlockTokens([]); return; }
    setTokenizing(true);
    let cancelled = false;
    fetch(`${PYTHON_API_URL}/lemmatize-normalized/batch`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts: textBlocks.map(b => b.text), l2: l2.code }),
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled) { setBlockTokens(d?.results ?? null); setTokenizing(false); } })
      .catch(() => { if (!cancelled) setTokenizing(false); });
    return () => { cancelled = true; };
  }, [blocks, l2.code]);

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

  // ── EPUB helpers ──

  /** Handle a newly uploaded / loaded EPUB file. */
  const handleEpubFile = useCallback(async (
    data: ArrayBuffer,
    fileName: string,
    restoreChapterHref?: string | null,
    restoreAnchor?: string | null,
  ) => {
    // Dynamic import — epubjs is a client-only ESM package
    const ePubModule = await import('epubjs');
    const ePub = ePubModule.default;
    const book = ePub(data);
    setEpubBook(book);
    setEpubFileName(fileName);
    setEpubCoverTapped(false);
    setEpubCoverUrl(null);
    setInitialAnchor(restoreAnchor ?? null);

    try {
      const navigation = await book.loaded.navigation;
      // Keep nested TOC structure, don't flatten
      const tocItems = navigation.toc as TocItem[];
      setEpubToc(tocItems);

      const cover = await book.coverUrl();
      setEpubCoverUrl(cover ?? null);
      if (!cover) setEpubCoverTapped(true);

      // Save to IndexedDB (include anchor)
      await saveEpub(data, fileName, restoreChapterHref ?? undefined, undefined, restoreAnchor ?? undefined);

      // Load first chapter (or restore last chapter)
      const flatItems = flattenToc(tocItems);
      const targetHref = restoreChapterHref || flatItems[0]?.href;
      const targetLabel = targetHref
        ? (flatItems.find(t => t.href === targetHref)?.label ?? undefined)
        : undefined;
      if (targetHref) {
        await loadEpubChapter(book, targetHref, targetLabel);
      }
    } catch (err) {
      console.error('Error loading EPUB:', err);
      setError('Failed to parse EPUB file');
    }
  }, []);

  /** Convert TOC to flat list. */
  function flattenToc(items: any[]): TocItem[] {
    const result: TocItem[] = [];
    for (const item of items) {
      result.push({ href: item.href, label: item.label });
      if (item.subitems && item.subitems.length > 0) {
        result.push(...flattenToc(item.subitems));
      }
    }
    return result;
  }
  /** Recursively find a TOC item by href. */
  function findTocByHref(items: TocItem[], href: string): TocItem | null {
    for (const item of items) {
      if (item.href === href) return item;
      if (item.subitems?.length) {
        const found = findTocByHref(item.subitems, href);
        if (found) return found;
      }
    }
    return null;
  }
  /** Load a chapter by href from the currently open book. */
  const loadEpubChapter = useCallback(async (book: any, href: string, label?: string) => {
    if (!book) return;
    setLoading(true);
    setEpubChapterHref(href);
    setEpubChapterTitle(label || null);
    try {
      const spine = await book.loaded.spine;
      const cleanHref = href.split('#')[0];
      const item = spine.get(cleanHref);
      if (!item) { setLoading(false); return; }
      const contents = await item.load(book.load.bind(book));
      const rawHtml = contents.innerHTML;

      // Process the HTML in a DOM parser
      const doc = new DOMParser().parseFromString(rawHtml, 'text/html');
      const urlCache = book.archive?.urlCache ?? {};

      // ── Resolve image src attributes to absolute blob URLs ──
      doc.querySelectorAll('img').forEach(img => {
        const src = img.getAttribute('src');
        if (src) {
          const resolved = book.path?.resolve?.(src);
          if (resolved && urlCache[resolved]) {
            img.setAttribute('src', urlCache[resolved]);
          }
        }
      });
      doc.querySelectorAll('image').forEach(img => {
        const src = img.getAttribute('xlink:href') || img.getAttribute('href');
        if (src) {
          const resolved = book.path?.resolve?.(src);
          if (resolved && urlCache[resolved]) {
            img.setAttribute('xlink:href', urlCache[resolved]);
          }
        }
      });

      // ── Handle ruby (furigana) — convert to inline text ──
      // <ruby>基<rt>き</rt>礎<rt>そ</rt></ruby> → 基(き)礎(そ)
      doc.querySelectorAll('ruby').forEach(ruby => {
        const parts: string[] = [];
        ruby.childNodes.forEach(node => {
          if (node.nodeType === Node.TEXT_NODE) {
            parts.push(node.textContent || '');
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as Element;
            if (el.tagName === 'RT' || el.tagName === 'RTC') {
              const rt = el.textContent || '';
              if (rt) parts.push(`(${rt})`);
            } else {
              parts.push(el.textContent || '');
            }
          }
        });
        const span = doc.createElement('span');
        span.textContent = parts.join('');
        ruby.replaceWith(span);
      });

      // ── Detect page progression direction from spine ──
      const pkg = book.package?.metadata?.['page-progression-direction'];
      setEpubPageProgressionDir(pkg === 'rtl' ? 'rtl' : 'ltr');

      // ── Detect vertical writing mode ──
      let isVertical = false;
      // Check inline styles on body or root html element
      const rootEl = doc.querySelector('[style*="writing-mode"]') ||
                     doc.querySelector('[style*="writing-mode"]');
      doc.querySelectorAll('[style]').forEach(el => {
        const s = el.getAttribute('style') || '';
        if (/writing-mode\s*:\s*(vertical-rl|vertical-lr|tb-rl)/i.test(s)) {
          isVertical = true;
        }
      });
      // Also check for dir or class-based vertical layouts
      if (!isVertical) {
        const html = doc.querySelector('html');
        if (html?.getAttribute('style') && /vertical/.test(html.getAttribute('style') || '')) isVertical = true;
      }
      // Note: we can't fully detect CSS class-based vertical from HTML alone,
      // but common patterns are covered.

      const fixedHtml = doc.body.innerHTML;

      // Convert to markdown
      const md = await htmlToMarkdown(fixedHtml, 'https://epub.local/');

      // Post-process: convert cross-chapter links to a format we can intercept.
      // EPUB internal links like `chapter2.xhtml#s1` need to load that chapter.
      const spineHrefs = new Set(
        (spine.items as any[]).map((s: any) => s.href.split('#')[0])
      );
      // Store the spine hrefs for the click handler
      setEpubChapterLinks(spineHrefs);

      setText(md);
      setActiveTab('read');
      setEpubCoverTapped(true);

      // Update chapter nav
      const idx = (spine.items as any[]).findIndex((s: any) => s.href === cleanHref);
      setEpubPrevHref(idx > 0 ? (spine.items as any[])[idx - 1]!.href : null);
      setEpubNextHref(idx < (spine.items as any[]).length - 1 ? (spine.items as any[])[idx + 1]!.href : null);

      // Save chapter position to IDB
      await updateEpubMeta({ lastChapterHref: href, lastChapterTitle: label || null });
    } catch (err) {
      console.error('Error loading chapter:', err);
      setError('Failed to load chapter');
    } finally {
      setLoading(false);
    }
  }, []);

  /** Navigate to the next chapter. */
  const goToNextChapter = useCallback(async () => {
    if (!epubNextHref || !epubBook) return;
    const tocItem = epubToc?.find(t => t.href === epubNextHref);
    await loadEpubChapter(epubBook, epubNextHref, tocItem?.label);
  }, [epubNextHref, epubBook, epubToc, loadEpubChapter]);

  /** Navigate to the previous chapter. */
  const goToPrevChapter = useCallback(async () => {
    if (!epubPrevHref || !epubBook) return;
    const tocItem = epubToc?.find(t => t.href === epubPrevHref);
    await loadEpubChapter(epubBook, epubPrevHref, tocItem?.label);
  }, [epubPrevHref, epubBook, epubToc, loadEpubChapter]);

  /** Close EPUB and return to normal reader mode. */
  const closeEpub = useCallback(async () => {
    setEpubBook(null);
    setEpubToc(null);
    setEpubCoverUrl(null);
    setEpubCoverTapped(false);
    setEpubChapterHref(null);
    setEpubChapterTitle(null);
    setEpubFileName(null);
    setEpubPrevHref(null);
    setEpubNextHref(null);
    setText('');
    setActiveTab('edit');
    await deleteEpub();
  }, []);

  /** Intercept clicks on cross-chapter links inside the reader panel. */
  useEffect(() => {
    if (!epubChapterLinks.size || !epubBook) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const link = target.closest('a');
      if (!link) return;
      const href = link.getAttribute('href');
      if (!href || href === '#' || href.startsWith('http')) return;
      // Check if this is an EPUB internal link
      const hrefBase = href.split('#')[0] || '';
      if (epubChapterLinks.has(hrefBase)) {
        e.preventDefault();
        const tocItem = findTocByHref(epubToc || [], href);
        loadEpubChapter(epubBook, href, tocItem?.label);
      }
    };
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, [epubChapterLinks, epubBook, epubToc, loadEpubChapter]);

  useEffect(() => {
    if (epubInitRef.current) return;
    epubInitRef.current = true;

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
      return;
    }

    // Check for stored EPUB
    (async () => {
      try {
        const stored = await loadEpub();
        if (stored?.data && stored.meta.fileName) {
          setEpubFileName(stored.meta.fileName);
          await handleEpubFile(stored.data, stored.meta.fileName, stored.meta.lastChapterHref, stored.meta.lastAnchor);
        }
      } catch { /* ignore */ }
    })();
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
    <div className="mx-auto max-w-7xl px-4 py-6">
      {/* ── Full-width title bar ── */}
      <div className="mb-4 flex items-center gap-3">
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
              <h1 className="text-xl font-bold truncate">{title || t('title.reader')}</h1>
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
        {/* EPUB toggle */}
        {!epubToc && !showEpubUpload && (
          <button
            onClick={() => setShowEpubUpload(true)}
            className="flex-shrink-0 rounded p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors text-xs flex items-center gap-1"
            title={t('title.epub_reader')}
          >
            <BookOpen className="h-4 w-4" />
            <span className="hidden sm:inline">EPUB</span>
          </button>
        )}
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
      <div className="flex gap-4">
        {epubToc ? (
          /* ── EPUB mode (book loaded + TOC) ── */
          <div className="min-w-0 flex-1 flex flex-col">
            <EpubUpload
              toc={epubToc}
              currentChapterHref={epubChapterHref}
              coverUrl={epubCoverUrl}
              coverTapped={epubCoverTapped}
              loading={loading}
              chapterTitle={epubChapterTitle}
              fileName={epubFileName}
              onFileLoaded={handleEpubFile}
              onChapterLoaded={() => {}}
              onLoadChapter={async (href) => {
                const tocItem = findTocByHref(epubToc, href);
                await loadEpubChapter(epubBook, href, tocItem?.label);
              }}
              onClose={closeEpub}
              onCoverTap={() => setEpubCoverTapped(true)}
              onPrevChapter={goToPrevChapter}
              onNextChapter={goToNextChapter}
              hasPrevChapter={!!epubPrevHref}
              hasNextChapter={!!epubNextHref}
            />
            {epubCoverTapped && (
              <div className="flex-1 min-h-0 mt-3">
                <ReaderPanel
                  l2={l2} l1={l1}
                  text={text}
                  loading={loading} activeTab={activeTab}
                  translating={translating}
                  blocks={blocks} blockTokens={blockTokens} tokenizing={tokenizing}
                  ctx={ctx}
                  onTextChange={handleTextChange}
                  onTabChange={setActiveTab}
                  onTokenize={handleTokenize}
                  onFillSample={(sampleText, sampleTitle) => { setText(sampleText); setTitle(sampleTitle); }}
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
                  onAnchorChange={(anchor) => {
                    updateEpubMeta({ lastAnchor: anchor });
                  }}
                  initialAnchor={initialAnchor}
                />
              </div>
            )}
          </div>
        ) : showEpubUpload || (epubFileName && !epubToc) ? (
          /* ── EPUB upload zone ── */
          <div className="min-w-0 flex-1">
            <EpubUpload
              toc={null}
              currentChapterHref={null}
              coverUrl={null}
              coverTapped={false}
              loading={false}
              chapterTitle={null}
              fileName={epubFileName}
              onFileLoaded={handleEpubFile}
              onChapterLoaded={() => {}}
              onLoadChapter={async () => {}}
              onClose={() => {
                setEpubFileName(null);
                setShowEpubUpload(false);
                deleteEpub();
              }}
              onCoverTap={() => {}}
            />
          </div>
        ) : (
          /* ── Normal reader mode ── */
          <ReaderPanel
            l2={l2} l1={l1}
            text={text}
            loading={loading} activeTab={activeTab}
            translating={translating}
            blocks={blocks} blockTokens={blockTokens} tokenizing={tokenizing}
            ctx={ctx}
            onTextChange={handleTextChange}
            onTabChange={setActiveTab}
            onTokenize={handleTokenize}
            onFillSample={(sampleText, sampleTitle) => { setText(sampleText); setTitle(sampleTitle); }}
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
        )}

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
