'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useT } from '@/hooks/use-t';
import { useTextScale } from '@/hooks/use-text-scale';
import { useSettingsContext } from '@/providers/settings-provider';
import { PaginatedReader, type BlockRenderCtx, type ReaderPageItem } from '@/components/reader/paginated-reader';
import { parseMarkdown, type ReaderBlock, type TextBlock } from '@/lib/parse-markdown';
import { renderPdfPage, pdfPageToMarkdown, type PdfOutlineItem } from '@/lib/pdf-book';
import { blockClass, blockTag, translationClass } from '@/components/reader/shared-reader-styles';
import { ReaderTextBlock, ReaderMarkdownBlock } from '@/components/reader/reader-block';
import { translationFontSizeRem } from '@/lib/reader-text-size';
import { READER_DEFAULT_LEADING, readerLeadingPx } from '@/lib/reader-layout';
import { Sidebar } from '@/components/ui/sidebar';
import { ZoomableImage } from '@/components/reader/zoomable-image';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { LemmatizedToken, SavedWordContext } from '@langplayer/shared';
import { PanelRight, PanelRightClose, X, Loader2 } from 'lucide-react';
import { log } from '@/lib/logger';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Web PDF reader (format: 'pdf' bookshelf entries):
 *  - import → first page rendered as the shelf cover (done in useEpub.addBook);
 *  - open → auto-opens page 1 in the paginated reader (converted via Vision)
 *    with a collapsible right **thumbnails sidebar** (standard Sidebar);
 *  - the sidebar lists every page, outlines the current page, tapping a
 *    different page opens it, tapping the current page opens a full-size
 *    preview modal (zoomable, like the image reader);
 *  - the bottom bar's Thumbnails button toggles the sidebar.
 */
const SIDEBAR_QUERY = '(min-width: 1024px)';

export function PdfReaderPanel({
  data,
  pageCount,
  outline,
  fileName,
  l1,
  l2,
  ctx,
  onLemmatize,
  onPageTranslate,
  onClose,
}: {
  data: ArrayBuffer;
  pageCount: number;
  outline: PdfOutlineItem[];
  fileName: string;
  l1: { code: string; name: string };
  l2: { code: string; name: string; direction?: string };
  ctx: Partial<SavedWordContext>;
  onLemmatize: (texts: string[]) => Promise<LemmatizedToken[][]>;
  onPageTranslate: (texts: string[]) => Promise<Record<string, string>>;
  onClose: () => void;
}) {
  const t = useT();
  const { display, tokenizedText, updateDisplay } = useSettingsContext();
  const showTranslation = display.translation;
  const textZoom = useTextScale();
  const readerLeading = readerLeadingPx(tokenizedText.zoom, tokenizedText.leading ?? READER_DEFAULT_LEADING);

  // Translation splitter — same live-split/persist pattern as the other
  // readers (epub-reader-panel, reader-panel). The PDF reader now shares the
  // aligned block renderer, so it gets the draggable splitter as well.
  const persistedSplit = display.translationSplit;
  const [liveSplit, setLiveSplit] = useState(persistedSplit);
  const appliedSplit = liveSplit;
  const onTranslationSplitChange = useCallback((r: number) => setLiveSplit(r), []);
  const onTranslationSplitCommit = useCallback((r: number) => {
    setLiveSplit(r);
    updateDisplay({ translationSplit: r });
  }, [updateDisplay]);
  useEffect(() => {
    setLiveSplit((prev) => (Math.abs(prev - persistedSplit) < 0.001 ? prev : persistedSplit));
  }, [persistedSplit]);

  const measureNonce = `${textZoom}:${showTranslation ? 1 : 0}:${persistedSplit}:${tokenizedText.translationSize}`;

  /** page number (1-based) → rendered thumbnail data URL. */
  const [thumbs, setThumbs] = useState<Record<number, string>>({});
  const [rendering, setRendering] = useState<Set<number>>(new Set());
  const renderingRef = useRef<Set<number>>(new Set());
  /** The sidebar thumbnail column — IntersectionObserver root children. */
  const thumbGridRef = useRef<HTMLDivElement>(null);
  /** Reading session: the page being read + its AI-converted markdown. */
  const [currentPage, setCurrentPage] = useState<number | null>(null);
  const [converting, setConverting] = useState(false);
  const [converted, setConverted] = useState<{ md: string; blocks: ReaderBlock[] } | null>(null);
  const [tocOpen, setTocOpen] = useState(false);

  // Standard right-side sidebar: persistent collapsible panel on desktop,
  // slide-in sheet on mobile (same behavior as the image reader / notes sidebar).
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  /** Page whose full-size preview modal is open (the current page). */
  const [previewPage, setPreviewPage] = useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const renderThumb = useCallback(async (page: number) => {
    if (thumbs[page] || renderingRef.current.has(page)) return;
    renderingRef.current.add(page);
    setRendering((prev) => new Set(prev).add(page));
    try {
      const url = await renderPdfPage(data, page, 0.5);
      setThumbs((prev) => (prev[page] ? prev : { ...prev, [page]: url }));
    } catch (err) {
      log('[LP Web] pdf thumbnail render failed', { page, error: (err as Error)?.message ?? err });
    } finally {
      renderingRef.current.delete(page);
      setRendering((prev) => {
        const next = new Set(prev);
        next.delete(page);
        return next;
      });
    }
  }, [data, thumbs]);

  // Pre-render the first few thumbnails so the sidebar isn't empty on open.
  useEffect(() => {
    for (let i = 1; i <= Math.min(pageCount, 8); i++) void renderThumb(i);
  }, [renderThumb, pageCount]);

  // Lazily render thumbnails as they scroll into the sidebar. The pre-render
  // above only covers the first few pages, so without this any page beyond
  // that never gets its thumbnail rendered (page numbers would show forever).
  useEffect(() => {
    const grid = thumbGridRef.current;
    if (!grid) return;
    const scrollRoot = grid.parentElement;
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const page = Number((entry.target as HTMLElement).dataset.page);
        if (page) void renderThumb(page);
      }
    }, { root: scrollRoot, rootMargin: '200px 0px' });
    Array.from(grid.children).forEach((child) => io.observe(child));
    return () => io.disconnect();
  }, [renderThumb, pageCount]);

  /** Tap a thumbnail: convert the page to markdown via Vision, read it. */
  const openPage = useCallback(async (page: number) => {
    setCurrentPage(page);
    setConverting(true);
    setConverted(null);
    log('[LP Web] pdf page → vision OCR', { page });
    try {
      const img = await renderPdfPage(data, page, 1.5);
      const md = await pdfPageToMarkdown(img);
      setConverted({ md, blocks: md ? parseMarkdown(md) : [] });
    } catch (err) {
      log('[LP Web] pdf page conversion failed', { page, error: (err as Error)?.message ?? err });
      setConverted({ md: '', blocks: [] });
    } finally {
      setConverting(false);
    }
  }, [data]);

  // Auto-open page 1 when the reader mounts (replaces the old thumbnails grid).
  const didAutoOpenRef = useRef(false);
  useEffect(() => {
    if (didAutoOpenRef.current) return;
    didAutoOpenRef.current = true;
    void openPage(1);
  }, [openPage]);

  /** Toggle the sidebar: collapse the desktop panel / open the mobile sheet. */
  const toggleSidebar = useCallback(() => {
    if (window.matchMedia(SIDEBAR_QUERY).matches) {
      setSidebarOpen((open) => !open);
    } else {
      setMobileSidebarOpen(true);
    }
  }, []);

  // Render the full-size page image for the preview modal on demand.
  useEffect(() => {
    if (previewPage === null) {
      setPreviewUrl(null);
      return;
    }
    let cancelled = false;
    void renderPdfPage(data, previewPage, 1.5).then((url) => {
      if (!cancelled) setPreviewUrl(url);
    });
    return () => { cancelled = true; };
  }, [previewPage, data]);

  /** Flatten the nested outline for the TOC dialog (page-jump list). */
  const flatOutline = useMemo(() => {
    const out: { title: string; page: number; depth: number }[] = [];
    const walk = (items: PdfOutlineItem[], depth: number) => {
      for (const item of items) {
        out.push({ title: item.title, page: item.page, depth });
        if (item.children) walk(item.children, depth + 1);
      }
    };
    walk(outline, 0);
    return out;
  }, [outline]);

  /** Block rendering for converted PDF page markdown — the SAME aligned,
   *  sentence-highlighted renderer as the EPUB reader (baseline-aligned
   *  translation, draggable splitter), via the shared ReaderTextBlock /
   *  ReaderMarkdownBlock. Only markdown link/image handling is generic here. */
  const renderBlock = useCallback((item: ReaderPageItem, rctx: BlockRenderCtx) => {
    if (item.kind === 'markdown') {
      return <ReaderMarkdownBlock key={item.key} raw={item.block.raw} />;
    }
    const tb = item.block as TextBlock;
    const href = tb.formats.find(f => f.type === 'link')?.url;
    return (
      <ReaderTextBlock
        key={item.key}
        block={tb}
        rctx={rctx}
        ctx={ctx}
        href={href}
        measureNonce={measureNonce}
        translationSplit={appliedSplit}
        onTranslationSplitChange={onTranslationSplitChange}
        onTranslationSplitCommit={onTranslationSplitCommit}
        sideBySideGapPx={readerLeading}
        l2Code={l2.code}
        l1Code={l1.code}
      />
    );
  }, [ctx, measureNonce, appliedSplit, onTranslationSplitChange, onTranslationSplitCommit, readerLeading, l2.code, l1.code]);

  /** Mirror block for measurement — the aligned dual-column layout matching
   *  ReaderTextBlock's visible rendering (3:2 split, reader-leading gap,
   *  translation column, heading zoom). */
  const renderMeasureBlock = useCallback((item: ReaderPageItem, index: number) => {
    if (item.kind === 'markdown') {
      return (
        <div key={`m-${index}`} className="mb-4">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.block.raw}</ReactMarkdown>
          {showTranslation && <div className="h-6" />}
        </div>
      );
    }
    const tb = item.block as TextBlock;
    const Tag = blockTag(tb);
    const lines = Math.max(1, Math.ceil(tb.text.length / 50));
    const trFontSize = translationFontSizeRem(tb, textZoom, tokenizedText.translationSize);
    return (
      <div key={`m-${index}`} className="mb-4 flex items-start gap-3">
        <div
          className="flex-1 min-w-0 flex flex-col gap-y-2 md:flex-row md:gap-[var(--reader-side-gap)] md:items-center"
          style={{ '--reader-side-gap': `${readerLeading}px` } as CSSProperties}
        >
          <div className="flex-[3] min-w-0">
            <Tag className={blockClass(tb)} style={{ zoom: textZoom }}>{tb.text}</Tag>
          </div>
          {showTranslation && (
            <div className={`flex-[2] min-w-0 pt-1 md:pt-0 ${translationClass(tb)}`} style={{ fontSize: `${trFontSize}rem` }}>
              <div className="flex flex-col gap-y-1.5">
                {Array.from({ length: lines }).map((_, li) => (
                  <div key={li} style={{ height: `${trFontSize}rem` }} />
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="mt-1 h-6 w-6 shrink-0" />
      </div>
    );
  }, [showTranslation, textZoom, readerLeading, tokenizedText.translationSize]);

  /** A single page thumbnail tile in the sidebar (current page outlined). */
  const renderSidebarPage = useCallback((page: number) => (
    <div
      key={page}
      role="button"
      tabIndex={0}
      onClick={() => {
        // Clicking the current page opens its full-size preview; clicking a
        // different page reads it.
        if (page === currentPage) setPreviewPage(page);
        else void openPage(page);
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        if (page === currentPage) setPreviewPage(page);
        else void openPage(page);
      }}
      className={`group relative aspect-[3/4] w-full cursor-pointer overflow-hidden rounded-lg border-2 transition-colors ${
        page === currentPage ? 'border-primary' : 'border-border hover:border-muted-foreground/50'
      }`}
      aria-label={t('msg.pdf_page', { page: String(page) })}
      data-page={page}
    >
      {thumbs[page] ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumbs[page]}
          alt=""
          className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <span className="text-xs text-muted-foreground">{page}</span>
        </div>
      )}
      {page === currentPage && <div className="absolute inset-0 ring-2 ring-inset ring-primary" />}
      {rendering.has(page) && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/40">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  ), [currentPage, openPage, rendering, thumbs, t]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header: title + sidebar toggle + close */}
      <div className="mb-3 flex items-center gap-3 flex-shrink-0">
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          {fileName} — {t('msg.pdf_page', { page: String(currentPage ?? 1) })}
        </h2>
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
          onClick={() => setSidebarOpen((o) => !o)}
          className="hidden lg:flex flex-shrink-0 rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title={sidebarOpen ? t('action.collapse_sidebar') : t('action.expand_sidebar')}
        >
          {sidebarOpen ? <PanelRightClose className="h-5 w-5" /> : <PanelRight className="h-5 w-5" />}
        </button>
        {/* Close — returns to the bookshelf */}
        <button
          onClick={onClose}
          aria-label={t('action.close')}
          title={t('action.close')}
          className="flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background/90 text-muted-foreground shadow-sm transition-colors hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Content row: main read view + right thumbnails sidebar */}
      <div className="flex min-h-0 flex-1 gap-4">
        <div className="flex min-h-0 flex-1 flex-col">
          {converting ? (
            <div className="flex min-h-[40vh] flex-1 items-center justify-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{t('msg.making_words_interactive')}</span>
            </div>
          ) : (
            <PaginatedReader
              blocks={converted?.blocks ?? []}
              text={converted?.md}
              l1={l1}
              l2={l2}
              ctx={ctx}
              onLemmatize={onLemmatize}
              onPageTranslate={onPageTranslate}
              measureNonce={measureNonce}
              onOpenToc={flatOutline.length > 0 ? () => setTocOpen(true) : undefined}
              onOpenThumbnails={toggleSidebar}
              contentClassName="[&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mt-0 [&_h1]:mb-0
                [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-0 [&_h2]:mb-0
                [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-0 [&_h3]:mb-0
                [&_p]:mb-0 [&_p]:leading-relaxed
                [&_ul]:list-disc [&_ul]:ml-6 [&_ul]:mb-0
                [&_ol]:list-decimal [&_ol]:ml-6 [&_ol]:mb-0
                [&_li]:mb-0 [&_li]:leading-relaxed
                [&_blockquote]:border-l-4 [&_blockquote]:border-muted [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground [&_blockquote]:mb-0
                [&_img]:max-w-full [&_img]:max-h-[var(--reader-page-height)] [&_img]:w-auto [&_img]:h-auto [&_img]:object-contain [&_img]:rounded-lg [&_img]:my-4
                [&_a]:text-primary [&_a]:underline [&_a]:hover:no-underline
                [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-sm [&_code]:font-mono
                [&_pre]:bg-muted [&_pre]:p-4 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre]:mb-0"
              renderBlock={renderBlock}
              renderMeasureBlock={renderMeasureBlock}
            />
          )}
        </div>

        {/* Thumbnails sidebar — right, collapsible (standard Sidebar). */}
        <Sidebar
          open={mobileSidebarOpen}
          onOpenChange={setMobileSidebarOpen}
          sidebarOpen={sidebarOpen}
          title={t('action.thumbnails')}
          desktopClassName="w-60 ml-3"
          bodyClassName="p-4"
        >
          <div ref={thumbGridRef} className="flex flex-col items-center gap-3">
            {Array.from({ length: pageCount }, (_, i) => i + 1).map(renderSidebarPage)}
          </div>
        </Sidebar>
      </div>

      {/* TOC dialog — the PDF outline */}
      <Dialog open={tocOpen} onOpenChange={setTocOpen}>
        <DialogContent className="flex max-h-[80vh] flex-col sm:max-w-md z-[70]" overlayClassName="z-[70]">
          <DialogHeader>
            <DialogTitle>{t('title.chapters')}</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ul className="space-y-0.5">
              {flatOutline.map((item, i) => (
                <li key={i} style={{ paddingLeft: 8 + item.depth * 14 }}>
                  <button
                    onClick={() => {
                      setTocOpen(false);
                      void openPage(item.page);
                    }}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-muted"
                  >
                    <span className="min-w-0 flex-1 truncate">{item.title}</span>
                    <span className="text-xs text-muted-foreground">{item.page}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </DialogContent>
      </Dialog>

      {/* Full-size page preview — click to zoom in/out, Ctrl+wheel/pinch to zoom. */}
      <Dialog
        open={previewPage !== null}
        onOpenChange={(o) => { if (!o) setPreviewPage(null); }}
      >
        <DialogContent className="p-0 sm:max-w-4xl" overlayClassName="z-[70]">
          <div className="h-[75vh] w-full">
            {previewUrl && (
              <ZoomableImage src={previewUrl} alt={t('msg.pdf_page', { page: String(previewPage) })} />
            )}
          </div>
          <DialogTitle className="sr-only">
            {t('msg.pdf_page', { page: String(previewPage) })}
          </DialogTitle>
        </DialogContent>
      </Dialog>
    </div>
  );
}
