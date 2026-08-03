'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/providers/language-provider';
import { useT } from '@/hooks/use-t';
import type { SavedWordContext } from '@langplayer/shared';
import { PYTHON_API_URL } from '@/lib/api-url';
import { translateTextsKeyed } from '@/lib/translate';
import { EpubReaderPanel } from '@/components/reader/epub-reader-panel';
import { EpubBookshelf } from '@/components/reader/epub-bookshelf';
import { EpubImportDialog } from '@/components/reader/epub-import-dialog';
import { EpubChapterSidebar } from '@/components/reader/epub-chapter-sidebar';
import { EpubSearchPanel } from '@/components/reader/epub-search-panel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useEpub, markerForLocation } from '@/hooks/use-epub';
import type { BookLocation, TocMarker } from '@/lib/epub-book-types';
import { Sidebar } from '@/components/ui/sidebar';
import type { EpubFileError, EpubUploadResult } from '@/components/reader/epub-upload';
import type { EpubSearchResult } from '@/hooks/use-epub';
import {
  ArrowLeft, BookOpen, ChevronLeft, ChevronRight, Loader2, PanelRightClose, PanelRight,
} from 'lucide-react';
import { log } from '@/lib/logger';

export default function EpubPage() {
  const { l1, l2 } = useLanguage();
  const t = useT();
  const router = useRouter();
  const epub = useEpub();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const openingIdRef = useRef<string | null>(null);
  const [importFailures, setImportFailures] = useState<EpubFileError[]>([]);
  const [location, setLocation] = useState<BookLocation | null>(null);
  const [jumpNonce, setJumpNonce] = useState(0);
  const pendingStartRef = useRef<BookLocation | null>(null);
  /** Locations to return to via Back — pushed on in-book jumps (TOC clicks,
   *  search results, internal links), never on plain page turns. */
  const historyRef = useRef<BookLocation[]>([]);

  /** Jump the reader to a location (TOC, search, links, restore). */
  const gotoLocation = useCallback((loc: BookLocation | null) => {
    if (!loc) return;
    log(`[LP Web] EPUB gotoLocation spine=${loc.spineIndex} block=${loc.blockIndex} offset=${loc.offset}`);
    setLocation(loc);
    setJumpNonce(n => n + 1);
  }, []);

  /** Remember the current page so Back can return to it after a jump. */
  const pushHistory = useCallback((loc: BookLocation | null) => {
    if (!loc) return;
    const stack = historyRef.current;
    const last = stack[stack.length - 1];
    if (last && last.spineIndex === loc.spineIndex &&
        last.blockIndex === loc.blockIndex && last.offset === loc.offset) {
      return; // same page — don't grow the stack
    }
    historyRef.current = [...stack, loc].slice(-50);
  }, []);

  /** Jump from a user action, remembering the page they came from. */
  const navigateTo = useCallback((loc: BookLocation | null) => {
    if (!loc) return;
    pushHistory(location);
    gotoLocation(loc);
  }, [pushHistory, gotoLocation, location]);

  // Load the bookshelf on mount — books are opened explicitly, not auto-resumed.
  useEffect(() => {
    (async () => {
      await epub.refreshBooks();
      setInitialized(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Chapter label for the header: nearest preceding TOC entry.
  const chapterLabel = useMemo(() => {
    if (!epub.markers || !location) return null;
    return markerForLocation(epub.markers, location)?.node.label ?? null;
  }, [epub.markers, location]);

  // Canonical href of the current spine item — base for in-content links.
  const currentSpineHref = useMemo(() => {
    if (!epub.book || !location) return undefined;
    return epub.book.spine[location.spineIndex]?.href;
  }, [epub.book, location]);

  // Prev/next chapter over the flattened TOC (markers in document order).
  const chapterNav = useMemo(() => {
    if (!epub.markers || !location) return { prev: null as TocMarker | null, next: null as TocMarker | null };
    const idx = epub.markers.findIndex(m => {
      const a = m.location;
      const b = location;
      return a.spineIndex === b.spineIndex && a.blockIndex === b.blockIndex && a.offset === b.offset;
    });
    if (idx === -1) {
      const current = markerForLocation(epub.markers, location);
      const ci = current ? epub.markers.indexOf(current) : -1;
      return {
        prev: ci > 0 ? epub.markers[ci - 1] ?? null : null,
        next: ci >= 0 && ci < epub.markers.length - 1 ? epub.markers[ci + 1] ?? null : null,
      };
    }
    return {
      prev: idx > 0 ? epub.markers[idx - 1] ?? null : null,
      next: idx < epub.markers.length - 1 ? epub.markers[idx + 1] ?? null : null,
    };
  }, [epub.markers, location]);

  // Open a stored book; returns the location to resume at.
  const handleOpenBook = useCallback(async (id: string) => {
    // Ref guard (not just state) so rapid double-clicks can't open the same
    // book twice — two EpubBook instances would race and the paginator would
    // drop one fetch, leaving the spinner up forever.
    if (openingIdRef.current !== null) return;
    openingIdRef.current = id;
    setOpeningId(id);
    try {
      const start = await epub.openBook(id);
      pendingStartRef.current = start;
      // Resume is applied reactively: immediately when there is no cover,
      // or on cover tap otherwise.
    } finally {
      openingIdRef.current = null;
      setOpeningId(null);
    }
  }, [epub]);

  // Resume once the book is open (no cover) or the cover has been dismissed.
  useEffect(() => {
    // The effect must also re-run when opening finishes: pendingStartRef is
    // only set after openBook resolves (past the last coverTapped change),
    // so without openingId in the deps the jump never fires for cover-less
    // books and the reader stays blank.
    if (openingId !== null) return;
    if (epub.coverTapped && pendingStartRef.current && !location) {
      gotoLocation(pendingStartRef.current);
    }
  }, [epub.coverTapped, location, gotoLocation, openingId]);

  // Cover tap → enter the reader at the resume location.
  const handleCoverTap = useCallback(() => {
    epub.dismissCover();
    gotoLocation(pendingStartRef.current);
  }, [epub, gotoLocation]);

  // TOC entry click → resolve + jump.
  const handleLoadChapter = useCallback((href: string) => {
    setMobileSidebarOpen(false);
    log(`[LP Web] EPUB TOC chapter click: href="${href}"`);
    pushHistory(location);
    void epub.resolveHref(href).then(gotoLocation);
  }, [epub, gotoLocation, pushHistory, location]);

  // Search result → jump to its location.
  const handleSearchNavigate = useCallback((result: EpubSearchResult) => {
    navigateTo(result.location);
  }, [navigateTo]);

  // Internal / external links from the dictionary popup.
  const handleOpenLink = useCallback((href: string) => {
    if (/^https?:\/\//i.test(href)) {
      router.push(`/${l1.code}/${l2.code}/web-reader?url=${encodeURIComponent(href)}`);
      return;
    }
    if (!href || href === '#') return;
    log(`[LP Web] EPUB internal link click: href="${href}" (from "${currentSpineHref}")`);
    pushHistory(location);
    void epub.resolveHref(href, currentSpineHref).then(gotoLocation);
  }, [router, l1.code, l2.code, epub, currentSpineHref, gotoLocation, pushHistory, location]);

  // File upload(s) — add to the shelf without opening.
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

  // Close the book and return to the bookshelf (the handle is kept).
  const handleClose = useCallback(async () => {
    await epub.close();
    setLocation(null);
    pendingStartRef.current = null;
    historyRef.current = [];
  }, [epub]);

  // Back: undo the last in-book jump (e.g. a footnote link); when there is
  // nothing to return to, close the book and go back to the bookshelf.
  const handleBack = useCallback(() => {
    const prev = historyRef.current.pop();
    if (prev) {
      gotoLocation(prev);
    } else {
      void handleClose();
    }
  }, [gotoLocation, handleClose]);

  // Remove a book from the shelf.
  const handleRemoveBook = useCallback(async (id: string) => {
    await epub.removeBook(id);
  }, [epub]);

  // Page turns keep header + sidebar in sync and persist the position.
  const handleLocationChange = useCallback((loc: BookLocation) => {
    setLocation(loc);
    void epub.saveLocation(loc);
  }, [epub]);

  const ctx: Partial<SavedWordContext> = {
    textTitle: chapterLabel || epub.fileName || 'EPUB Reader',
  };

  // Loading state while restoring from storage.
  if (!initialized) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  const readerActive = epub.openBookId !== null && epub.coverTapped && epub.book && location;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 h-[calc(100vh-57px)] flex flex-col overflow-hidden">
      {/* ── Title bar ── */}
      <div className="mb-4 flex items-center gap-3 flex-shrink-0">
        {epub.openBookId ? (
          <button
            onClick={handleBack}
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
            {chapterLabel || epub.fileName || t('title.epub_reader')}
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
            <EpubBookshelf
              books={epub.books}
              l2Code={l2.code}
              onOpenBook={handleOpenBook}
              onRemoveBook={handleRemoveBook}
              onFilesProcessed={handleFilesProcessed}
              openingId={openingId}
              error={epub.error ? t(epub.error) : null}
            />
          ) : openingId ? (
            <div className="flex min-h-[40vh] items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !epub.coverTapped && epub.coverUrl && epub.book ? (
            /* ── Cover ── */
            <div className="flex items-center justify-center min-h-[60vh]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={epub.coverUrl}
                alt={t('label.cover')}
                className="max-h-[70vh] max-w-full cursor-pointer rounded-lg shadow-xl transition-transform hover:scale-[1.02]"
                onClick={handleCoverTap}
              />
            </div>
          ) : epub.book && !location ? (
            /* Book open but the resume jump hasn't landed yet — never a
               blank page. */
            <div className="flex min-h-[40vh] items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : epub.book && location ? (
            /* ── Reader ── */
            <EpubReaderPanel
              key={epub.openBookId}
              book={epub.book}
              location={location}
              jumpNonce={jumpNonce}
              l2={l2} l1={l1}
              ctx={ctx}
              chapterLabel={chapterLabel}
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
              onLocationChange={handleLocationChange}
              onOpenLink={handleOpenLink}
            />
          ) : epub.error ? (
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
            title={t('title.epub_reader')}
            desktopClassName="w-64 ml-3"
            headerActions={
              <>
                <button
                  onClick={() => navigateTo(chapterNav.prev?.location ?? null)}
                  disabled={!chapterNav.prev || !readerActive}
                  className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 transition-colors"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  {t('action.previous_chapter')}
                </button>
                <button
                  onClick={() => navigateTo(chapterNav.next?.location ?? null)}
                  disabled={!chapterNav.next || !readerActive}
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
                  {(epub.markers?.length ?? epub.toc.length)} {t('msg.chapters')}
                </p>
              </div>
            }
          >
            <Tabs defaultValue="chapters" className="flex h-full min-h-0 flex-col gap-2">
              <TabsList className="mx-2 mt-2 grid w-[calc(100%-1rem)] grid-cols-2">
                <TabsTrigger value="chapters">{t('title.chapters')}</TabsTrigger>
                <TabsTrigger value="search">{t('action.search')}</TabsTrigger>
              </TabsList>
              <TabsContent value="chapters" className="min-h-0 flex-1 overflow-y-auto">
                <EpubChapterSidebar
                  toc={epub.toc}
                  markers={epub.markers}
                  activeLocation={location}
                  onLoadChapter={handleLoadChapter}
                />
              </TabsContent>
              <TabsContent value="search" className="min-h-0 flex-1 overflow-y-auto">
                <EpubSearchPanel
                  onSearch={epub.searchBook}
                  onNavigate={handleSearchNavigate}
                />
              </TabsContent>
            </Tabs>
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
