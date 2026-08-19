'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LemmatizedToken, SavedWordContext } from '@langplayer/shared';
import { isPhoneticsEligible } from '@langplayer/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTextScale } from '@/hooks/use-text-scale';
import { useSettingsContext } from '@/providers/settings-provider';
import { TokenizedText } from '@/components/tokenized-text';
import { TextActionMenu } from '@/components/text-action-menu';
import { translationFontSizeRem } from '@/lib/reader-text-size';
import {
  blockTag,
  blockClass,
  translationClass,
} from '@/components/reader/shared-reader-styles';
import {
  PaginatedReader,
  type BlockRenderCtx,
  type ReaderPageItem,
} from '@/components/reader/paginated-reader';
import { SentenceHighlightBlock } from '@/components/reader/sentence-highlight';
import type { EpubBook } from '@/lib/epub-book';
import type { BookLocation } from '@/lib/epub-book-types';
import type { EpubSearchMatch } from '@/hooks/use-epub';

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
/**
 * Open an internal link (resolved by the page against the current spine item).
 */
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
  const { display, getL2, tokenizedText, updateDisplay } = useSettingsContext();
  const showTranslation = display.translation;
  // User's text-size setting (Settings → Display → Text Size) as a CSS zoom
  // factor. Applied to blocks so headings keep their relative sizes.
  const textZoom = useTextScale();
  // Ruby/furigana/pinyin estimate for pagination: when phonetics are shown
  // above words, every annotated line is taller than the raw text line.
  const phonetics = getL2(l2.code).tokenSpan.phonetics;
  const phoneticsEstimate = isPhoneticsEligible(l2.code) && phonetics.show === 'ruby'
    ? (phonetics.conditions === 'always' ? 'measure-ruby-all' : 'measure-ruby-hard')
    : '';
  // Re-measure page breaks whenever a display setting that changes rendered
  // block heights changes (text scale, translation column, ruby estimate).
  const persistedSplit = display.translationSplit;
  // Splitter live state — the row re-splits immediately while dragging (no
  // persistence, no re-pagination); the final ratio is committed on release.
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

  const measureNonce = `${textZoom}:${showTranslation ? 1 : 0}:${phoneticsEstimate}:${persistedSplit}:${tokenizedText.translationSize}`;

  // Paging away from the highlighted search result dismisses the highlight.
  // The shared reader reports every visible-page start change through
  // onLocationChange — page turns and jumps alike. A jump lands ON the
  // highlighted block (the window starts there), so only dismiss when the new
  // page start has clearly moved past the highlighted block (or into another
  // spine); otherwise the search jump would clear its own highlight.
  const handleLocationChange = useCallback((loc: { blockIndex: number } | BookLocation) => {
    if (highlight) {
      const next = loc as BookLocation;
      const pagedPast =
        next.spineIndex !== highlight.spineIndex ||
        next.blockIndex > highlight.blockIndex;
      if (pagedPast) onHighlightDismiss?.();
    }
    onLocationChange(loc as BookLocation);
  }, [highlight, onHighlightDismiss, onLocationChange]);

  // EPUB links navigate inside the book (spine / #fragment) rather than to a
  // URL — the one exception to the shared web-reader link behavior. Any link
  // markdown block renders an anchor that calls onOpenLink, and tokenized
  // blocks surface it through TokenizedText's onOpenLink.
  const markdownComponents = useMemo(() => ({
    a: ({ href, children, ...props }: any) => {
      if (!href || href === '#') return <span {...props}>{children}</span>;
      return (
        <a
          href={href}
          onClick={(e) => {
            e.preventDefault();
            onOpenLink(href);
          }}
          {...props}
        >
          {children}
        </a>
      );
    },
  }), [onOpenLink]);

  const renderBlock = useCallback((item: ReaderPageItem, rctx: BlockRenderCtx) => {
    if (item.kind === 'markdown') {
      return (
        <div key={item.key}>
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {item.block.raw}
          </ReactMarkdown>
        </div>
      );
    }
    const tb = item.block;
    const bookLoc = item.loc as BookLocation;
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
      <SentenceHighlightBlock key={item.key} text={tb.text} translation={showTranslation ? rctx.translation : null}>
        {({ map, activeSentence, onTokenHover }) => (
          <TextActionMenu text={tb.text} l2Code={l2.code} l1Code={l1.code}
            translationAligned={showTranslation && rctx.translation ? {
              text: rctx.translation,
              map,
              active: activeSentence,
              measureNonce,
            } : null}
            translationClass={translationClass(tb)}
            translationFontSize={translationFontSizeRem(tb, textZoom, tokenizedText.translationSize)}
            translationSplit={appliedSplit}
            onTranslationSplitChange={onTranslationSplitChange}
            onTranslationSplitCommit={onTranslationSplitCommit}
            sideBySideBreakpoint="md"
            loading={showTranslation && !rctx.translation}>
            <Tag
              className={blockClass(tb)}
              style={tb.type === 'heading' ? { zoom: textZoom } : undefined}
            >
              <TokenizedText text={tb.text} l2Code={l2.code}
                inheritSize={tb.type === 'heading'} context={ctx}
                tokens={rctx.tokens} formats={formats} href={href} onOpenLink={onOpenLink} selectionDictionary
                onTokenHover={onTokenHover} />
            </Tag>
          </TextActionMenu>
        )}
      </SentenceHighlightBlock>
    );
  }, [highlight, showTranslation, textZoom, l2.code, l1.code, ctx, onOpenLink, markdownComponents, measureNonce, appliedSplit, onTranslationSplitChange, onTranslationSplitCommit]);

  /** Mirror of the visible rendering for the measuring container — one root
   *  element per block. Mirrors the shared web-reader measurement (dual-column
   *  text/translation layout, ruby line-height estimates, markdown rich blocks). */
  const renderMeasureBlock = useCallback((item: ReaderPageItem) => {
    if (item.kind === 'markdown') {
      return (
        <div key={item.key} className="mb-4">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {item.block.raw}
          </ReactMarkdown>
          {showTranslation && <div className="h-6" />}
        </div>
      );
    }
    const tb = item.block;
    const Tag = blockTag(tb);
    const lines = Math.max(1, Math.ceil(tb.text.length / 50));
    return (
      <div key={item.key} className="mb-4 flex items-start gap-3">
        <div className="flex-1 min-w-0 flex flex-col gap-y-2 md:flex-row md:gap-4 md:items-center">
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
              className={`flex-[2] min-w-0 pt-1 md:pt-0 ${translationClass(tb)}`}
              style={{ fontSize: `${translationFontSizeRem(tb, textZoom, tokenizedText.translationSize)}rem` }}
            >
              <div className="flex flex-col gap-y-1.5">
                {Array.from({ length: lines }).map((_, li) => (
                  <div key={li} style={{ height: `${translationFontSizeRem(tb, textZoom, tokenizedText.translationSize)}rem` }} />
                ))}
              </div>
            </div>
          )}
        </div>
        {/* Mirrors the action-menu button column's minimum height. */}
        <div className="mt-1 h-6 w-6 shrink-0" />
      </div>
    );
  }, [phoneticsEstimate, showTranslation, textZoom, markdownComponents, tokenizedText.translationSize]);

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
        [&_h4]:text-base [&_h4]:font-semibold [&_h4]:mt-0 [&_h4]:mb-0
        [&_p]:mb-0 [&_p]:leading-relaxed [&_p]:indent-[1em]
        [&_ul]:list-disc [&_ul]:ml-6 [&_ul]:mb-0
        [&_ol]:list-decimal [&_ol]:ml-6 [&_ol]:mb-0
        [&_li]:mb-0 [&_li]:leading-relaxed
        [&_blockquote]:border-l-4 [&_blockquote]:border-muted [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground [&_blockquote]:mb-0
        [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-lg [&_img]:my-4
        [&_a]:text-primary [&_a]:underline [&_a]:hover:no-underline
        [&_table]:w-full [&_table]:border-collapse [&_table]:mb-4
        [&_th]:border [&_th]:border-border [&_th]:px-3 [&_th]:py-1 [&_th]:text-left
        [&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-1
        [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-sm [&_code]:font-mono
        [&_pre]:bg-muted [&_pre]:p-4 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre]:mb-0
        [&_hr]:border-border [&_hr]:my-6"
      measureClassName="px-1 [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mt-0 [&_h1]:mb-0
        [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-0 [&_h2]:mb-0
        [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-0 [&_h3]:mb-0
        [&_h4]:text-base [&_h4]:font-semibold [&_h4]:mt-0 [&_h4]:mb-0
        [&_p]:mb-0 [&_p]:leading-relaxed [&_p]:indent-[1em]
        [&_ul]:list-disc [&_ul]:ml-6 [&_ul]:mb-0
        [&_ol]:list-decimal [&_ol]:ml-6 [&_ol]:mb-0
        [&_li]:mb-0 [&_li]:leading-relaxed
        [&_blockquote]:border-l-4 [&_blockquote]:border-muted [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground [&_blockquote]:mb-0
        [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-lg [&_img]:my-4
        [&_a]:text-primary [&_a]:underline [&_a]:hover:no-underline
        [&_table]:w-full [&_table]:border-collapse [&_table]:mb-4
        [&_th]:border [&_th]:border-border [&_th]:px-3 [&_th]:py-1 [&_th]:text-left
        [&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-1
        [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-sm [&_code]:font-mono
        [&_pre]:bg-muted [&_pre]:p-4 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre]:mb-0
        [&_hr]:border-border [&_hr]:my-6
        [&_.measure-ruby-all]:leading-[2.25] [&_.measure-ruby-hard]:leading-[2]"
      renderBlock={renderBlock}
      renderMeasureBlock={renderMeasureBlock}
    />
  );
}
