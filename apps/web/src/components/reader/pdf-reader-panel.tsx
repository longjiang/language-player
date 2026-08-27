'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '@/hooks/use-t';
import { useSettingsContext } from '@/providers/settings-provider';
import { PaginatedReader, type BlockRenderCtx, type ReaderPageItem } from '@/components/reader/paginated-reader';
import { parseMarkdown, type ReaderBlock } from '@/lib/parse-markdown';
import { renderPdfPage, pdfPageToMarkdown, type PdfOutlineItem } from '@/lib/pdf-book';
import { blockClass, blockTag } from '@/components/reader/shared-reader-styles';
import { TokenizedText } from '@/components/tokenized-text';
import { TextActionMenu } from '@/components/text-action-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { LemmatizedToken, SavedWordContext } from '@langplayer/shared';
import { normalizeVisionMarkdown } from '@langplayer/shared';
import { ArrowLeft, LayoutGrid, List, Loader2 } from 'lucide-react';
import { log } from '@/lib/logger';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Web PDF reader (format: 'pdf' bookshelf entries):
 *  - import → first page rendered as the shelf cover (done in useEpub.addBook);
 *  - open → a grid of page thumbnails (lazy-rendered via pdf.js);
 *  - tap a page → the page image is converted to markdown by DeepSeek Vision
 *    (POST /vision, cached) and loaded into the shared paginated reader;
 *  - the bottom bar carries a TOC button (the PDF outline) and a Thumbnails
 *    button (back to the grid).
 */
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
  const { display } = useSettingsContext();
  const showTranslation = display.translation;

  /** page number (1-based) → rendered thumbnail data URL. */
  const [thumbs, setThumbs] = useState<Record<number, string>>({});
  const [rendering, setRendering] = useState<Set<number>>(new Set());
  const renderingRef = useRef<Set<number>>(new Set());
  /** Reading session: the page being read + its AI-converted markdown. */
  const [currentPage, setCurrentPage] = useState<number | null>(null);
  const [converting, setConverting] = useState(false);
  const [converted, setConverted] = useState<{ md: string; blocks: ReaderBlock[] } | null>(null);
  const [tocOpen, setTocOpen] = useState(false);

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

  // Pre-render the first few thumbnails so the grid isn't empty on open.
  useEffect(() => {
    for (let i = 1; i <= Math.min(pageCount, 8); i++) void renderThumb(i);
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
      const normalized = normalizeVisionMarkdown(md);
      setConverted({ md: normalized, blocks: normalized ? parseMarkdown(normalized) : [] });
    } catch (err) {
      log('[LP Web] pdf page conversion failed', { page, error: (err as Error)?.message ?? err });
      setConverted({ md: '', blocks: [] });
    } finally {
      setConverting(false);
    }
  }, [data]);

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

  const handleThumbnails = useCallback(() => {
    setCurrentPage(null);
    setConverted(null);
  }, []);

  /** Block rendering for converted PDF page markdown — a compact version of
   *  the epub reader's block renderer (no sentence-highlight wiring). */
  const renderPdfBlock = useCallback((item: ReaderPageItem, rctx: BlockRenderCtx) => {
    if (item.kind === 'markdown') {
      return (
        <div key={item.key}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.block.raw}</ReactMarkdown>
        </div>
      );
    }
    const tb = item.block;
    const Tag = blockTag(tb);
    return (
      <TextActionMenu
        key={item.key}
        text={tb.text}
        l2Code={l2.code}
        l1Code={l1.code}
        translation={rctx.translation}
      >
        <Tag className={blockClass(tb)}>
          <TokenizedText
            text={tb.text}
            l2Code={l2.code}
            inheritSize={tb.type === 'heading'}
            tokens={rctx.tokens}
            selectionDictionary
          />
        </Tag>
      </TextActionMenu>
    );
  }, [l1.code, l2.code]);

  /** Mirror block for measurement — must match renderPdfBlock's layout. */
  const renderPdfMeasureBlock = useCallback((item: ReaderPageItem, index: number) => {
    if (item.kind === 'markdown') {
      return (
        <div key={`m-${index}`} className="mb-4">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.block.raw}</ReactMarkdown>
        </div>
      );
    }
    const tb = item.block;
    const Tag = blockTag(tb);
    return (
      <div key={`m-${index}`} className="mb-4 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <Tag className={blockClass(tb)}>{tb.text}</Tag>
        </div>
        <div className="mt-1 h-6 w-6 shrink-0" />
      </div>
    );
  }, []);

  // ── Reading view (a converted page in the paginated reader) ──
  if (currentPage !== null) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mb-3 flex items-center gap-3 flex-shrink-0">
          <button
            onClick={handleThumbnails}
            aria-label={t('action.thumbnails')}
            title={t('action.thumbnails')}
            className="flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background/90 text-muted-foreground shadow-sm transition-colors hover:text-foreground"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </button>
          <h2 className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
            {fileName} — {t('msg.pdf_page', { page: String(currentPage) })}
          </h2>
          <button
            onClick={onClose}
            aria-label={t('action.close')}
            title={t('action.close')}
            className="flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background/90 text-muted-foreground shadow-sm transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
        </div>

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
            onOpenToc={flatOutline.length > 0 ? () => setTocOpen(true) : undefined}
            onOpenThumbnails={handleThumbnails}
            contentClassName="[&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mt-0 [&_h1]:mb-0
              [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-0 [&_h2]:mb-0
              [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-0 [&_h3]:mb-0
              [&_p]:mb-0 [&_p]:leading-relaxed
              [&_ul]:list-disc [&_ul]:ml-6 [&_ul]:mb-0
              [&_ol]:list-decimal [&_ol]:ml-6 [&_ol]:mb-0
              [&_li]:mb-0 [&_li]:leading-relaxed
              [&_blockquote]:border-l-4 [&_blockquote]:border-muted [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground [&_blockquote]:mb-0
              [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-lg [&_img]:my-4
              [&_a]:text-primary [&_a]:underline [&_a]:hover:no-underline
              [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-sm [&_code]:font-mono
              [&_pre]:bg-muted [&_pre]:p-4 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre]:mb-0"
            renderBlock={renderPdfBlock}
            renderMeasureBlock={renderPdfMeasureBlock}
          />
        )}

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
      </div>
    );
  }

  // ── Thumbnails grid (the PDF's "open" state) ──
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto">
      <div className="flex items-center gap-3 flex-shrink-0">
        <button
          onClick={onClose}
          aria-label={t('action.back')}
          title={t('action.back')}
          className="flex-shrink-0 rounded-md p-1 text-foreground transition-colors hover:bg-muted"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h2 className="min-w-0 flex-1 truncate text-lg font-bold text-foreground">{fileName}</h2>
      </div>
      <p className="text-xs text-muted-foreground">{t('msg.pdf_tap_page_hint')}</p>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: pageCount }, (_, i) => i + 1).map((page) => (
          <button
            key={page}
            onClick={() => void openPage(page)}
            className="group flex cursor-pointer flex-col items-start gap-1.5 rounded-lg p-2 transition-colors hover:bg-muted/60"
            aria-label={t('msg.pdf_page', { page: String(page) })}
          >
            <div className="relative aspect-[3/4] w-full overflow-hidden rounded-md border border-border bg-muted">
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
              {rendering.has(page) && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/40">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>
            <span className="w-full text-center text-xs text-muted-foreground">{page}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
