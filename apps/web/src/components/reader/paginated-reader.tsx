'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { LemmatizedToken, SavedWordContext } from '@langplayer/shared';
import { useT } from '@/hooks/use-t';
import { useGlyphLang } from '@/hooks/use-glyph-lang';
import { useSettingsContext } from '@/providers/settings-provider';
import { TokenizedText } from '@/components/tokenized-text';
import { TextActionMenu } from '@/components/text-action-menu';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  usePaginatedReader,
  type BlockRenderCtx,
  type ReaderLoc,
  type ReaderPageItem,
} from '@/hooks/use-paginated-reader';
import type { ReaderBlock } from '@/lib/parse-markdown';
import type { EpubBook } from '@/lib/epub-book';
import type { BookLocation } from '@/lib/epub-book-types';
import { READER_DEFAULT_LEADING, readerHorizontalPadding as defaultReaderHorizontalPadding } from '@/lib/reader-layout';
import { ArrowDown, ChevronLeft, ChevronRight, List, Loader2, Search } from 'lucide-react';

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
  /** Initial reading location to restore on mount (saved position / jump). */
  initialLocation?: ReaderLoc | null;
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
  /** Reader horizontal geometry — leading margins (both sides) plus the
   *  page-width clamp; applied to visible and measured content. Defaults to
   *  the shared reader layout (leading margins + READER_PAGE_WIDTH clamp). */
  readerHorizontalPadding?: {
    paddingLeft: number;
    paddingRight: number;
    maxWidth?: number;
    marginLeft?: 'auto';
    marginRight?: 'auto';
  };

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

  /**
   * When true, arrow/PageUp/PageDown/space keys do NOT page this reader.
   * Defaults to false. Used by surfaces that mount several readers at once
   * (e.g. the tokenizer test page's per-language grid) where a single global
   * keydown would page every reader simultaneously.
   */
  disableKeyboardPaging?: boolean;

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
  initialLocation,
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
  readerHorizontalPadding,
  immersive = false,
  immersiveReserve,
  chromeVisible = true,
  onToggleChrome,
  onOpenToc,
  onOpenSearch,
  topOverlay,
  pageInfoOverlay,
  disableKeyboardPaging = false,
  renderBlock,
  renderMeasureBlock,
}: PaginatedReaderProps) {
  const t = useT();
  const { display, tokenizedText, updateDisplay } = useSettingsContext();
  const glyphLang = useGlyphLang(l2.code);
  const showTranslation = display.translation;
  // Every paginated reader uses the shared horizontal geometry — the text
  // column is padded by the L2 leading on both sides and clamped to the page
  // width (READER_PAGE_WIDTH) with auto margins, so visible content and the
  // measuring mirror wrap identically. Readers may override via the prop.
  const defaultHorizontalPadding = defaultReaderHorizontalPadding(
    tokenizedText.zoom,
    tokenizedText.leading ?? READER_DEFAULT_LEADING,
  );
  const hPad = readerHorizontalPadding ?? defaultHorizontalPadding;

  const pager = usePaginatedReader({
    blocks,
    book,
    location,
    jumpNonce,
    initialLocation,
    onLocationChange,
    onLemmatize,
    onPageTranslate,
    showTranslation,
    measureNonce,
    chromeHeight,
  });

  // ── Go-to-page dialog (mobile parity: click the page counter) ──
  const [jumpOpen, setJumpOpen] = useState(false);
  const [jumpValue, setJumpValue] = useState('');
  const openJump = useCallback(() => {
    setJumpValue(String(pager.page));
    setJumpOpen(true);
  }, [pager.page]);
  const submitJump = useCallback(() => {
    const n = parseInt(jumpValue, 10);
    if (!isNaN(n) && n >= 1) pager.goToPage(n);
    setJumpOpen(false);
  }, [jumpValue, pager.goToPage]);

  // Keyboard paging (arrows, PageUp/Down) — never while typing in an
  // input/textarea/select/contenteditable (e.g. the sidebar search box).
  // Space is NOT a page turn: it scrolls the current page down by a viewport
  // (see below), so a long page is read by scrolling before advancing.
  const { prevPage, nextPage } = pager;
  useEffect(() => {
    if (disableKeyboardPaging) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') prevPage();
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown') {
        e.preventDefault();
        nextPage();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prevPage, nextPage, disableKeyboardPaging]);

  // ── Space scrolls the page (never turns it) ──
  // A page that overflows the viewport (a tall block, or a translation taller
  // than measured) is read by scrolling; Space scrolls down one viewport and
  // Shift+Space scrolls up. At the top/bottom nothing else happens — page
  // turns stay on the arrow keys and buttons.
  useEffect(() => {
    if (disableKeyboardPaging) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== ' ') return;
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      const vp = pager.viewportRef.current;
      if (!vp) return;
      e.preventDefault();
      const dir = e.shiftKey ? -1 : 1;
      vp.scrollBy({ top: dir * Math.max(1, vp.clientHeight * 0.9), behavior: 'smooth' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [disableKeyboardPaging, pager.viewportRef]);

  // ── Long-page scroll affordance (down-arrow) ──
  // When the current page overflows the viewport, a floating down-arrow sits
  // just above the page counter; tapping it scrolls to the bottom. Hidden at
  // the bottom (or when the page fits) so it never blocks a page turn.
  const [canScrollDown, setCanScrollDown] = useState(false);
  const [atPageBottom, setAtPageBottom] = useState(false);
  const updateScrollState = useCallback(() => {
    const vp = pager.viewportRef.current;
    if (!vp) return;
    const overflow = vp.scrollHeight - vp.clientHeight;
    setCanScrollDown(overflow > 8);
    setAtPageBottom(overflow > 8 && vp.scrollTop >= overflow - 8);
  }, [pager.viewportRef]);
  // Re-check after every page renders, when the viewport resizes, and on scroll.
  useEffect(() => {
    updateScrollState();
    window.addEventListener('resize', updateScrollState);
    return () => window.removeEventListener('resize', updateScrollState);
  }, [updateScrollState, pager.page, pager.measureWindow, showTranslation]);
  const scrollPageToBottom = useCallback(() => {
    const vp = pager.viewportRef.current;
    if (!vp) return;
    vp.scrollTo({ top: vp.scrollHeight, behavior: 'smooth' });
  }, [pager.viewportRef]);

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
  const wheelStateRef = useRef({
    deltaX: 0,
    lastTime: 0,
    gestureLocked: false,
  });

  useEffect(() => {
    const el = pager.viewportRef.current;
    const content = dragRef.current;
    if (!el || !content) return;

    const state = dragStateRef.current;
    const wheelState = wheelStateRef.current;
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
      // A mouse drag over reader text is the browser's primary text-selection
      // gesture. Leave it entirely to the browser; trackpad paging is handled
      // by the horizontal wheel path below, and touch still supports flicks.
      if (e.pointerType === 'mouse') return;
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
        // Selection can be created after pointerdown. Check again immediately
        // before claiming the horizontal gesture so selection handles/ranges
        // always win over paging.
        if (window.getSelection()?.type === 'Range') {
          state.active = false;
          return;
        }
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

    // macOS two-finger trackpad swipes arrive in browsers as horizontal wheel
    // deltas (deltaMode === DOM_DELTA_PIXEL). Accumulate the gesture so small
    // inertial events do not turn multiple pages, and require horizontal
    // dominance so ordinary vertical scrolling remains untouched.
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return;
      const target = e.target as HTMLElement | null;
      const onControl = !!target?.closest?.('a, button, input, textarea, select, [contenteditable="true"]');

      const scale = e.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? 16
        : e.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? el.clientWidth
          : 1;
      const dx = e.deltaX * scale;
      const dy = e.deltaY * scale;
      if (Math.abs(dx) < 1 || Math.abs(dx) <= Math.abs(dy) * 1.15) {
        if (e.timeStamp - wheelState.lastTime > 180) wheelState.deltaX = 0;
        return;
      }

      // Cancel horizontal overscroll as soon as the gesture is recognized;
      // waiting until the page threshold is reached lets Safari/Chrome treat
      // the initial two-finger movement as browser history navigation.
      e.preventDefault();
      const now = e.timeStamp;
      // A single trackpad swipe produces an inertial burst after the fingers
      // leave the surface. Consume that burst until horizontal wheel events
      // have been quiet long enough to indicate a new physical swipe.
      if (wheelState.gestureLocked) {
        if (now - wheelState.lastTime <= 240) {
          wheelState.lastTime = now;
          return;
        }
        wheelState.gestureLocked = false;
        wheelState.deltaX = 0;
      }
      if (state.animating || onControl) return;
      if (now - wheelState.lastTime > 180) wheelState.deltaX = 0;
      wheelState.lastTime = now;
      wheelState.deltaX += dx;
      if (Math.abs(wheelState.deltaX) < 64) return;

      // With natural trackpad scrolling, a physical swipe left produces a
      // positive horizontal scroll delta; left is next, right is previous.
      const next = wheelState.deltaX > 0;
      const { hasPrev, hasNext } = pagerActionsRef.current;
      const canTurn = next ? hasNext : hasPrev;
      wheelState.deltaX = 0;
      wheelState.gestureLocked = true;
      wheelState.lastTime = now;
      if (!canTurn) return;

      state.commitNext = next;
      settle(true);
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
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', onPointerCancel);
      el.removeEventListener('wheel', onWheel);
    };
    // The viewport/content elements are stable for the reader's lifetime;
    // dynamic values (hasPrev/hasNext/prevPage/nextPage) go through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Blank-space tap toggles the immersive chrome. The listener lives on the
  // padded container — the reader's full-area root — so the tap surface
  // covers the entire screen: the text column, the empty area below the last
  // paragraph, and both reserved strips (SPEC-085 §5). Token clicks
  // stopPropagation in token-span, so only taps on truly empty space reach
  // this handler; links and controls are excluded via closest(). Text
  // selection never toggles.
  const tapSurfaceRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!immersive || !onToggleChrome) return;
    const el = tapSurfaceRef.current;
    if (!el) return;
    const onTap = (e: MouseEvent) => {
      if (window.getSelection()?.toString()) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('a, button, input, textarea, select, [contenteditable="true"]')) return;
      onToggleChrome();
    };
    el.addEventListener('click', onTap);
    return () => el.removeEventListener('click', onTap);
    // The container element is stable for the reader's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [immersive, onToggleChrome]);

  // Pre-parse fallback: raw text, stripped of markdown (parse failure or the
  // frame before blocks arrive).
  const showFallback = !blocks && !!text && !book;

  const dir = l2.direction === 'rtl' ? 'rtl' : 'ltr';

  return (
    <div
      ref={tapSurfaceRef}
      className="relative min-w-0 flex-1 flex flex-col min-h-0 overflow-hidden"
      style={immersive && immersiveReserve
        ? { paddingTop: immersiveReserve.top, paddingBottom: immersiveReserve.bottom }
        : undefined}
    >
      <div
        ref={pager.viewportRef}
        className="min-h-0 flex-1 overflow-auto touch-pan-y"
        style={{ overscrollBehaviorX: 'contain' }}
        onScroll={updateScrollState}
      >
        <div
          ref={dragRef}
          className={`${contentClassName} ${immersive ? 'flex min-h-full flex-col justify-center' : ''}`}
          style={hPad}
          lang={glyphLang}
          dir={dir}
        >
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
        {/* Page counter — click to jump to an arbitrary page (mobile parity). */}
        <button
          onClick={(event) => { event.stopPropagation(); openJump(); }}
          disabled={pager.measuring}
          aria-label={t('action.go_to_page')}
          title={t('action.go_to_page')}
          className="select-none rounded px-1.5 py-0.5 hover:bg-muted disabled:opacity-50 disabled:hover:bg-transparent"
        >
          {pager.page}
          {pager.totalPages > 0 ? ` / ${pager.totalPagesIsEstimate ? '~' : ''}${pager.totalPages}` : ''}
        </button>
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
          page count (bottom strip). Non-interactive, never reflow the book.
          Their offsets are fixed inside the reserved strips (SPEC-085 §6.2):
          the title line starts reserve.top − 20 (= H + 12) from the screen
          top and the counter line bottom sits reserve.bottom − 24
          (= BAR_H + 8) above the screen bottom, so the chrome bars never
          cover them and toggling the chrome never moves them. */}
      {immersive && (
        <>
          {topOverlay && (
            <div
              className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center px-4"
              style={{ paddingTop: immersiveReserve ? immersiveReserve.top - 20 : 10 }}
            >
              {topOverlay}
            </div>
          )}
          {pageInfoOverlay && (
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center px-4"
              style={{ paddingBottom: immersiveReserve ? immersiveReserve.bottom - 24 : 10 }}
            >
              {pageInfoOverlay(pager.page, pager.totalPages, pager.totalPagesIsEstimate)}
            </div>
          )}
        </>
      )}

      {/* Long-page scroll affordance: a floating down-arrow just above the
          page counter (or the bottom bar) when the current page overflows
          the viewport. Tapping scrolls to the bottom; hidden at the bottom
          and when the page fits. */}
      {canScrollDown && !atPageBottom && (
        <div
          className="pointer-events-none absolute inset-x-0 z-10 flex justify-center"
          style={{ bottom: immersive ? (immersiveReserve?.bottom ?? 0) - 32 : 56 }}
        >
          <button
            onClick={scrollPageToBottom}
            aria-label={t('action.scroll_down')}
            title={t('action.scroll_down')}
            className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background/90 text-muted-foreground shadow-sm transition-colors hover:text-foreground"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
        </div>
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
        style={hPad}
        lang={glyphLang} dir={dir}
      >
        {pager.measureWindow.map((item, i) => renderMeasureBlock(item, i))}
      </div>

      {/* Go-to-page dialog (mobile parity: click the page counter). */}
      <Dialog open={jumpOpen} onOpenChange={setJumpOpen}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>{t('action.go_to_page')}</DialogTitle>
          </DialogHeader>
          <input
            type="number"
            min={1}
            max={pager.totalPages}
            value={jumpValue}
            onChange={(e) => setJumpValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitJump(); } }}
            autoFocus
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            aria-label={t('action.go_to_page')}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setJumpOpen(false)}>
              {t('action.cancel')}
            </Button>
            <Button onClick={submitJump}>
              {t('action.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
