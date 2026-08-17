'use client';

import { useCallback } from 'react';
import type { LemmatizedToken, SavedWordContext } from '@langplayer/shared';
import { isPhoneticsEligible } from '@langplayer/utils';
import { useTextScale } from '@/hooks/use-text-scale';
import { useSettingsContext } from '@/providers/settings-provider';
import { TokenizedText } from '@/components/tokenized-text';
import { TextActionMenu } from '@/components/text-action-menu';
import {
  PaginatedReader,
  type BlockRenderCtx,
  type ReaderPageItem,
} from '@/components/reader/paginated-reader';
import type { EpubBook } from '@/lib/epub-book';
import type { BookLocation, EpubTextBlock } from '@/lib/epub-book-types';
import type { EpubSearchMatch } from '@/hooks/use-epub';
import type { JSX } from 'react';

function blockTag(tb: EpubTextBlock): keyof JSX.IntrinsicElements {
  switch (tb.type) {
    case 'heading': return `h${tb.depth ?? 1}` as keyof JSX.IntrinsicElements;
    case 'list-item': return 'li';
    case 'blockquote': return 'blockquote';
    case 'pre': return 'pre';
    default: return 'p';
  }
}

function blockClass(tb: EpubTextBlock): string {
  const base = 'leading-relaxed';
  switch (tb.type) {
    case 'heading': {
      const sizes: Record<number, string> = {
        1: 'text-2xl font-bold', 2: 'text-xl font-semibold', 3: 'text-lg font-semibold',
      };
      return `${base} ${sizes[tb.depth ?? 1] ?? 'text-base font-medium'} mt-4`;
    }
    case 'list-item': return `${base} ml-4 list-disc whitespace-pre-line`;
    case 'blockquote': return `${base} border-l-4 border-muted pl-4 italic text-muted-foreground whitespace-pre-line`;
    case 'pre': return `${base} whitespace-pre-wrap bg-muted p-4 rounded-lg overflow-x-auto`;
    default: return `${base} whitespace-pre-line`;
  }
}

/** Muted variant for translation text below a block. */
function translationClass(tb: EpubTextBlock): string {
  const base = 'leading-relaxed';
  switch (tb.type) {
    case 'heading': return `${base} text-lg font-semibold`;
    case 'blockquote': return `${base} border-l-4 border-muted/40 pl-4 italic`;
    default: return `${base} text-sm`;
  }
}

interface EpubReaderPanelProps {
  book: EpubBook;
  /** Desired reading location (restore / TOC / search / link jumps). */
  location: BookLocation;
  /** Increment to re-apply `location` after a jump. */
  jumpNonce: number;
  l2: { code: string; name: string; direction?: string };
  l1: { code: string; name: string };
  ctx: Partial<SavedWordContext>;
  /** Active search-match highlight (block + char range), if any. */
  highlight?: EpubSearchMatch | null;
  /** Called when the user pages away from the highlighted block. */
  onHighlightDismiss?: () => void;
  onLemmatize: (texts: string[]) => Promise<LemmatizedToken[][]>;
  onPageTranslate: (texts: string[]) => Promise<Record<string, string>>;
  /** Called whenever the visible page changes (persists the position). */
  onLocationChange: (loc: BookLocation) => void;
  /** Open an internal link (resolved by the page against the current spine item). */
  onOpenLink: (href: string) => void;
}

export function EpubReaderPanel({
  book,
  location,
  jumpNonce,
  l2,
  l1,
  ctx,
  highlight,
  onHighlightDismiss,
  onLemmatize,
  onPageTranslate,
  onLocationChange,
  onOpenLink,
}: EpubReaderPanelProps) {
  const { display, getL2 } = useSettingsContext();
  const showTranslation = display.translation;
  // User's text-size setting (Settings → Display → Text Size) as a CSS zoom
  // factor. Applied to every block so headings keep their relative sizes.
  const textZoom = useTextScale();
  // Ruby/furigana/pinyin estimate for pagination: when phonetics are shown
  // above words, every annotated line is taller than the raw text line.
  const phonetics = getL2(l2.code).tokenSpan.phonetics;
  const phoneticsEstimate = isPhoneticsEligible(l2.code) && phonetics.show === 'ruby'
    ? (phonetics.conditions === 'always' ? 'measure-ruby-all' : 'measure-ruby-hard')
    : '';
  // Re-measure page breaks whenever a display setting that changes rendered
  // block heights changes (text scale, translation column, ruby estimate).
  const measureNonce = `${textZoom}:${showTranslation ? 1 : 0}:${phoneticsEstimate}`;

  // Paging away from the highlighted search result dismisses the highlight.
  // The shared reader reports every visible-page start change through
  // onLocationChange (page turns and jumps alike).
  const handleLocationChange = useCallback((loc: { blockIndex: number } | BookLocation) => {
    onHighlightDismiss?.();
    onLocationChange(loc as BookLocation);
  }, [onHighlightDismiss, onLocationChange]);

  const renderBlock = useCallback((item: ReaderPageItem, rctx: BlockRenderCtx) => {
    const { loc, block } = item;
    const bookLoc = loc as BookLocation;
    if (block.kind === 'image') {
      // eslint-disable-next-line @next/next/no-img-element
      return <img key={item.key} src={block.imageUri}
        alt={block.alt ?? ''} className="max-w-full h-auto rounded-lg my-4" />;
    }
    // Windowed (EPUB) mode only produces text/image items, so after the
    // image branch the block is always an EpubTextBlock.
    const tb = block as EpubTextBlock;
    const Tag = blockTag(tb);
    const href = tb.formats.find(f => f.type === 'link')?.url;
    // Append the search-match highlight range when this block contains it.
    let formats = tb.formats;
    if (
      highlight &&
      highlight.spineIndex === bookLoc.spineIndex &&
      highlight.blockIndex === bookLoc.blockIndex
    ) {
      const start = Math.max(0, Math.min(highlight.start, tb.text.length));
      const end = Math.max(start, Math.min(highlight.end, tb.text.length));
      if (end > start) formats = [...tb.formats, { start, end, type: 'highlight' as const }];
    }
    return (
      <TextActionMenu key={item.key} text={tb.text} l2Code={l2.code} l1Code={l1.code}
        translation={showTranslation ? rctx.translation : undefined}
        translationClass={translationClass(tb)}
        translationZoom={textZoom}
        loading={showTranslation && !rctx.translation}>
        <Tag
          className={blockClass(tb)}
          style={tb.type === 'heading' ? { zoom: textZoom } : undefined}
        >
          <TokenizedText text={tb.text} l2Code={l2.code}
            inheritSize={tb.type === 'heading'} context={ctx}
            tokens={rctx.tokens} formats={formats} href={href} onOpenLink={onOpenLink} selectionDictionary />
        </Tag>
      </TextActionMenu>
    );
  }, [highlight, showTranslation, textZoom, l2.code, l1.code, ctx, onOpenLink]);

  /** Mirror of the visible rendering for the measuring container — one root
   *  element per block. Mirrors the dual-column text/translation layout, the
   *  action-menu button column's minimum height, and the ruby/furigana
   *  line-height estimates. */
  const renderMeasureBlock = useCallback((item: ReaderPageItem) => {
    const { block } = item;
    if (block.kind === 'image') {
      // eslint-disable-next-line @next/next/no-img-element
      return <img key={item.key} src={block.imageUri} alt="" className="max-w-full h-auto rounded-lg my-4" />;
    }
    // Windowed (EPUB) mode only produces text/image items (see renderBlock).
    const tb = block as EpubTextBlock;
    const Tag = blockTag(tb);
    return (
      <div key={item.key} className="mb-4 flex items-start gap-3">
        <div className="flex-1 min-w-0 flex flex-col gap-y-1 lg:flex-row lg:gap-4 lg:items-center">
          <div className="flex-[3] min-w-0">
            <Tag
              className={`${blockClass(tb)}${phoneticsEstimate ? ` ${phoneticsEstimate}` : ''}`}
              style={{ zoom: textZoom }}
            >
              {tb.text}
            </Tag>
          </div>
          {showTranslation && (
            <div
              className={`flex-[2] min-w-0 pt-1 lg:pt-0 ${translationClass(tb)}`}
              style={{ zoom: textZoom }}
            >
              <div className="flex flex-col gap-y-1.5">
                {Array.from({ length: Math.max(1, Math.ceil(tb.text.length / 50)) }).map((_, li) => (
                  <div key={li} className="h-3.5" />
                ))}
              </div>
            </div>
          )}
        </div>
        {/* Mirrors the action-menu button column's minimum height. */}
        <div className="mt-1 h-6 w-6 shrink-0" />
      </div>
    );
  }, [phoneticsEstimate, showTranslation, textZoom]);

  return (
    <PaginatedReader
      book={book}
      location={location}
      jumpNonce={jumpNonce}
      l1={l1} l2={l2}
      ctx={ctx}
      measureNonce={measureNonce}
      chromeHeight={40}
      onLemmatize={onLemmatize}
      onPageTranslate={onPageTranslate}
      onLocationChange={handleLocationChange}
      contentClassName="px-1 [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mt-0 [&_h1]:mb-0
        [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-0 [&_h2]:mb-0
        [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-0 [&_h3]:mb-0
        [&_p]:mb-0 [&_p]:leading-relaxed
        [&_li]:mb-0 [&_li]:leading-relaxed
        [&_blockquote]:border-l-4 [&_blockquote]:border-muted [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground [&_blockquote]:mb-0
        [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-lg [&_img]:my-4
        [&_pre]:bg-muted [&_pre]:p-4 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre]:mb-0"
      measureClassName="px-1 [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mt-0 [&_h1]:mb-0
        [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-0 [&_h2]:mb-0
        [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-0 [&_h3]:mb-0
        [&_p]:mb-0 [&_p]:leading-relaxed
        [&_li]:mb-0 [&_li]:leading-relaxed
        [&_blockquote]:border-l-4 [&_blockquote]:border-muted [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground [&_blockquote]:mb-0
        [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-lg [&_img]:my-4
        [&_pre]:bg-muted [&_pre]:p-4 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre]:mb-0
        [&_.measure-ruby-all]:leading-[2.25] [&_.measure-ruby-hard]:leading-[2]"
      renderBlock={renderBlock}
      renderMeasureBlock={renderMeasureBlock}
    />
  );
}
