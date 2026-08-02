'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useLanguage } from '@/providers/language-provider';
import { useT } from '@/hooks/use-t';
import type { SavedWordContext } from '@langplayer/shared';
import { parseMarkdown, type ReaderBlock, type TextBlock } from '@/lib/parse-markdown';
import { PYTHON_API_URL } from '@/lib/api-url';
import { translateTextsKeyed } from '@/lib/translate';
import { ReaderPanel } from '@/components/reader/reader-panel';
import { EpubBookshelf } from '@/components/reader/epub-bookshelf';
import { EpubImportDialog } from '@/components/reader/epub-import-dialog';
import { EpubChapterSidebar } from '@/components/reader/epub-chapter-sidebar';
import { useEpub } from '@/hooks/use-epub';
import { Sidebar } from '@/components/ui/sidebar';
import type { EpubFileError, EpubUploadResult } from '@/components/reader/epub-upload';
import {
  ArrowLeft, BookOpen, ChevronLeft, ChevronRight, Loader2, PanelRightClose, PanelRight,
} from 'lucide-react';

export default function EpubPage() {
  const { l1, l2 } = useLanguage();
  const t = useT();
  const epub = useEpub();

  const [text, setText] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [blocks, setBlocks] = useState<ReaderBlock[] | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [importFailures, setImportFailures] = useState<EpubFileError[]>([]);
  const anchorRef = useRef<string | null>(null);

  // Load the bookshelf on mount — books are opened explicitly, not auto-resumed.
  useEffect(() => {
    (async () => {
      await epub.refreshBooks();
      setInitialized(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load chapter text into state and tokenize
  const handleLoadChapter = useCallback(async (href: string) => {
    setMobileSidebarOpen(false);
    anchorRef.current = null;
    const md = await epub.loadChapter(href);
    setText(md);
    setBlocks(null);
  }, [epub]);

  // Open a stored book at its saved chapter/page
  const handleOpenBook = useCallback(async (id: string) => {
    setOpeningId(id);
    try {
      const result = await epub.openBook(id);
      if (result?.markdown) {
        setText(result.markdown);
        anchorRef.current = result.anchor ?? null;
      } else {
        anchorRef.current = null;
      }
    } finally {
      setOpeningId(null);
    }
  }, [epub]);

  // Handle file upload(s) — add to the shelf without opening; collect any
  // files that failed (up-front validation or parse errors) for the dialog.
  const handleFilesProcessed = useCallback(async ({ files, failures }: EpubUploadResult) => {
    const failed: EpubFileError[] = [...failures];
    for (const file of files) {
      const added = await epub.addBook(file.data, file.fileName);
      if (!added) {
        failed.push({ fileName: file.fileName, fileSize: file.fileSize, reasonKey: 'msg.epub_parse_error' });
      }
    }
    epub.clearError();
    setImportFailures(failed);
  }, [epub]);

  // Close the book and return to the bookshelf (the handle is kept)
  const handleClose = useCallback(async () => {
    await epub.close();
    setText('');
    setBlocks(null);
    anchorRef.current = null;
  }, [epub]);

  // Remove a book from the shelf
  const handleRemoveBook = useCallback(async (id: string) => {
    await epub.removeBook(id);
  }, [epub]);

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
        {epub.openBookId ? (
          /* Back to bookshelf */
          <button
            onClick={handleClose}
            aria-label={t('action.back')}
            title={t('action.back')}
            className="flex-shrink-0 rounded-md p-1 text-foreground transition-colors hover:bg-muted"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        ) : (
          <BookOpen className="h-6 w-6 flex-shrink-0 text-primary" />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold truncate">
            {epub.chapterTitle || epub.fileName || t('title.epub_reader')}
          </h1>
        </div>
        {/* Sidebar toggles — only when EPUB loaded */}
        {epub.toc.length > 0 && (
          <>
            <button
              onClick={() => setMobileSidebarOpen(true)}
              className="lg:hidden flex-shrink-0 rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label={t('action.show_sidebar')}
            >
              <PanelRight className="h-5 w-5" />
            </button>
            <button
              onClick={() => setSidebarOpen(o => !o)}
              className="hidden lg:flex flex-shrink-0 rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title={sidebarOpen ? t('action.collapse_sidebar') : t('action.expand_sidebar')}
            >
              {sidebarOpen ? <PanelRightClose className="h-5 w-5" /> : <PanelRight className="h-5 w-5" />}
            </button>
          </>
        )}
      </div>

      {/* ── Content row ── */}
      <div className="flex gap-4 flex-1 min-h-0">

        {/* Content area */}
        <div className="min-w-0 flex-1 flex flex-col min-h-0">
          {!epub.openBookId ? (
            /* ── Bookshelf home ── */
            <EpubBookshelf
              books={epub.books}
              onOpenBook={handleOpenBook}
              onRemoveBook={handleRemoveBook}
              onFilesProcessed={handleFilesProcessed}
              openingId={openingId}
              error={epub.error ? t(epub.error) : null}
            />
          ) : openingId ? (
            /* ── Opening a book — spinner until the chapter loads ── */
            <div className="flex min-h-[40vh] items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : epub.toc.length > 0 && !epub.coverTapped && epub.coverUrl ? (
            /* ── Cover ── */
            <div className="flex items-center justify-center min-h-[60vh]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={epub.coverUrl}
                alt={t('label.cover')}
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
              key={epub.openBookId}
              l2={l2} l1={l1}
              text={text}
              loading={epub.loading}
              activeTab="read"
              translating={false}
              blocks={blocks}
              ctx={ctx}
              onTextChange={() => {}}
              onTabChange={() => {}}
              onTokenize={() => {}}
              onFillSample={() => {}}
              hideModeTabs
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
                  const { byKey } = await translateTextsKeyed(texts, l1.code, l2.code);
                  return byKey;
                } catch { return {}; }
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
                onClick={handleClose}
                className="rounded px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                {t('action.close')}
              </button>
            </div>
          ) : null}
        </div>

        {/* Sidebar — shared desktop panel + mobile sheet */}
        {epub.toc.length > 0 && (
          <Sidebar
            open={mobileSidebarOpen}
            onOpenChange={setMobileSidebarOpen}
            sidebarOpen={sidebarOpen}
            title={t('msg.chapters')}
            desktopClassName="w-64 ml-3"
            headerActions={
              <>
                <button
                  onClick={epub.prevChapter}
                  disabled={!epub.prevHref || epub.loading}
                  className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 transition-colors"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  {t('action.previous_chapter')}
                </button>
                <button
                  onClick={epub.nextChapter}
                  disabled={!epub.nextHref || epub.loading}
                  className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 transition-colors"
                >
                  {t('action.next_chapter')}
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </>
            }
            footer={
              <div className="px-3 py-2">
                <p className="text-xs text-muted-foreground">
                  {epub.toc.length} {t('msg.chapters')}
                </p>
              </div>
            }
          >
            <EpubChapterSidebar
              toc={epub.toc}
              currentChapterHref={epub.chapterHref}
              onLoadChapter={handleLoadChapter}
            />
          </Sidebar>
        )}
      </div>

      {/* Import failure dialog */}
      <EpubImportDialog
        failures={importFailures}
        onClose={() => setImportFailures([])}
      />
    </div>
  );
}
