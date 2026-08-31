'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/providers/language-provider';
import { useT } from '@/hooks/use-t';
import type { SavedWordContext } from '@langplayer/shared';
import { PYTHON_API_URL } from '@/lib/api-url';
import { translateTextsKeyed } from '@/lib/translate';
import { EpubReaderPanel } from '@/components/reader/epub-reader-panel';
import { PdfReaderPanel } from '@/components/reader/pdf-reader-panel';
import { EpubBookshelf } from '@/components/reader/epub-bookshelf';
import { EpubImportDialog } from '@/components/reader/epub-import-dialog';
import { EpubChapterSidebar } from '@/components/reader/epub-chapter-sidebar';
import { EpubSearchPanel } from '@/components/reader/epub-search-panel';
import { normalizeLanguageCode } from '@/lib/epub-book';
import { useEpub, markerForLocation } from '@/hooks/use-epub';
import type { BookLocation, TocMarker } from '@/lib/epub-book-types';
import type { EpubFileError, EpubUploadResult } from '@/components/reader/epub-upload';
import type { EpubSearchMatch, EpubSearchResult } from '@/hooks/use-epub';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useSettingsContext } from '@/providers/settings-provider';
import { CONTENT_CONTAINER_WIDTH, READER_DEFAULT_LEADING, readerLeadingPx } from '@/lib/reader-layout';
import { Header } from '@/components/layout/header';
import { ReaderChromeProvider, useReaderChrome } from '@/providers/reader-chrome-provider';
import {
  ArrowLeft, BookOpen, ChevronLeft, ChevronRight, Loader2, PanelTopOpen, X,
} from 'lucide-react';
import { epubLog } from '@/lib/epub-log';
import { isReaderTapSuppressed, suppressReaderTap } from '@/lib/reader-tap-guard';

/** Height of the app header (h-14 content + border-b) — the reader's top
 *  chrome bar. */
const HEADER_HEIGHT = 57;
/** Height of the reader's bottom pagination bar (py-2 + 24px button row +
 *  1px border). */
const BOTTOM_BAR_HEIGHT = 41;
/** Top reserved strip: header + 8 clearance + 16 title line + 8 breathing
 *  room (SPEC-085 §6.2) — the dropped-down header never obscures the muted
 *  chapter title (title line top = HEADER_HEIGHT + 12). */
const TOP_CHROME_RESERVE = HEADER_HEIGHT + 32; // 89
/** Bottom reserved strip: bar + 8 clearance + 16 counter line + 8 breathing
 *  room (SPEC-085 §6.2) — the bottom bar never covers the muted page counter
 *  (counter line bottom = BOTTOM_BAR_HEIGHT + 8 above the screen bottom). */
const BOTTOM_CHROME_RESERVE = BOTTOM_BAR_HEIGHT + 32; // 73

/** Vision-OCR prompt for the EPUB + PDF readers — the model returns the
 *  image's text as clean markdown (deepseek-v4-flash-vision-exp via /vision). */
export default function EpubPage() {
  const { l1, l2 } = useLanguage();
  const t = useT();
  const router = useRouter();
  const epub = useEpub();
  const { setImmersed, registerCloseReader } = useReaderChrome();
  const { tokenizedText } = useSettingsContext();

  // Track the viewport width so the chromeless buttons' right edge follows the
  // reader content column on resize / rotation (see `closeRightMargin`).
  const [windowWidth, setWindowWidth] = useState<number | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const update = () => setWindowWidth(window.innerWidth);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Right-edge alignment for the chromeless "show toolbars" / "close" buttons:
  // the reader's text column is clamped to CONTENT_CONTAINER_WIDTH and centred
  // with leading margins on both sides, and the per-block action-menu trigger
  // (⋮) sits at the content column's right edge. The close button's right edge
  // must line up with it, so its offset from the screen's right edge equals
  // max(leading, (windowWidth − CONTENT_CONTAINER_WIDTH) / 2) — the leading
  // margin on narrow screens, the centred container margin on wide ones.
  const closeRightMargin = useMemo(() => {
    const leadingPx = readerLeadingPx(
      tokenizedText.zoom,
      tokenizedText.leading ?? READER_DEFAULT_LEADING,
    );
    const width = windowWidth ?? (typeof window !== 'undefined' ? window.innerWidth : 0);
    return Math.max(leadingPx, (width - CONTENT_CONTAINER_WIDTH) / 2);
  }, [tokenizedText.zoom, tokenizedText.leading, windowWidth]);

  const [initialized, setInitialized] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const openingIdRef = useRef<string | null>(null);
  const [importFailures, setImportFailures] = useState<EpubFileError[]>([]);
  const [location, setLocation] = useState<BookLocation | null>(null);
  /** Active search-match highlight (block + char range), if any. */
  const [highlight, setHighlight] = useState<EpubSearchMatch | null>(null);
  const [jumpNonce, setJumpNonce] = useState(0);
  const pendingStartRef = useRef<BookLocation | null>(null);
  /** Locations to return to via Back — pushed on in-book jumps (TOC clicks,
   *  search results, internal links), never on plain page turns. */
  const historyRef = useRef<BookLocation[]>([]);
  /** Immersive reader chrome: hidden by default, toggled by tapping blank space. */
  const [chromeVisible, setChromeVisible] = useState(false);
  /** TOC and Search are modals now (the sidebar is gone). */
  const [tocOpen, setTocOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  /** Jump the reader to a location (TOC, search, links, restore). */
  const gotoLocation = useCallback((loc: BookLocation | null) => {
    if (!loc) return;
    epubLog(`gotoLocation spine=${loc.spineIndex} block=${loc.blockIndex} offset=${loc.offset}`);
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

  // Load the bookshelf on mount and auto-open the last-read book in the
  // current L2 (books are tagged with the L2 they were uploaded under — same
  // filter the bookshelf uses) instead of landing on the shelf. Opens
  // straight to the content (skipCover), like a bookshelf card tap; the shelf
  // only appears when no book matches the current L2.
  useEffect(() => {
    (async () => {
      const list = await epub.refreshBooks();
      const l2Primary = normalizeLanguageCode(l2.code);
      const last = [...list]
        .sort((a, b) => (b.lastReadAt ?? 0) - (a.lastReadAt ?? 0))
        .find((b) => !b.language || normalizeLanguageCode(b.language) === l2Primary);
      if (last) {
        await handleOpenBook(last.id);
      }
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
      // Bookshelf clicks go straight to the content — skip the cover tap.
      const start = await epub.openBook(id, { skipCover: true });
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

  // TOC entry click → resolve + jump (closes the TOC modal).
  const handleLoadChapter = useCallback((href: string) => {
    setTocOpen(false);
    setHighlight(null);
    epubLog(`TOC chapter click: href="${href}"`);
    pushHistory(location);
    void epub.resolveHref(href).then(gotoLocation);
  }, [epub, gotoLocation, pushHistory, location]);

  // Search result → jump to its location and close the search modal.
  const handleSearchNavigate = useCallback((result: EpubSearchResult) => {
    setSearchOpen(false);
    navigateTo(result.location);
    if (result.match) {
      setHighlight({
        spineIndex: result.location.spineIndex,
        blockIndex: result.location.blockIndex,
        ...result.match,
      });
    }
  }, [navigateTo]);

  // Internal / external links from the dictionary popup.
  const handleOpenLink = useCallback((href: string) => {
    if (/^https?:\/\//i.test(href)) {
      router.push(`/${l1.code}/${l2.code}/web-reader?url=${encodeURIComponent(href)}`);
      return;
    }
    if (!href || href === '#') return;
    setHighlight(null);
    epubLog(`internal link click: href="${href}" (from "${currentSpineHref}")`);
    pushHistory(location);
    void epub.resolveHref(href, currentSpineHref).then(gotoLocation);
  }, [router, l1.code, l2.code, epub, currentSpineHref, gotoLocation, pushHistory, location]);

  // File upload(s) — add to the shelf without opening.
  const handleFilesProcessed = useCallback(async ({ files, failures }: EpubUploadResult) => {
    const failed: EpubFileError[] = [...failures];
    for (const file of files) {
      const added = await epub.addBook(file.data, file.fileName, l2.code);
      if (!added) {
        failed.push({ fileName: file.fileName, fileSize: file.fileSize, reasonKey: 'msg.epub_parse_error' });
      }
    }
    epub.clearError();
    setImportFailures(failed);
  }, [epub, l2.code]);

  // Close the book and return to the bookshelf (the handle is kept).
  const handleClose = useCallback(async () => {
    setChromeVisible(false);
    setTocOpen(false);
    setSearchOpen(false);
    await epub.close();
    setLocation(null);
    pendingStartRef.current = null;
    historyRef.current = [];
  }, [epub]);

  // Close the book and return to the bookshelf (the handle is kept).
  const handleCloseReader = useCallback(() => {
    void handleClose();
  }, [handleClose]);

  // Keep the current close handler in a ref so the registration effect below
  // can run once. `handleClose` is recreated on every render (it closes over
  // the `useEpub` object, which is returned fresh each render), so depending
  // on it in the effect would re-run it every render and re-register a fresh
  // handler each time. The registered wrapper always calls the latest handler
  // through the ref.
  const closeReaderRef = useRef<() => void>(() => {});
  useEffect(() => {
    closeReaderRef.current = () => { void handleClose(); };
  });

  // Register the book's close handler so the nav menu's "Epub Reader" item can
  // close it (an alternative to the close button) when the reader is already
  // open — the Header calls requestCloseReader on a same-route nav click.
  useEffect(() => {
    registerCloseReader(() => closeReaderRef.current());
    return () => registerCloseReader(null);
  }, [registerCloseReader]);

  // Back: undo the last in-book jump (e.g. a footnote link); when there is
  // nothing to return to, close the book and go back to the bookshelf.
  const handleBack = useCallback(() => {
    const prev = historyRef.current.pop();
    if (prev) {
      setHighlight(null);
      gotoLocation(prev);
    } else {
      void handleClose();
    }
  }, [gotoLocation, handleClose]);

  // Remove a book from the shelf.
  const handleRemoveBook = useCallback(async (id: string) => {
    await epub.removeBook(id);
  }, [epub]);

  // Page turns keep the position in sync and persist it.
  const handleLocationChange = useCallback((loc: BookLocation) => {
    setLocation(loc);
    void epub.saveLocation(loc);
  }, [epub]);

  // Blank-space tap in the reader toggles the immersive chrome.
  const toggleChrome = useCallback(() => setChromeVisible(v => !v), []);

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
    try {
      const { byKey } = await translateTextsKeyed(texts, l1.code, l2.code);
      return byKey;
    } catch {
      return {};
    }
  }, [l1.code, l2.code]);

  const ctx: Partial<SavedWordContext> = {
    textTitle: chapterLabel || epub.fileName || 'EPUB Reader',
  };

  // The book reader is active (book open, cover dismissed, content located).
  const readerActive =
    epub.openBookId !== null && epub.coverTapped && !!epub.book && !!location;
  // PDF reader active — a format: 'pdf' entry opened (thumbnails grid + AI
  // page conversion). Keeps the regular app chrome (non-immersive).
  const pdfActive = !!epub.pdfDoc;

  // Immerse while the book reader is open — the global app header hides so the
  // book fills the screen; the reader renders its own chrome as overlays.
  useEffect(() => {
    setImmersed(readerActive);
    return () => setImmersed(false);
  }, [readerActive, setImmersed]);

  // Reset the overlay chrome whenever the reader is not active.
  useEffect(() => {
    if (!readerActive) {
      setChromeVisible(false);
      setTocOpen(false);
      setSearchOpen(false);
    }
  }, [readerActive]);

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

  return (
    // The opened book fills the entire viewport (h-screen): the top/bottom
    // chrome strips are reserved as padding inside the reader, so the page
    // area is exactly screen height − top margin − bottom margin and the
    // paginator measures against the true remaining height.
    <div
      className={`relative flex flex-col overflow-hidden ${
        readerActive
          ? 'h-screen w-full'
          : 'mx-auto max-w-7xl px-4 py-6 h-[calc(100vh-57px)]'
      }`}
      onClick={readerActive ? (event) => {
        // Quitting a dialog must never toggle the chrome: the click that
        // dismisses a Radix dialog can fall through to the reader surface
        // after the overlay unmounts (reader-tap-guard).
        if (isReaderTapSuppressed()) return;
        if (window.getSelection()?.toString()) return;
        const target = event.target as HTMLElement | null;
        if (target?.closest?.('a, button, input, textarea, select, [contenteditable="true"]')) return;
        toggleChrome();
      } : undefined}
    >
      {readerActive ? (
        /* ── Immersive book reader ── */
        <>
          {/* Top chrome: the app header (logo, cloud, search…) — hidden by
              default, glides down when the chrome is shown. */}
          <div
            className={`absolute inset-x-0 top-0 z-30 transition-transform duration-300 ${
              chromeVisible ? 'translate-y-0' : '-translate-y-full'
            }`}
            style={{ pointerEvents: chromeVisible ? 'auto' : 'none' }}
          >
            <ReaderChromeProvider immersed={false}>
              <Header />
            </ReaderChromeProvider>
          </div>

          {/* Chromeless controls: when the chrome is hidden, two standard
              shadcn buttons sit top right, vertically aligned with the chapter
              title (top = HEADER_HEIGHT + 8, the title line box) — "show
              toolbars" reveals the chrome and "close" leaves the reader.
              Text labels show on portrait iPads and wider (≥768px); below
              that they collapse to icons. The close button's right edge lines
              up with the per-block action-menu trigger (⋮) in the text below
              (SPEC-085 §17.2 horizontal geometry). Chrome-visible mode
              deliberately has NO close button (the escape hatches are the
              chromeless close and the nav menu). */}
          {!chromeVisible && (
            <div
              className="absolute z-40 flex items-center gap-2"
              style={{ top: HEADER_HEIGHT + 8, right: closeRightMargin }}
            >
              <Button
                variant="outline"
                size="sm"
                onClick={toggleChrome}
                aria-label={t('action.show_toolbars')}
                title={t('action.show_toolbars')}
              >
                <PanelTopOpen className="h-3.5 w-3.5" />
                <span className="hidden md:inline">{t('action.show_toolbars')}</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCloseReader}
                aria-label={t('action.close')}
                title={t('action.close')}
              >
                <X className="h-3.5 w-3.5" />
                <span className="hidden md:inline">{t('action.close')}</span>
              </Button>
            </div>
          )}

          {/* The reader — top/bottom strips are reserved for the chrome and
              the muted chapter title / page count, so toggling the chrome
              never reflows the book. */}
          <div className="flex min-h-0 flex-1 flex-col">
            <EpubReaderPanel
              key={epub.openBookId}
              book={epub.book!}
              location={location!}
              jumpNonce={jumpNonce}
              l2={l2} l1={l1}
              ctx={ctx}
              highlight={highlight}
              onHighlightDismiss={() => setHighlight(null)}
              onLemmatize={handleLemmatize}
              onPageTranslate={handlePageTranslate}
              onLocationChange={handleLocationChange}
              onOpenLink={handleOpenLink}
              immersive
              immersiveReserve={{ top: TOP_CHROME_RESERVE, bottom: BOTTOM_CHROME_RESERVE }}
              chromeVisible={chromeVisible}
              onOpenToc={epub.toc.length > 0 ? () => setTocOpen(true) : undefined}
              onOpenSearch={() => setSearchOpen(true)}
              topOverlay={
                <span className="max-w-[85%] truncate text-xs text-muted-foreground">
                  {chapterLabel || epub.fileName || t('title.epub_reader')}
                </span>
              }
              pageInfoOverlay={(page, total, isEstimate) => (
                <span className="text-xs text-muted-foreground">
                  {page}
                  {total > 0 ? ` / ${isEstimate ? '~' : ''}${total}` : ''}
                </span>
              )}
            />
          </div>
        </>
      ) : pdfActive ? (
        /* ── PDF reader — thumbnails grid + AI page conversion ── */
        <>
          <div className="flex min-h-0 flex-1 flex-col">
            <PdfReaderPanel
              data={epub.pdfDoc!.data}
              pageCount={epub.pdfDoc!.pageCount}
              outline={epub.pdfDoc!.outline}
              fileName={epub.fileName ?? 'book.pdf'}
              l1={l1}
              l2={l2}
              ctx={ctx}
              onLemmatize={handleLemmatize}
              onPageTranslate={handlePageTranslate}
              onClose={handleClose}
            />
          </div>
        </>
      ) : (
        /* ── Bookshelf / cover / error (regular app chrome) ── */
        <>
          {/* Title row — bookshelf header (the book reader itself has no
              title bar; its metadata lives in the reader overlays). */}
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
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
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

          {/* Import failure dialog */}
          <EpubImportDialog
            failures={importFailures}
            onClose={() => setImportFailures([])}
          />
        </>
      )}

      {/* ── TOC modal (replaces the sidebar) ── */}
      {epub.toc.length > 0 && (
        <Dialog open={tocOpen} onOpenChange={(o) => {
          if (!o) suppressReaderTap(); // the dismissing click must not toggle the chrome
          setTocOpen(o);
        }}>
          <DialogContent className="flex max-h-[80vh] flex-col sm:max-w-lg z-[70]" overlayClassName="z-[70]">
            <DialogHeader className="flex-row items-center justify-between pr-10">
              <DialogTitle>{t('title.chapters')}</DialogTitle>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => navigateTo(chapterNav.prev?.location ?? null)}
                  disabled={!chapterNav.prev}
                  className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 transition-colors"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  {t('action.previous_chapter')}
                </button>
                <button
                  onClick={() => navigateTo(chapterNav.next?.location ?? null)}
                  disabled={!chapterNav.next}
                  className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 transition-colors"
                >
                  {t('action.next_chapter')}
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </DialogHeader>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <EpubChapterSidebar
                toc={epub.toc}
                markers={epub.markers}
                activeLocation={location}
                onLoadChapter={handleLoadChapter}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Search modal (replaces the sidebar) ── */}
      {/* Fixed height, independent of the result count (SPEC-085 §9): the
          search bar stays pinned at the top and the results area reserves
          its space even when empty, so the bar sits well above the software
          keyboard. */}
      <Dialog open={searchOpen} onOpenChange={(o) => {
        if (!o) suppressReaderTap(); // the dismissing click must not toggle the chrome
        setSearchOpen(o);
      }}>
        <DialogContent className="flex h-[min(70vh,560px)] flex-col sm:max-w-lg z-[70]" overlayClassName="z-[70]">
          <DialogHeader>
            <DialogTitle>{t('action.search')}</DialogTitle>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col">
            <EpubSearchPanel
              onSearch={epub.searchBook}
              onNavigate={handleSearchNavigate}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
