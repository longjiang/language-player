'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useLanguage } from '@/providers/language-provider';
import { useT } from '@/hooks/use-t';
import type { SavedWordContext } from '@langplayer/shared';
import { parseMarkdown, type ReaderBlock, type TextBlock } from '@/lib/parse-markdown';
import { PYTHON_API_URL } from '@/lib/api-url';
import { ReaderPanel } from '@/components/reader/reader-panel';
import { EpubUpload } from '@/components/reader/epub-upload';
import { EpubChapterSidebar } from '@/components/reader/epub-chapter-sidebar';
import { useEpub } from '@/hooks/use-epub';
import {
  BookOpen, Loader2, PanelRightClose, PanelRight, X,
} from 'lucide-react';

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

export default function EpubPage() {
  const { l1, l2 } = useLanguage();
  const t = useT();
  const epub = useEpub();

  const [text, setText] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [blocks, setBlocks] = useState<ReaderBlock[] | null>(null);
  const [initialized, setInitialized] = useState(false);
  const anchorRef = useRef<string | null>(null);

  // On small screens, close sidebar by default
  useEffect(() => {
    if (window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
  }, []);

  // Restore from IndexedDB on mount
  useEffect(() => {
    (async () => {
      const result = await epub.restoreFromStorage();
      if (result?.markdown) {
        setText(result.markdown);
        anchorRef.current = result.anchor ?? null;
      }
      setInitialized(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load chapter text into state and tokenize
  const handleLoadChapter = useCallback(async (href: string) => {
    const md = await epub.loadChapter(href);
    setText(md);
    setBlocks(null);
  }, [epub]);

  // Handle file upload
  const handleFileLoaded = useCallback(async (data: ArrayBuffer, fileName: string) => {
    const result = await epub.loadFile(data, fileName);
    if (result?.firstChapterHref) {
      await handleLoadChapter(result.firstChapterHref);
    }
  }, [epub, handleLoadChapter]);

  // Parse markdown when text changes
  useEffect(() => {
    if (!text.trim()) { setBlocks(null); return; }
    try { setBlocks(parseMarkdown(text)); }
    catch { setBlocks(null); }
  }, [text]);

  // Internal link interceptor
  useEffect(() => {
    if (!epub.chapterLinks.size || !epub.book) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const link = target.closest('a');
      if (!link) return;
      const href = link.getAttribute('href');
      if (!href || href === '#' || href.startsWith('http')) return;
      const hrefBase = href.split('#')[0] || '';
      if (epub.chapterLinks.has(hrefBase)) {
        e.preventDefault();
        handleLoadChapter(href);
      }
    };
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, [epub.chapterLinks, epub.book, handleLoadChapter]);

  const ctx: Partial<SavedWordContext> = {
    text: stripMarkdown(text).slice(0, 200),
    textTitle: epub.chapterTitle || epub.fileName || 'EPUB Reader',
  };

  // Loading state while restoring from storage
  if (!initialized) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 h-[calc(100vh-57px)] flex flex-col overflow-hidden">
      {/* ── Title bar ── */}
      <div className="mb-4 flex items-center gap-3 flex-shrink-0">
        <BookOpen className="h-6 w-6 flex-shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold truncate">
            {epub.chapterTitle || epub.fileName || t('title.epub_reader')}
          </h1>
        </div>
        {/* Close EPUB */}
        {epub.toc.length > 0 && (
          <button
            onClick={epub.close}
            className="flex-shrink-0 rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex items-center gap-1"
          >
            <X className="h-3.5 w-3.5" />
            {t('action.close')}
          </button>
        )}
        {/* Collapse toggle — top right, only when EPUB loaded */}
        {epub.toc.length > 0 && (
          <button
            onClick={() => setSidebarOpen(o => !o)}
            className="flex-shrink-0 rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title={sidebarOpen ? t('action.collapse_sidebar') : t('action.expand_sidebar')}
          >
            {sidebarOpen ? <PanelRightClose className="h-5 w-5" /> : <PanelRight className="h-5 w-5" />}
          </button>
        )}
      </div>

      {/* ── Content row: reader panel first, then sidebar ── */}
      <div className="flex gap-4 flex-1 min-h-0 relative">
        {/* Content area */}
        <div className="min-w-0 flex-1 flex flex-col min-h-0">
          {epub.toc.length === 0 && !epub.fileName ? (
            /* ── Upload zone ── */
            <EpubUpload
              onFileLoaded={handleFileLoaded}
              fileName={epub.fileName}
              error={epub.error ? t(epub.error) : null}
            />
          ) : epub.toc.length > 0 && !epub.coverTapped && epub.coverUrl ? (
            /* ── Cover ── */
            <div className="flex items-center justify-center min-h-[60vh]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={epub.coverUrl}
                alt="Cover"
                className="max-h-[70vh] max-w-full cursor-pointer rounded-lg shadow-xl transition-transform hover:scale-[1.02]"
                onClick={() => {
                  // Mark cover tapped and load first chapter if not already loaded
                  if (epub.flatToc.length > 0) {
                    handleLoadChapter(epub.flatToc[0]!.href);
                  }
                }}
              />
            </div>
          ) : epub.coverTapped && text ? (
            /* ── Reader ── */
            <ReaderPanel
              l2={l2} l1={l1}
              text={text}
              loading={epub.loading}
              activeTab="read"
              translating={false}
              blocks={blocks}
              ctx={ctx}
              showTabs={false}
              onTextChange={() => {}}
              onTabChange={() => {}}
              onTokenize={() => {}}
              onFillSample={() => {}}
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
                try {
                  const res = await fetch(`${PYTHON_API_URL}/translate_array`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ texts, l1: l1.code, l2: l2.code }),
                  });
                  const data = await res.json();
                  return data?.translated_texts ?? [];
                } catch { return []; }
              }}
              onAnchorChange={(anchor) => epub.saveAnchor(anchor)}
              initialAnchor={anchorRef.current}
            />
          ) : epub.loading ? (
            <div className="flex min-h-[40vh] items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : epub.error ? (
            /* ── Parse / load error ── */
            <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3">
              <p className="text-sm text-destructive">{t(epub.error)}</p>
              <button
                onClick={epub.close}
                className="rounded px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                {t('action.close')}
              </button>
            </div>
          ) : null}
        </div>

        {/* Chapter sidebar — on the right */}
        {epub.toc.length > 0 && (
          <EpubChapterSidebar
            toc={epub.toc}
            currentChapterHref={epub.chapterHref}
            loading={epub.loading}
            onLoadChapter={handleLoadChapter}
            onPrevChapter={epub.prevChapter}
            onNextChapter={epub.nextChapter}
            hasPrevChapter={!!epub.prevHref}
            hasNextChapter={!!epub.nextHref}
            sidebarOpen={sidebarOpen}
          />
        )}
      </div>
    </div>
  );
}
