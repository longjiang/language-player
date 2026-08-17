'use client';

import { useEffect, type ReactNode } from 'react';
import type { LemmatizedToken, SavedWordContext } from '@langplayer/shared';
import { useT } from '@/hooks/use-t';
import { useSettingsContext } from '@/providers/settings-provider';
import { TokenizedText } from '@/components/tokenized-text';
import { TextActionMenu } from '@/components/text-action-menu';
import { Switch } from '@/components/ui/switch';
import {
  usePaginatedReader,
  type BlockRenderCtx,
  type ReaderLoc,
  type ReaderPageItem,
} from '@/hooks/use-paginated-reader';
import type { ReaderBlock } from '@/lib/parse-markdown';
import type { EpubBook } from '@/lib/epub-book';
import type { BookLocation } from '@/lib/epub-book-types';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

export type { BlockRenderCtx, ReaderLoc, ReaderPageItem } from '@/hooks/use-paginated-reader';

/**
 * Strip markdown down to readable text for the not-yet-parsed fallback.
 * Protects image tags so the stripping regexes below can't mangle them:
 * `_(.+?)_` eats underscores inside image URLs and `\[..\]\(..\)` turns
 * `![alt](url)` into `!alt`. Placeholders are restored afterwards.
 */
function stripMarkdown(md: string): string {
  const images: string[] = [];
  const protectedMd = md.replace(/!\[[^\]]*\]\([^)]*\)/g, m => {
    images.push(m);
    return `\u0000LPIMG${images.length - 1}\u0000`;
  });
  const out = protectedMd
    .replace(/#{1,6}\s/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1')
    .replace(/\*(.+?)\*/g, '$1').replace(/_(.+?)_/g, '$1')
    .replace(/```[\s\S]*?```/g, '').replace(/`(.+?)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/>\s/g, '')
    .replace(/[-*+]\s/g, '').replace(/\d+\.\s/g, '')
    .replace(/\n{3,}/g, '\n\n').trim();
  const restored = out.replace(/\u0000LPIMG(\d+)\u0000/g, (_, idx: string) => images[Number(idx)] ?? '');
  return restored;
}

/**
 * One shared paginated reader panel for all web readers (notes, web reader,
 * EPUB). Owns the pagination via `usePaginatedReader`: the scroll viewport,
 * the hidden measuring mirror (one element per block — the hook reads its
 * children as block metrics), the page-nav bar with translation toggle, and
 * keyboard paging. Each reader injects its own block rendering through
 * `renderBlock` / `renderMeasureBlock`.
 *
 * This is the shared panel SPEC-077 plans; when the CSS-columns pager lands,
 * only the hook's internals change.
 */
export interface PaginatedReaderProps {
  /** Markdown stream (notes / web reader). Mutually exclusive with `book`. */
  blocks?: ReaderBlock[] | null;
  /** Whole-book stream (EPUB). Mutually exclusive with `blocks`. */
  book?: EpubBook | null;
  /** Desired reading location (EPUB restore / TOC / search / links). */
  location?: BookLocation | null;
  /** Increment to re-apply `location` after a jump. */
  jumpNonce?: number;
  /** Called whenever the visible page's start changes. */
  onLocationChange?: (loc: ReaderLoc) => void;
  onLemmatize: (texts: string[]) => Promise<LemmatizedToken[][]>;
  onPageTranslate: (texts: string[]) => Promise<Record<string, string>>;
  /** Layout identity — re-measure when it changes (zoom, translation, ruby…). */
  measureNonce?: string | number;
  /** Chrome (nav bar, padding) subtracted from the viewport height. */
  chromeHeight?: number;
  l1: { code: string };
  l2: { code: string; direction?: string };
  /** Word-save context for TokenizedText (only used by the fallback render). */
  ctx: Partial<SavedWordContext>;
  /** Markdown source — only used to render the pre-parse fallback. */
  text?: string;
  /** Rendered above the page content (e.g. the "tap any word" hint). */
  header?: ReactNode;
  /** Applied to the visible content column (block typography overrides). */
  contentClassName?: string;
  /** Applied to the hidden measuring mirror; defaults to `contentClassName`. */
  measureClassName?: string;
  /** Render one visible block (reader-specific types/styles). */
  renderBlock: (item: ReaderPageItem, ctx: BlockRenderCtx) => ReactNode;
  /** Render one mirror block — must be ONE root element per block, and must
   *  match the visible rendering's layout-affecting markup (spacing,
   *  translation skeleton, ruby line-height estimates, zoom). */
  renderMeasureBlock: (item: ReaderPageItem, index: number) => ReactNode;
}

export function PaginatedReader({
  blocks,
  book,
  location,
  jumpNonce,
  onLocationChange,
  onLemmatize,
  onPageTranslate,
  measureNonce,
  chromeHeight,
  l1,
  l2,
  ctx,
  text,
  header,
  contentClassName = '',
  measureClassName,
  renderBlock,
  renderMeasureBlock,
}: PaginatedReaderProps) {
  const t = useT();
  const { display, updateDisplay } = useSettingsContext();
  const showTranslation = display.translation;

  const pager = usePaginatedReader({
    blocks,
    book,
    location,
    jumpNonce,
    onLocationChange,
    onLemmatize,
    onPageTranslate,
    showTranslation,
    measureNonce,
    chromeHeight,
  });

  // Keyboard paging (arrows, PageUp/Down, space) — never while typing in an
  // input/textarea/select/contenteditable (e.g. the sidebar search box).
  const { prevPage, nextPage } = pager;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') prevPage();
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        nextPage();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prevPage, nextPage]);

  // Pre-parse fallback: raw text, stripped of markdown (parse failure or the
  // frame before blocks arrive).
  const showFallback = !blocks && !!text && !book;

  const dir = l2.direction === 'rtl' ? 'rtl' : 'ltr';

  return (
    <div className="relative min-w-0 flex-1 flex flex-col min-h-0 overflow-hidden">
      <div ref={pager.viewportRef} className="min-h-0 flex-1 overflow-auto">
        <div className={contentClassName} lang={l2.code} dir={dir}>
          {pager.pageBlocks.length > 0 && header}
          {showFallback ? (
            <TextActionMenu text={stripMarkdown(text!)} l2Code={l2.code} l1Code={l1.code}>
              <TokenizedText text={stripMarkdown(text!)} l2Code={l2.code} textScale={1} context={ctx} selectionDictionary />
            </TextActionMenu>
          ) : pager.measuring && pager.pageBlocks.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            pager.pageBlocks.map((item) =>
              renderBlock(item, {
                tokens: pager.tokenCache[item.key],
                translation: showTranslation ? pager.blockTranslations[item.key] : undefined,
                isTranslating: pager.isTranslating && !pager.blockTranslations[item.key],
              }),
            )
          )}
        </div>
      </div>

      {/* Page navigation + translation */}
      <div className="flex-shrink-0 flex items-center justify-center gap-3 border-t border-border py-2 text-xs text-muted-foreground">
        <button onClick={pager.prevPage} disabled={!pager.hasPrev || pager.measuring}
          className="rounded p-1 hover:bg-muted disabled:opacity-30">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span>
          {pager.page}
          {pager.totalPages > 0 ? ` / ${pager.totalPagesIsEstimate ? '~' : ''}${pager.totalPages}` : ''}
        </span>
        <button onClick={pager.nextPage} disabled={!pager.hasNext || pager.measuring}
          className="rounded p-1 hover:bg-muted disabled:opacity-30">
          <ChevronRight className="h-4 w-4" />
        </button>
        <span className="mx-2 text-muted-foreground/30">|</span>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <span className="text-xs">{t('action.translation')}</span>
          <Switch
            checked={showTranslation}
            onCheckedChange={(checked) => updateDisplay({ translation: checked })}
            className="shrink-0"
          />
        </label>
      </div>

      {/* Hidden measuring mirror — mirrors the current window exactly,
          including per-block spacing, the translation column (when on) and
          the text-zoom + ruby/furigana height estimates. Each block must be
          ONE direct child of measureRef: the paginator reads
          measureRef.children as one element per block to compute page breaks
          (one wrapper around all blocks would measure a single child →
          1-block pages). */}
      <div
        ref={pager.measureRef}
        aria-hidden="true"
        className={`absolute inset-x-0 top-0 -z-10 overflow-hidden opacity-0 pointer-events-none ${measureClassName ?? contentClassName}`}
        lang={l2.code} dir={dir}
      >
        {pager.measureWindow.map((item, i) => renderMeasureBlock(item, i))}
      </div>
    </div>
  );
}
