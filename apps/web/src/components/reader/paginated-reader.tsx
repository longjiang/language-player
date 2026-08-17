'use client';

/**
 * Shared paginated reader panel (SPEC-077).
 *
 * Renders any BlockStream through the CSS-columns pager hook: the window
 * (current page ± a few estimated pages) is mounted in a multi-column pager
 * whose columns are pages; the visible page is a CSS transform away. Only
 * window blocks are tokenized (parent-driven batch lemmatization); only the
 * visible page is auto-translated. Navigation (initial location, external
 * location + nonce for search/TOC/link jumps), the page nav bar, keyboard
 * paging, and location reporting live here, so all three readers share them.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { LemmatizedToken } from '@langplayer/shared';
import { md5 } from '@langplayer/utils';
import { useT } from '@/hooks/use-t';
import { useSettingsContext } from '@/providers/settings-provider';
import { useCssColumnsPager, type ActiveWindow, type PendingWindow } from '@/hooks/use-css-columns-pager';
import type { BlockStream, ReaderLocation } from '@/lib/block-stream';
import { logwarn } from '@/lib/logger';
import { Switch } from '@/components/ui/switch';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

/** Char range inside a block — used for search-match highlights. */
export interface HighlightRange {
  streamIndex: number;
  start: number;
  end: number;
}

export interface BlockRenderContext {
  /** Lemmatized tokens for the block (undefined while pending). */
  tokens?: LemmatizedToken[];
  /** Auto-translation for the block (undefined while pending). */
  translation?: string;
  /** True while this block's translation is being fetched. */
  translating: boolean;
  /** Active search-match highlight, if this block contains it. */
  highlight?: HighlightRange | null;
}

interface PaginatedReaderProps<B> {
  stream: BlockStream<B>;
  /** Where to open the reader (defaults to the start). */
  initialLocation?: ReaderLocation | null;
  /** External jump target (search / TOC / link / restore); applied when
   *  `locationNonce` changes. */
  location?: ReaderLocation | null;
  locationNonce?: number;
  /** Layout identity — re-paginates when any text-setting changes. */
  layoutIdentity?: string | number;
  /** RTL books mirror the page column direction. */
  rtl?: boolean;
  /** Content language / direction (applied to the pager containers). */
  lang?: string;
  dir?: 'ltr' | 'rtl';
  renderBlock: (block: B, streamIndex: number, ctx: BlockRenderContext) => ReactNode;
  onLemmatize: (texts: string[]) => Promise<LemmatizedToken[][]>;
  onPageTranslate: (texts: string[]) => Promise<Record<string, string>>;
  onLocationChange?: (loc: ReaderLocation) => void;
  highlight?: HighlightRange | null;
  onHighlightDismiss?: () => void;
  /** Optional row above the pager (e.g. the "tap any word" hint). */
  hintRow?: ReactNode;
  showTranslation: boolean;
  onToggleTranslation?: (checked: boolean) => void;
}

/** Block wrapper classes: splittable by default (paragraphs flow across page
 *  columns); atomic exceptions (images, pre, tables, raw-markdown) are
 *  applied by the readers' renderBlock. */
const BLOCK_WRAPPER_CLASS = 'px-1';

export function PaginatedReader<B>({
  stream,
  initialLocation,
  location,
  locationNonce,
  layoutIdentity,
  rtl = false,
  lang,
  dir,
  renderBlock,
  onLemmatize,
  onPageTranslate,
  onLocationChange,
  highlight,
  onHighlightDismiss,
  hintRow,
  showTranslation,
  onToggleTranslation,
}: PaginatedReaderProps<B>) {
  const t = useT();
  const pager = useCssColumnsPager<B>(stream, { initialLocation, layoutIdentity, rtl });
  const { active: pagerActive, pending: pagerPending, visibleRange: pagerVisibleRange } = pager;

  const [tokenCache, setTokenCache] = useState<Map<number, LemmatizedToken[]>>(new Map());
  const [translations, setTranslations] = useState<Map<number, string>>(new Map());
  const [translating, setTranslating] = useState(false);
  const requestedTokensRef = useRef<Set<number>>(new Set());
  const tokenGenRef = useRef(0);
  const translateGenRef = useRef(0);
  const lastLocationKeyRef = useRef<string | null>(null);
  const lastNonceRef = useRef<number | null>(null);

  // ── External jumps (search / TOC / links / restore) ──
  useEffect(() => {
    if (!location) return;
    if (lastNonceRef.current === locationNonce) return;
    lastNonceRef.current = locationNonce ?? null;
    pager.jumpTo(location);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location, locationNonce, pager.jumpTo]);

  // ── Tokenize the window (parent-driven, batched, cached per streamIndex) ──
  const windowBlockText = useCallback((w: ActiveWindow<B> | PendingWindow<B>, i: number): string | null => {
    if (i < w.winStart || i >= w.winEnd) return null;
    const block = w.blocks[i - w.winStart];
    if (!block || !stream.isTextBlock(block)) return null;
    return stream.blockText(block);
  }, [stream]);

  useEffect(() => {
    const windows = [pagerActive, pagerPending].filter(Boolean) as Array<ActiveWindow<B> | PendingWindow<B>>;
    if (windows.length === 0) return;
    const missing = new Map<number, string>();
    for (const w of windows) {
      for (let i = w.winStart; i < w.winEnd; i++) {
        if (tokenCache.has(i) || requestedTokensRef.current.has(i)) continue;
        const text = windowBlockText(w, i);
        if (text !== null) missing.set(i, text);
      }
    }
    if (missing.size === 0) return;
    const gen = ++tokenGenRef.current;
    for (const i of missing.keys()) requestedTokensRef.current.add(i);
    void onLemmatize(Array.from(missing.values())).then(results => {
      if (gen !== tokenGenRef.current) return;
      setTokenCache(prev => {
        if (results.length === 0) return prev;
        const next = new Map(prev);
        let k = 0;
        for (const i of missing.keys()) {
          if (results[k]) next.set(i, results[k]!);
          k += 1;
        }
        return next;
      });
    }).catch(e => {
      if (gen !== tokenGenRef.current) return;
      logwarn('Pager: window lemmatization failed', e);
      for (const i of missing.keys()) requestedTokensRef.current.delete(i);
    });
  }, [pagerActive, pagerPending, stream, onLemmatize, tokenCache, windowBlockText]);

  // ── Auto-translate the visible page (cached per streamIndex, keyed by
  //    md5 like the previous readers so responses never misalign) ──
  useEffect(() => {
    const vr = pagerVisibleRange;
    const w = pagerActive;
    if (!showTranslation || !vr || !w) return;
    const missing: number[] = [];
    for (let i = vr[0]; i < vr[1]; i++) {
      if (translations.has(i)) continue;
      const text = windowBlockText(w, i);
      if (text !== null) missing.push(i);
    }
    if (missing.length === 0) return;
    const gen = ++translateGenRef.current;
    setTranslating(true);
    const texts = missing.map(i => windowBlockText(w, i)!);
    void onPageTranslate(texts).then(byKey => {
      if (gen !== translateGenRef.current) return;
      setTranslations(prev => {
        const next = new Map(prev);
        missing.forEach((i, k) => {
          const val = byKey[md5(texts[k]!)];
          if (val) next.set(i, val);
        });
        return next;
      });
    }).catch(() => {
      if (gen !== translateGenRef.current) return;
      logwarn('Pager: page translation failed');
    }).finally(() => {
      if (gen === translateGenRef.current) setTranslating(false);
    });
  }, [showTranslation, pagerVisibleRange, pagerActive, stream, onPageTranslate, translations, windowBlockText]);

  // ── Report the visible page start (persistence) ──
  const streamIdRef = useRef(stream.id);
  useEffect(() => {
    if (streamIdRef.current !== stream.id) {
      streamIdRef.current = stream.id;
      lastLocationKeyRef.current = null;
    }
    if (!onLocationChange || !pager.active) return;
    const loc = stream.streamIndexToLocation(pager.pageStart);
    const key = `${loc.streamIndex}:${loc.offset}`;
    if (lastLocationKeyRef.current === key) return;
    lastLocationKeyRef.current = key;
    onLocationChange(loc);
  }, [pager.pageStart, stream, onLocationChange]);

  // ── Search-highlight refinement (SPEC-077 §7.4) ──
  // With paragraphs flowing across pages, a match in a split paragraph can
  // sit on the NEXT column even though the block starts on the current page.
  // Once the block's tokens render, measure the match's real column and
  // reveal it. The measured column also drives dismissal: revealing the
  // match's column (while the block starts on the previous page) must not
  // dismiss the highlight; paging away from the match's column does.
  const matchColumnRef = useRef<number | null>(null);
  const highlightKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!highlight) {
      matchColumnRef.current = null;
      highlightKeyRef.current = null;
      return;
    }
    // A new highlight invalidates the previous measurement — otherwise the
    // dismiss check could compare the old match column against the new page.
    const key = `${highlight.streamIndex}:${highlight.start}:${highlight.end}`;
    if (key !== highlightKeyRef.current) {
      highlightKeyRef.current = key;
      matchColumnRef.current = null;
    }
    // Only refine while the highlighted block is on the visible page.
    const vr = pagerVisibleRange;
    const w = pagerActive;
    if (!vr || !w) return;
    if (highlight.streamIndex < vr[0] || highlight.streamIndex >= vr[1]) return;
    const tokens = tokenCache.get(highlight.streamIndex);
    if (!tokens || tokens.length === 0) return; // wait for tokenization/layout
    const id = requestAnimationFrame(() => {
      const pagerEl = activePagerRef.current;
      if (!pagerEl) return;
      const wrapper = pagerEl.querySelector(`[data-block="${highlight.streamIndex}"]`);
      if (!wrapper) return;
      // Scope the walk to the L2 text container (wrapper > TextActionMenu
      // root > content > children) so the translation column below it can't
      // shift the offsets. Bail when the DOM text can't be offset-matched
      // (script conversion, phonetics replacement) — keep the block-start page.
      const contentEl = wrapper.firstElementChild?.firstElementChild?.firstElementChild;
      if (!contentEl) return;
      const texts: { node: Text; start: number }[] = [];
      let pos = 0;
      const walker = document.createTreeWalker(contentEl, NodeFilter.SHOW_TEXT);
      let n: Node | null;
      while ((n = walker.nextNode())) {
        const len = n.textContent?.length ?? 0;
        if (len > 0) texts.push({ node: n as Text, start: pos });
        pos += len;
      }
      if (pos < highlight.end) return;
      const startIdx = texts.findIndex(t => t.start + (t.node.textContent?.length ?? 0) > highlight.start);
      const endIdx = texts.findIndex(t => t.start + (t.node.textContent?.length ?? 0) >= highlight.end);
      if (startIdx < 0 || endIdx < 0) return;
      const range = document.createRange();
      range.setStart(texts[startIdx]!.node, highlight.start - texts[startIdx]!.start);
      range.setEnd(texts[endIdx]!.node, highlight.end - texts[endIdx]!.start);
      const rects = range.getClientRects();
      const rect = rects[0] ?? range.getBoundingClientRect();
      const pagerRect = pagerEl.getBoundingClientRect();
      const col = Math.round((rect.left - pagerRect.left) / Math.max(1, pager.pitch));
      matchColumnRef.current = col;
      if (col !== w.localBreaks.indexOf(pager.pageStart)) {
        const target = w.localBreaks[col];
        if (target !== undefined) pager.revealBreak(target);
      }
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlight, tokenCache, pagerVisibleRange, pagerActive, layoutIdentity, pager.pageStart, pager.pitch, pager.divisor, pager.transform]);

  // ── Dismiss the search highlight when paging away from the match ──
  useEffect(() => {
    if (!highlight || !onHighlightDismiss || !pagerVisibleRange) return;
    if (matchColumnRef.current !== null && pagerActive) {
      const col = pagerActive.localBreaks.indexOf(pager.pageStart);
      if (matchColumnRef.current !== col) onHighlightDismiss();
      return;
    }
    const [s, e] = pagerVisibleRange;
    if (highlight.streamIndex < s || highlight.streamIndex >= e) onHighlightDismiss();
  }, [highlight, pagerVisibleRange, pagerActive, pager.pageStart, onHighlightDismiss]);

  // ── Keyboard paging (shared by all readers) ──
  const { prevPage: pagerPrev, nextPage: pagerNext } = pager;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') pagerPrev();
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        pagerNext();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pagerPrev, pagerNext]);

  const { active, pending, busy, hasPrev, hasNext, pageNumber, totalPagesEstimate, pager: pagerCss, transform } = pager;

  const wrapBlock = useCallback((block: B, streamIndex: number): ReactNode => {
    const tokens = tokenCache.get(streamIndex);
    const translation = showTranslation ? translations.get(streamIndex) : undefined;
    const blockHighlight =
      highlight && highlight.streamIndex === streamIndex ? highlight : undefined;
    const ctx: BlockRenderContext = {
      tokens,
      translation,
      translating: showTranslation && translating && !translation,
      highlight: blockHighlight,
    };
    return (
      <div
        key={streamIndex}
        data-block={streamIndex}
        className={BLOCK_WRAPPER_CLASS}
      >
        {renderBlock(block, streamIndex, ctx)}
      </div>
    );
  }, [tokenCache, translations, showTranslation, translating, highlight, renderBlock]);

  const { activePagerRef, pendingPagerRef, viewportRef } = pager;
  const pagerStyle = useMemo(() => ({
    position: 'absolute' as const,
    top: 0,
    ...(rtl ? { right: 0, left: 'auto' as const } : { left: 0 }),
    width: `${pagerCss.width}px`,
    height: `${pagerCss.height}px`,
    columnWidth: `${pagerCss.columnWidth}px`,
    columnGap: `${pagerCss.columnGap}px`,
    columnFill: 'auto' as const,
    overflow: 'hidden',
    willChange: 'transform',
    transform,
  }), [pagerCss, rtl, transform]);

  return (
    <div className="relative min-w-0 flex-1 flex flex-col min-h-0 overflow-hidden">
      {hintRow}
      <div ref={viewportRef} className="relative min-h-0 flex-1 overflow-hidden">
        {active ? (
          <div ref={activePagerRef} style={pagerStyle} lang={lang} dir={dir}>
            {active.blocks.map((b, i) => wrapBlock(b, active.winStart + i))}
          </div>
        ) : (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {pending && (
          <div ref={pendingPagerRef} aria-hidden="true" style={{ ...pagerStyle, visibility: 'hidden' }} lang={lang} dir={dir}>
            {pending.blocks.map((b, i) => wrapBlock(b, pending.winStart + i))}
          </div>
        )}
      </div>

      {/* Page navigation + translation toggle */}
      <div className="flex-shrink-0 flex items-center justify-center gap-3 border-t border-border py-2 text-xs text-muted-foreground">
        <button onClick={pager.prevPage} disabled={!hasPrev || busy}
          aria-label={t('action.previous_chapter')}
          className="rounded p-1 hover:bg-muted disabled:opacity-30">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span>{pageNumber}{totalPagesEstimate > 0 ? ` / ${totalPagesEstimate}` : ''}</span>
        <button onClick={pager.nextPage} disabled={!hasNext || busy}
          aria-label={t('action.next_chapter')}
          className="rounded p-1 hover:bg-muted disabled:opacity-30">
          <ChevronRight className="h-4 w-4" />
        </button>
        {onToggleTranslation && (
          <>
            <span className="mx-2 text-muted-foreground/30">|</span>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <span className="text-xs">{t('action.translation')}</span>
              <Switch
                checked={showTranslation}
                onCheckedChange={(checked) => onToggleTranslation(checked)}
                className="shrink-0"
              />
            </label>
          </>
        )}
      </div>
    </div>
  );
}

/** Layout identity for the pager: every text setting that changes rendered
 *  block metrics must re-paginate (SPEC-077 §9). */
export function useReaderLayoutIdentity(l2Code: string): string {
  const { tokenizedText, display, getL2 } = useSettingsContext();
  const l2 = getL2(l2Code);
  const phonetics = l2.tokenSpan.phonetics;
  return [
    tokenizedText.zoom,
    tokenizedText.leading,
    tokenizedText.typeFace,
    tokenizedText.quickGloss ? 1 : 0,
    display.translation ? 1 : 0,
    phonetics.show ?? 'off',
    phonetics.conditions,
    l2.tokenSpan.definition.show ? 1 : 0,
    l2.display.traditional ? 1 : 0,
    l2.display.byeonggi ? 1 : 0,
  ].join(':');
}

export default PaginatedReader;
