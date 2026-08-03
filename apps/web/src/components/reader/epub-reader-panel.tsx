'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { LemmatizedToken, SavedWordContext } from '@langplayer/shared';
import { md5 } from '@langplayer/utils';
import { useT } from '@/hooks/use-t';
import { useSettingsContext } from '@/providers/settings-provider';
import { TokenizedText } from '@/components/tokenized-text';
import { TextActionMenu } from '@/components/text-action-menu';
import { Switch } from '@/components/ui/switch';
import { usePaginatedBook, type PageBlock } from '@/hooks/use-paginated-book';
import type { EpubBook } from '@/lib/epub-book';
import type { BookLocation, EpubTextBlock } from '@/lib/epub-book-types';
import { ChevronLeft, ChevronRight, Loader2, Sparkles } from 'lucide-react';

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
    case 'list-item': return `${base} ml-4 list-disc`;
    case 'blockquote': return `${base} border-l-4 border-muted pl-4 italic text-muted-foreground`;
    case 'pre': return `${base} whitespace-pre-wrap bg-muted p-4 rounded-lg overflow-x-auto`;
    default: return base;
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
  /** Chapter label of the current page (for the header). */
  chapterLabel: string | null;
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
  chapterLabel,
  onLemmatize,
  onPageTranslate,
  onLocationChange,
  onOpenLink,
}: EpubReaderPanelProps) {
  const t = useT();
  const { display, updateDisplay } = useSettingsContext();
  const showTranslation = display.translation;

  const {
    viewportRef,
    measureRef,
    measureWindow,
    pageBlocks,
    measuring,
    pageNumber,
    totalPagesEstimate,
    pageStart,
    jumpTo,
    nextPage,
    prevPage,
    hasPrev,
    hasNext,
  } = usePaginatedBook(book, { chromeHeight: 40 });

  const [tokenCache, setTokenCache] = useState<Record<string, LemmatizedToken[]>>({});
  const [blockTranslations, setBlockTranslations] = useState<Record<string, string>>({});
  const [loadingTokens, setLoadingTokens] = useState(false);
  const tokenGenRef = useRef(0);

  // Apply external jumps (restore / TOC / search / links). Also re-applies
  // when the book instance changes: a re-open swaps the EpubBook and the
  // paginator reset invalidates any in-flight fetch, so the new book needs
  // its own jump (otherwise the window stays empty and the spinner never
  // clears).
  const lastNonceRef = useRef<number | null>(null);
  const lastJumpBookRef = useRef<EpubBook | null>(null);
  useEffect(() => {
    if (!location) return;
    if (lastNonceRef.current === jumpNonce && lastJumpBookRef.current === book) return;
    lastNonceRef.current = jumpNonce;
    lastJumpBookRef.current = book;
    jumpTo(location);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpNonce, book, location]);

  // Persist the current page start whenever it changes.
  const lastSavedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!pageStart) return;
    const key = `${pageStart.spineIndex}:${pageStart.blockIndex}:${pageStart.offset}`;
    if (lastSavedKeyRef.current === key) return;
    lastSavedKeyRef.current = key;
    onLocationChange(pageStart);
  }, [pageStart, onLocationChange]);

  // Per-page tokenization (lazy, keyed by spine:block).
  useEffect(() => {
    if (!pageBlocks.length) return;
    const gen = ++tokenGenRef.current;
    const textBlocks = pageBlocks
      .filter((p): p is PageBlock & { block: EpubTextBlock } => p.block.kind === 'text');
    const pending = textBlocks.filter(p => !tokenCache[`${p.loc.spineIndex}:${p.loc.blockIndex}`]);
    if (pending.length === 0) return;
    setLoadingTokens(true);
    void onLemmatize(pending.map(p => p.block.text)).then(results => {
      if (gen !== tokenGenRef.current) return;
      setTokenCache(prev => {
        const next = { ...prev };
        pending.forEach((p, i) => {
          next[`${p.loc.spineIndex}:${p.loc.blockIndex}`] = results[i] ?? [];
        });
        return next;
      });
    }).finally(() => {
      if (gen === tokenGenRef.current) setLoadingTokens(false);
    });
  }, [pageBlocks, tokenCache, onLemmatize]);

  // Auto-translate the page when the toggle is on (cleared on page change).
  useEffect(() => {
    if (!showTranslation || !pageBlocks.length) return;
    const gen = tokenGenRef.current;
    const texts = pageBlocks
      .filter((p): p is PageBlock & { block: EpubTextBlock } => p.block.kind === 'text')
      .map(p => p.block.text);
    if (!texts.length) return;
    const missing = texts.filter(t => !blockTranslations[md5(t)]);
    if (!missing.length) return;
    void onPageTranslate(missing).then(byKey => {
      if (gen !== tokenGenRef.current) return;
      setBlockTranslations(prev => ({ ...prev, ...byKey }));
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showTranslation, pageBlocks]);

  // Keyboard paging.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') prevPage();
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        nextPage();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [prevPage, nextPage]);

  const renderBlock = useCallback((p: PageBlock) => {
    const { loc, block } = p;
    if (block.kind === 'image') {
      // eslint-disable-next-line @next/next/no-img-element
      return <img key={`${loc.spineIndex}:${loc.blockIndex}`} src={block.imageUri}
        alt={block.alt ?? ''} className="max-w-full h-auto rounded-lg my-4" />;
    }
    const tb = block;
    const blockKey = `${loc.spineIndex}:${loc.blockIndex}`;
    const key = md5(tb.text);
    const Tag = blockTag(tb);
    const tokens = tokenCache[blockKey];
    const href = tb.formats.find(f => f.type === 'link')?.url;
    return (
      <TextActionMenu key={blockKey} text={tb.text} l2Code={l2.code} l1Code={l1.code}
        translation={showTranslation ? blockTranslations[key] : undefined}
        translationClass={translationClass(tb)}
        loading={showTranslation && !blockTranslations[key]}>
        <Tag className={blockClass(tb)}>
          <TokenizedText text={tb.text} l2Code={l2.code} textScale={0} context={ctx}
            tokens={tokens} formats={tb.formats} href={href} onOpenLink={onOpenLink} />
        </Tag>
      </TextActionMenu>
    );
  }, [tokenCache, blockTranslations, showTranslation, l2.code, l1.code, ctx, onOpenLink]);

  const allTokensReady = pageBlocks.every(p =>
    p.block.kind === 'image' || tokenCache[`${p.loc.spineIndex}:${p.loc.blockIndex}`],
  );

  return (
    <div className="min-w-0 flex-1 flex flex-col min-h-0">
      {chapterLabel && (
        <div className="flex-shrink-0 px-1 pb-2 text-xs font-medium text-muted-foreground truncate">
          {chapterLabel}
        </div>
      )}
      <div ref={viewportRef} className="min-h-0 flex-1 overflow-auto">
        <div
          className="px-1 [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mt-0 [&_h1]:mb-0
          [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-0 [&_h2]:mb-0
          [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-0 [&_h3]:mb-0
          [&_p]:mb-0 [&_p]:leading-relaxed
          [&_li]:mb-0 [&_li]:leading-relaxed
          [&_blockquote]:border-l-4 [&_blockquote]:border-muted [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground [&_blockquote]:mb-0
          [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-lg [&_img]:my-4
          [&_pre]:bg-muted [&_pre]:p-4 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre]:mb-0"
          lang={l2.code} dir={l2.direction === 'rtl' ? 'rtl' : 'ltr'}
        >
          {measuring && pageBlocks.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {loadingTokens && pageBlocks.length > 0 && (
                <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> {t('msg.making_words_interactive')}
                </div>
              )}
              {!loadingTokens && allTokensReady && pageBlocks.length > 0 && (
                <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
                  <Sparkles className="h-3 w-3" /> {t('msg.tap_any_word_to_lookup')}
                </div>
              )}
              {pageBlocks.map(renderBlock)}
            </>
          )}
        </div>
      </div>

      {/* Page navigation + translation */}
      <div className="flex-shrink-0 flex items-center justify-center gap-3 border-t border-border py-2 text-xs text-muted-foreground">
        <button onClick={prevPage} disabled={!hasPrev || measuring}
          aria-label={t('action.previous_chapter')}
          className="rounded p-1 hover:bg-muted disabled:opacity-30">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span>
          {pageNumber}
          {totalPagesEstimate > 0 ? ` / ${totalPagesEstimate}` : ''}
        </span>
        <button onClick={nextPage} disabled={!hasNext || measuring}
          aria-label={t('action.next_chapter')}
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

      {/* Hidden measuring container — mirrors the current window exactly. */}
      <div
        ref={measureRef}
        aria-hidden="true"
        className="absolute inset-x-0 top-0 -z-10 overflow-hidden opacity-0 pointer-events-none"
      >
        <div
          className="px-1 [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mt-0 [&_h1]:mb-0
          [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-0 [&_h2]:mb-0
          [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-0 [&_h3]:mb-0
          [&_p]:mb-0 [&_p]:leading-relaxed
          [&_li]:mb-0 [&_li]:leading-relaxed
          [&_blockquote]:border-l-4 [&_blockquote]:border-muted [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground [&_blockquote]:mb-0
          [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-lg [&_img]:my-4
          [&_pre]:bg-muted [&_pre]:p-4 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre]:mb-0"
          lang={l2.code} dir={l2.direction === 'rtl' ? 'rtl' : 'ltr'}
        >
          {measureWindow.map((p, i) =>
            p.block.kind === 'image'
              // eslint-disable-next-line @next/next/no-img-element
              ? <img key={i} src={p.block.imageUri} alt="" className="max-w-full h-auto rounded-lg my-4" />
              : (() => {
                  const tb = p.block as EpubTextBlock;
                  const Tag = blockTag(tb);
                  return <Tag key={i} className={blockClass(tb)}>{tb.text}</Tag>;
                })(),
          )}
        </div>
      </div>
    </div>
  );
}
