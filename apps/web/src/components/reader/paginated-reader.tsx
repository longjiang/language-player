'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import type { LemmatizedToken, SavedWordContext } from '@langplayer/shared';
import { useT } from '@/hooks/use-t';
import { useGlyphLang } from '@/hooks/use-glyph-lang';
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
import { ChevronLeft, ChevronRight, List, Loader2, Search } from 'lucide-react';

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

  // ── Immersive reader mode (EPUB) ──
  /**
   * Immersive mode: the page chrome (bottom pagination bar) floats over the
   * content instead of taking layout space, and page metadata overlays render
   * on top. Toggling `chromeVisible` never reflows the book — the caller
   * reserves constant top/bottom strips via `immersiveReserve`.
   */
  immersive?: boolean;
  /** Constant strips reserved for the chrome (and the muted page metadata)
   *  — applied as padding so pagination is identical with chrome shown/hidden. */
  immersiveReserve?: { top: number; bottom: number };
  /** Immersive: whether the bottom bar chrome is visible (slides away when false). */
  chromeVisible?: boolean;
  /** Immersive: called on a blank-space tap to toggle the chrome. */
  onToggleChrome?: () => void;
  /** Immersive: renders the TOC button in the bottom bar. */
  onOpenToc?: () => void;
  /** Immersive: renders the Search button in the bottom bar. */
  onOpenSearch?: () => void;
  /** Immersive: overlay rendered in the top reserved strip (muted chapter title). */
  topOverlay?: ReactNode;
  /** Immersive: overlay rendered in the bottom reserved strip (muted page count). */
  pageInfoOverlay?: (page: number, total: number, isEstimate: boolean) => ReactNode;

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
  immersive = false,
  immersiveReserve,
  chromeVisible = true,
  onToggleChrome,
  onOpenToc,
  onOpenSearch,
  topOverlay,
  pageInfoOverlay,
  renderBlock,
  renderMeasureBlock,
}: PaginatedReaderProps) {
  const t = useT();
  const { display, updateDisplay } = useSettingsContext();
  const glyphLang = useGlyphLang(l2.code);
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

  // ── Swipe/flick left/right page turns (mobile parity) ──
  // Pointer-based horizontal drag on the scroll viewport: the page follows
  // the pointer, a fast horizontal velocity (or enough drag distance) turns
  // the page, otherwise it snaps back. `touch-action: pan-y` on the viewport
  // keeps vertical scrolling native while handing horizontal pans to us.
  // Taps keep working (a drag only claims the gesture after a horizontal
  // offset), and a click that follows a drag is suppressed so flicking
  // across a link never navigates.
  const dragRef = useRef<HTMLDivElement>(null);
  const pagerActionsRef = useRef({ hasPrev: pager.hasPrev, hasNext: pager.hasNext, prevPage, nextPage });
  pagerActionsRef.current = { hasPrev: pager.hasPrev, hasNext: pager.hasNext, prevPage, nextPage };
  const dragStateRef = useRef({
    active: false,
    tracking: false,
    commitNext: false,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastT: 0,
    animating: false,
  });

  useEffect(() => {
    const el = pager.viewportRef.current;
    const content = dragRef.current;
    if (!el || !content) return;

    const state = dragStateRef.current;
    /** Horizontal velocity (px/s) at release that counts as a "flick" even
     *  with a short stroke (iBooks-style, mobile parity). */
    const FLICK_VELOCITY = 800;
    /** Horizontal offset (px) before the gesture claims the drag. */
    const ACTIVATE = 8;

    const resetTransform = () => {
      content.style.transition = '';
      content.style.transform = '';
    };

    const cancelDrag = () => {
      state.active = false;
      state.tracking = false;
      content.style.transition = 'transform 160ms ease-out';
      content.style.transform = 'translateX(0px)';
      window.setTimeout(resetTransform, 180);
    };

    const onPointerDown = (e: PointerEvent) => {
      if (state.animating) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      // Never hijack a drag that starts while text is selected (selection UX).
      if (window.getSelection()?.toString()) return;
      const { hasPrev, hasNext } = pagerActionsRef.current;
      if (!hasPrev && !hasNext) return;
      state.active = true;
      state.tracking = false;
      state.startX = state.lastX = e.clientX;
      state.startY = e.clientY;
      state.lastT = e.timeStamp;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!state.active || state.animating) return;
      const dx = e.clientX - state.startX;
      const dy = e.clientY - state.startY;
      if (!state.tracking) {
        if (Math.abs(dx) < ACTIVATE && Math.abs(dy) < ACTIVATE) return;
        // Vertical intent → leave it to native scrolling.
        if (Math.abs(dy) > Math.abs(dx)) {
          state.active = false;
          return;
        }
        if (Math.abs(dx) < ACTIVATE) return;
        state.tracking = true;
        try { el.setPointerCapture(e.pointerId); } catch { /* already released */ }
      }
      state.lastX = e.clientX;
      state.lastT = e.timeStamp;
      // The page follows the pointer, clamped so a slow full-width drag
      // can't shove the page entirely off-screen.
      const maxDrag = Math.min(120, el.clientWidth * 0.3);
      const clamped = Math.max(-maxDrag, Math.min(maxDrag, dx));
      content.style.transition = '';
      content.style.transform = `translateX(${clamped}px)`;
    };

    const settle = (commit: boolean) => {
      const width = el.clientWidth;
      const tx = commit ? (state.commitNext ? -width : width) : 0;
      content.style.transition = 'transform 120ms ease-out';
      content.style.transform = `translateX(${tx}px)`;
      state.animating = true;
      window.setTimeout(() => {
        state.animating = false;
        resetTransform();
        if (commit) {
          const actions = pagerActionsRef.current;
          if (state.commitNext) actions.nextPage();
          else actions.prevPage();
        }
      }, commit ? 130 : 190);
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!state.active) return;
      state.active = false;
      if (!state.tracking) return;
      state.tracking = false;
      const dx = e.clientX - state.startX;
      const dt = Math.max(1, e.timeStamp - state.lastT);
      const vx = ((e.clientX - state.lastX) / dt) * 1000;
      const isFlick = Math.abs(vx) > FLICK_VELOCITY;
      const threshold = Math.min(64, el.clientWidth * 0.18);
      const { hasPrev, hasNext } = pagerActionsRef.current;
      const shouldNext = (dx < -threshold || (isFlick && vx < -FLICK_VELOCITY)) && hasNext;
      const shouldPrev = (dx > threshold || (isFlick && vx > FLICK_VELOCITY)) && hasPrev;
      if (shouldNext || shouldPrev) {
        state.commitNext = shouldNext;
        settle(true);
      } else {
        settle(false);
      }
      // A drag that ends over a link must not then activate it.
      const suppress = (ev: MouseEvent) => {
        ev.preventDefault();
        ev.stopPropagation();
      };
      el.addEventListener('click', suppress, true);
      window.setTimeout(() => el.removeEventListener('click', suppress, true), 300);
    };

    const onPointerCancel = () => cancelDrag();

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerCancel);
    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', onPointerCancel);
    };
    // The viewport/content elements are stable for the reader's lifetime;
    // dynamic values (hasPrev/hasNext/prevPage/nextPage) go through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Blank-space tap toggles the immersive chrome. Token clicks stopPropagation
  // in token-span, so only taps on truly empty space reach this handler; links
  // and controls are excluded via closest(). Text selection never toggles.
  useEffect(() => {
    if (!immersive || !onToggleChrome) return;
    const el = pager.viewportRef.current;
    if (!el) return;
    const onTap = (e: MouseEvent) => {
      if (window.getSelection()?.toString()) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('a, button, input, textarea, select, [contenteditable="true"]')) return;
      onToggleChrome();
    };
    el.addEventListener('click', onTap);
    return () => el.removeEventListener('click', onTap);
    // The viewport element is stable for the reader's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [immersive, onToggleChrome]);

  // Pre-parse fallback: raw text, stripped of markdown (parse failure or the
  // frame before blocks arrive).
  const showFallback = !blocks && !!text && !book;

  const dir = l2.direction === 'rtl' ? 'rtl' : 'ltr';

  return (
    <div
      className="relative min-w-0 flex-1 flex flex-col min-h-0 overflow-hidden"
      style={immersive && immersiveReserve
        ? { paddingTop: immersiveReserve.top, paddingBottom: immersiveReserve.bottom }
        : undefined}
    >
      <div ref={pager.viewportRef} className="min-h-0 flex-1 overflow-auto touch-pan-y">
        <div ref={dragRef} className={contentClassName} lang={glyphLang} dir={dir}>
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

      {/* Page navigation + translation — the immersive reader floats it over
          the reserved bottom strip; non-immersive readers keep it in flow. */}
      <div
        className={`flex items-center justify-center gap-3 border-t border-border bg-background py-2 text-xs text-muted-foreground ${
          immersive
            ? 'absolute inset-x-0 bottom-0 transition-transform duration-300'
            : 'flex-shrink-0'
        }`}
        style={immersive
          ? {
              transform: chromeVisible ? 'translateY(0)' : 'translateY(100%)',
              pointerEvents: chromeVisible ? 'auto' : 'none',
            }
          : undefined}
      >
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
        {onOpenToc && (
          <button
            onClick={onOpenToc}
            className="rounded p-1 hover:bg-muted"
            aria-label={t('action.table_of_contents')}
            title={t('action.table_of_contents')}
          >
            <List className="h-4 w-4" />
          </button>
        )}
        {onOpenSearch && (
          <button
            onClick={onOpenSearch}
            className="rounded p-1 hover:bg-muted"
            aria-label={t('action.search')}
            title={t('action.search')}
          >
            <Search className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Immersive metadata overlays — muted chapter title (top strip) and
          page count (bottom strip). Non-interactive, never reflow the book. */}
      {immersive && (
        <>
          {topOverlay && (
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center px-4 pt-2.5">
              {topOverlay}
            </div>
          )}
          {pageInfoOverlay && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center px-4 pb-2.5">
              {pageInfoOverlay(pager.page, pager.totalPages, pager.totalPagesIsEstimate)}
            </div>
          )}
        </>
      )}

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
        lang={glyphLang} dir={dir}
      >
        {pager.measureWindow.map((item, i) => renderMeasureBlock(item, i))}
      </div>
    </div>
  );
}
