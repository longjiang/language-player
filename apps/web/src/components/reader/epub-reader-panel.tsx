'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LemmatizedToken, SavedWordContext } from '@langplayer/shared';
import { useTextScale } from '@/hooks/use-text-scale';
import { useSettingsContext } from '@/providers/settings-provider';
import { TokenizedText } from '@/components/tokenized-text';
import { TextActionMenu } from '@/components/text-action-menu';
import {
  PaginatedReader,
  useReaderLayoutIdentity,
  type BlockRenderContext,
  type HighlightRange,
} from '@/components/reader/paginated-reader';
import { EpubBlockStream } from '@/lib/block-stream';
import type { ReaderLocation } from '@/lib/block-stream';
import type { EpubBook } from '@/lib/epub-book';
import type { BookLocation, EpubBlock, EpubTextBlock } from '@/lib/epub-book-types';
import type { EpubSearchMatch } from '@/hooks/use-epub';

function blockTag(tb: EpubTextBlock): keyof React.JSX.IntrinsicElements {
  switch (tb.type) {
    case 'heading': return `h${tb.depth ?? 1}` as keyof React.JSX.IntrinsicElements;
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
      // Headings never split and stay with the following block (no dangling
      // heading at a page bottom) — the body paragraphs around them split.
      return `${base} ${sizes[tb.depth ?? 1] ?? 'text-base font-medium'} mt-4 break-inside-avoid break-after-avoid`;
    }
    case 'list-item': return `${base} ml-4 list-disc whitespace-pre-line`;
    case 'blockquote': return `${base} border-l-4 border-muted pl-4 italic text-muted-foreground whitespace-pre-line`;
    case 'pre': return `${base} whitespace-pre-wrap bg-muted p-4 rounded-lg overflow-x-auto overflow-y-auto break-inside-avoid max-h-full`;
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
  const { display, updateDisplay } = useSettingsContext();
  const showTranslation = display.translation;
  // User's text-size setting (Settings → Display → Text Size) as a CSS zoom
  // factor. Applied to every block so headings keep their relative sizes.
  const textZoom = useTextScale();
  // Re-paginate whenever a text setting that changes rendered metrics changes
  // (zoom, translation column, ruby/furigana, interlinear definitions, …).
  const layoutIdentity = useReaderLayoutIdentity(l2.code);

  // The whole book as one block stream (rebuilt per book instance).
  const stream = useMemo(() => new EpubBlockStream(book, book.title), [book]);

  // BookLocations (restore / TOC / search / links) convert to stream indices
  // only after the stream's spine map is warm — do that here, then hand the
  // converted jump target to the shared panel.
  const [readerLocation, setReaderLocation] = useState<ReaderLocation | null>(null);
  const [readerHighlight, setReaderHighlight] = useState<HighlightRange | null>(null);
  const lastJumpKeyRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void stream.warm(0, stream.blockCount).then(() => {
      if (cancelled) return;
      if (location) {
        const jumpKey = `${jumpNonce}:${location.spineIndex}:${location.blockIndex}:${location.offset}`;
        if (lastJumpKeyRef.current !== jumpKey) {
          lastJumpKeyRef.current = jumpKey;
          setReaderLocation({
            streamIndex: stream.bookLocationToStreamIndex(location),
            offset: 0,
          });
        }
      }
      setReaderHighlight(prev => {
        const next = highlight
          ? {
              streamIndex: stream.bookLocationToStreamIndex({
                spineIndex: highlight.spineIndex,
                blockIndex: highlight.blockIndex,
                offset: 0,
              }),
              start: highlight.start,
              end: highlight.end,
            }
          : null;
        if (next && prev && next.streamIndex === prev.streamIndex && next.start === prev.start && next.end === prev.end) {
          return prev;
        }
        return next;
      });
    });
    return () => { cancelled = true; };
  }, [location, jumpNonce, highlight, stream]);

  // Persisted positions come back as BookLocations.
  const handleReaderLocationChange = useCallback((loc: ReaderLocation) => {
    onLocationChange(stream.bookLocationAt(loc.streamIndex));
  }, [stream, onLocationChange]);

  const renderBlock = useCallback((block: EpubBlock, streamIndex: number, rctx: BlockRenderContext) => {
    if (block.kind === 'image') {
      // Images are atomic; max-h-full caps them at the page height so they
      // scale down instead of overflowing the column.
      // eslint-disable-next-line @next/next/no-img-element
      return <img key={streamIndex} src={block.imageUri}
        alt={block.alt ?? ''} loading="lazy" className="max-w-full h-auto max-h-full rounded-lg my-4 break-inside-avoid-column" />;
    }
    const tb = block as EpubTextBlock;
    const Tag = blockTag(tb);
    const href = tb.formats.find(f => f.type === 'link')?.url;
    // Append the search-match highlight range when this block contains it.
    let formats = tb.formats;
    if (rctx.highlight) {
      const start = Math.max(0, Math.min(rctx.highlight.start, tb.text.length));
      const end = Math.max(start, Math.min(rctx.highlight.end, tb.text.length));
      if (end > start) formats = [...tb.formats, { start, end, type: 'highlight' as const }];
    }
    return (
      <TextActionMenu key={streamIndex} text={tb.text} l2Code={l2.code} l1Code={l1.code}
        readerVariant
        translation={showTranslation ? rctx.translation : undefined}
        translationClass={translationClass(tb)}
        translationZoom={textZoom}
        loading={rctx.translating}>
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
  }, [showTranslation, textZoom, l2.code, l1.code, ctx, onOpenLink]);

  return (
    <PaginatedReader
      stream={stream}
      location={readerLocation}
      locationNonce={jumpNonce}
      layoutIdentity={layoutIdentity}
      rtl={book.pageProgressionDir === 'rtl'}
      lang={l2.code}
      dir={l2.direction === 'rtl' ? 'rtl' : 'ltr'}
      renderBlock={renderBlock}
      onLemmatize={onLemmatize}
      onPageTranslate={onPageTranslate}
      onLocationChange={handleReaderLocationChange}
      highlight={readerHighlight}
      onHighlightDismiss={onHighlightDismiss}
      showTranslation={showTranslation}
      onToggleTranslation={(checked) => updateDisplay({ translation: checked })}
    />
  );
}
