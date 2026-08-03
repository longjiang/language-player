'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useRouter } from 'next/navigation';
import type { LemmatizedToken, SavedWordContext } from '@langplayer/shared';
import { md5 } from '@langplayer/utils';
import { useT } from '@/hooks/use-t';
import { useSettingsContext } from '@/providers/settings-provider';
import { TokenizedText } from '@/components/tokenized-text';
import { TextActionMenu } from '@/components/text-action-menu';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { parseMarkdown, type ReaderBlock, type TextBlock } from '@/lib/parse-markdown';
import { getSampleText } from '@/lib/sample-texts';
import {
  BookOpen, Loader2, FileText, Sparkles, Plus, PanelRight,
  ChevronLeft, ChevronRight,
} from 'lucide-react';

function stripMarkdown(md: string): string {
  // Protect image tags so the stripping regexes below can't mangle them:
  // `_(.+?)_` eats underscores inside image URLs and `\[..\]\(..\)` turns
  // `![alt](url)` into `!alt`. Placeholders are restored afterwards.
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

function blockTag(tb: TextBlock): keyof JSX.IntrinsicElements {
  switch (tb.type) {
    case 'heading': return `h${tb.depth ?? 1}` as keyof JSX.IntrinsicElements;
    case 'list-item': return 'li';
    case 'blockquote': return 'blockquote';
    default: return 'p';
  }
}

function blockClass(tb: TextBlock): string {
  const b = 'leading-relaxed';
  switch (tb.type) {
    case 'heading': {
      const s: Record<number, string> = { 1: 'text-2xl font-bold', 2: 'text-xl font-semibold', 3: 'text-lg font-semibold' };
      return `${b} ${s[tb.depth ?? 1] ?? 'text-base font-medium'} mt-4`;
    }
    case 'paragraph': return `${b}`;
    case 'list-item': return `${b} ml-4 list-disc`;
    case 'blockquote': return `${b} border-l-4 border-muted pl-4 italic text-muted-foreground`;
    default: return `${b}`;
  }
}

/** Same as blockClass but muted — for translation text */
function translationClass(tb: TextBlock): string {
  const b = 'leading-relaxed';
  switch (tb.type) {
    case 'heading': {
      const s: Record<number, string> = { 1: 'text-lg font-semibold', 2: 'text-base font-semibold', 3: 'text-sm font-semibold' };
      return `${b} ${s[tb.depth ?? 1] ?? 'text-sm font-medium'}`;
    }
    case 'blockquote': return `${b} border-l-4 border-muted/40 pl-4 italic`;
    default: return `${b} text-sm`;
  }
}

export interface ReaderPanelProps {
  l2: { code: string; name: string; direction?: string };
  l1: { code: string; name: string };
  text: string;
  loading: boolean;
  activeTab: 'edit' | 'read';
  translating: boolean;
  blocks: ReaderBlock[] | null;
  ctx: Partial<SavedWordContext>;
  onTextChange: (text: string) => void;
  onTabChange: (tab: 'edit' | 'read') => void;
  onTokenize: () => void;
  onFillSample: (text: string, title: string) => void;
  /** Returns translations keyed by the md5 of each source text (see translateTextsKeyed). */
  onPageTranslate: (texts: string[]) => Promise<Record<string, string>>;
  /** Called by ReaderPanel to lemmatize text blocks for the current page. */
  onLemmatize: (texts: string[]) => Promise<LemmatizedToken[][]>;
  /** Called when the visible page changes — gives the first ~40 chars as anchor. */
  onAnchorChange?: (anchor: string) => void;
  /** If set, seek to the page containing this anchor text after blocks load. */
  initialAnchor?: string | null;
  /** Custom handler for the dictionary popup's link action (e.g. EPUB chapter
   *  navigation). When set, links of any scheme are offered. */
  onOpenLink?: (href: string) => void;
  /** Hide the edit/read mode toggle bar (e.g. web reader, where text is always read-only). */
  hideModeTabs?: boolean;
  /** Whether the user has any notes (shows the "My Notes" empty-state button). */
  hasNotes?: boolean;
  /** Whether the notes sidebar is already visible (hides the "My Notes" button). */
  sidebarVisible?: boolean;
  /** Create a new note (same action as the sidebar's New Note button). */
  onNewNote?: () => void;
  /** Open the notes sidebar from the empty state. */
  onOpenSidebar?: () => void;
}

export function ReaderPanel({
  l2, l1,
  text, loading,
  activeTab,
  translating,
  blocks,
  ctx,
  onTextChange,
  onTabChange,
  onTokenize, onFillSample, onPageTranslate,
  onLemmatize,
  onAnchorChange,
  initialAnchor,
  onOpenLink,
  hideModeTabs = false,
  hasNotes = false,
  sidebarVisible = false,
  onNewNote,
  onOpenSidebar,
}: ReaderPanelProps) {
  const t = useT();
  const router = useRouter();
  const { display, updateDisplay } = useSettingsContext();
  const showTranslation = display.translation;

  // Markdown-block links (images, tables, raw-markdown fallbacks) open inside
  // the web reader instead of sending the user to the original site in a new
  // tab — matching how links behave in tokenized text.
  const openLinkInReader = useCallback((href: string) => {
    router.push(`/${l1.code}/${l2.code}/web-reader?url=${encodeURIComponent(href)}`);
  }, [router, l1.code, l2.code]);

  const markdownComponents = useMemo(() => ({
    a: ({ node: _node, href, children, ...props }: any) => {
      if (href && /^https?:\/\//i.test(href)) {
        return (
          <a
            href={href}
            onClick={(e) => {
              e.preventDefault();
              openLinkInReader(href);
            }}
            {...props}
          >
            {children}
          </a>
        );
      }
      return <a href={href} {...props}>{children}</a>;
    },
  }), [openLinkInReader]);
  const measureRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const [pageBreaks, setPageBreaks] = useState<number[]>([]);
  const totalPages = Math.max(1, pageBreaks.length + 1);
  // Keyed by md5(text) — a translation is only ever shown for the exact text
  // it was requested for, never by array position.
  const [blockTranslations, setBlockTranslations] = useState<Record<string, string>>({});
  const translateGenerationRef = useRef(0);
  const [isAutoTranslating, setIsAutoTranslating] = useState(false);
  const [hasMeasured, setHasMeasured] = useState(false);
  const [tokenCache, setTokenCache] = useState<Record<number, LemmatizedToken[]>>({});
  const [loadingTokens, setLoadingTokens] = useState(false);
  const tokenLoadGenRef = useRef(0);
  // Text-block indices already requested for the current blocks generation.
  // ReaderPanel re-runs its token effect as page breaks settle, and without
  // this, a re-run could re-request blocks while the first request is still
  // in flight (duplicating lemmatization of the visible page).
  const requestedTokensRef = useRef<Set<string>>(new Set());
  // Incremented whenever blocks change (content reset); the seek only runs
  // once a measurement for the current blocks has completed.
  const blocksGenRef = useRef(0);
  const measuredGenRef = useRef(0);
  // Dedupes the anchor seek by anchor + content identity. Cleared on content
  // reset so a fresh measurement always re-seeks.
  const lastSeekKeyRef = useRef<string | null>(null);

  // Clear translations and token cache when blocks change (new note / re-tokenize)
  const prevBlocksRef = useRef(blocks);
  useEffect(() => {
    if (prevBlocksRef.current !== blocks) {
      blocksGenRef.current += 1;
      lastSeekKeyRef.current = null;
      requestedTokensRef.current = new Set();
      setBlockTranslations({});
      setTokenCache({});
      setHasMeasured(false);
      prevBlocksRef.current = blocks;
    }
  }, [blocks]);

  // ── Measure: render all blocks hidden, find page breaks ──
  useEffect(() => {
    if (activeTab !== 'read' || !measureRef.current || !text) return;
    const container = measureRef.current;
    const contentWidth = containerRef.current?.clientWidth;
    container.style.width = contentWidth ? contentWidth + 'px' : '100%';
    // Ensure measuring div has the same height as the viewport
    // Use window.innerHeight - 200 (and NOT containerRef.clientHeight) because
    // during measurement the container only contains a small spinner — using its
    // actual height would produce page breaks every 1-2 paragraphs.
    container.style.height = (window.innerHeight - 200) + 'px';

    // Double rAF to ensure layout is complete
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const children = Array.from(container.children) as HTMLElement[];
        if (children.length === 0) {
          measuredGenRef.current = blocksGenRef.current;
          setPageBreaks([]); setPage(0); setHasMeasured(true); return;
        }

        const maxHeight = container.clientHeight || window.innerHeight - 200;
        const breaks: number[] = [];
        let accumulated = 0;
        let prevBottom = 0;

        for (let i = 0; i < children.length; i++) {
          const el = children[i]!;
          const top = el.offsetTop;
          const h = el.offsetHeight;
          // Real vertical gap to the previous block (collapsed margins included)
          // — measured from geometry instead of per-block getComputedStyle,
          // which forced a style recalc for every block of the chapter.
          const gap = i === 0 ? 0 : Math.max(0, top - prevBottom);
          const blockHeight = h + gap;
          if (accumulated + blockHeight > maxHeight && accumulated > 0) {
            breaks.push(i);
            accumulated = blockHeight;
          } else {
            accumulated += blockHeight;
          }
          prevBottom = top + h;
        }

        measuredGenRef.current = blocksGenRef.current;
        setPageBreaks(breaks);
        setPage(0);
        setHasMeasured(true);
      });
    });
  }, [text, blocks, activeTab, showTranslation]);

  // Get blocks for the current page
  const visibleBlocks = (() => {
    if (!blocks || pageBreaks.length === 0) return blocks;
    const start = page === 0 ? 0 : pageBreaks[page - 1]!;
    const end = page < pageBreaks.length ? pageBreaks[page]! : blocks.length;
    return blocks.slice(start, end);
  })();

  // Whether all text blocks on the current page have tokens cached
  const allTokensReady = (() => {
    if (!hasMeasured || !visibleBlocks || !blocks) return false;
    return visibleBlocks.every(block => {
      if (block.kind === 'markdown') return true;
      const globalIndex = blocks.indexOf(block);
      const tbi = blocks.slice(0, globalIndex).filter((b): b is TextBlock => b.kind === 'text').length;
      return tbi in tokenCache;
    });
  })();

  const prevPage = useCallback(() => {
    if (page <= 0) return;
    setPage(p => p - 1);
    setBlockTranslations({});
    setIsAutoTranslating(false);
  }, [page]);
  const nextPage = useCallback(() => {
    if (page >= totalPages - 1) return;
    setPage(p => p + 1);
    setBlockTranslations({});
    setIsAutoTranslating(false);
  }, [page, totalPages]);

  // Report anchor on page change
  const prevPageRef = useRef(page);
  useEffect(() => {
    if (prevPageRef.current === page || !onAnchorChange) return;
    prevPageRef.current = page;
    const first = visibleBlocks?.find((b): b is TextBlock => b.kind === 'text');
    if (first) onAnchorChange(first.text.slice(0, 40));
  }, [page, visibleBlocks, onAnchorChange]);

  // ── Load tokens for the current page (lazy, per-page) ──
  useEffect(() => {
    if (!hasMeasured || !blocks || !onLemmatize) return;

    const pageBlocks = visibleBlocks ?? blocks;
    const textBlocks = pageBlocks.filter((b): b is TextBlock => b.kind === 'text');

    const missing: { textBlockIndex: number; text: string }[] = [];
    for (const tb of textBlocks) {
      const globalIndex = blocks.indexOf(tb);
      const tbi = blocks.slice(0, globalIndex).filter((b): b is TextBlock => b.kind === 'text').length;
      if (!(tbi in tokenCache) && !requestedTokensRef.current.has(String(tbi))) {
        missing.push({ textBlockIndex: tbi, text: tb.text });
      }
    }

    if (missing.length === 0) return;

    tokenLoadGenRef.current += 1;
    const gen = tokenLoadGenRef.current;
    for (const m of missing) requestedTokensRef.current.add(String(m.textBlockIndex));
    setLoadingTokens(true);
    onLemmatize(missing.map(m => m.text)).then(results => {
      if (tokenLoadGenRef.current !== gen) return;
      setTokenCache(prev => {
        const next = { ...prev };
        missing.forEach((m, i) => {
          if (results[i]) next[m.textBlockIndex] = results[i]!;
        });
        return next;
      });
      setLoadingTokens(false);
    }).catch(() => {
      if (tokenLoadGenRef.current !== gen) return;
      // Allow a later effect run to retry the failed blocks.
      for (const m of missing) requestedTokensRef.current.delete(String(m.textBlockIndex));
      setLoadingTokens(false);
    });
  }, [hasMeasured, page, blocks, pageBreaks, onLemmatize, tokenCache, visibleBlocks]);

  // Seek to initialAnchor whenever it changes (book open, in-book link nav).
  useEffect(() => {
    if (!initialAnchor) {
      lastSeekKeyRef.current = null;
      return;
    }
    if (!blocks || !allTokensReady) return;
    // Never seek against stale page breaks from a previous blocks set.
    if (measuredGenRef.current !== blocksGenRef.current) return;
    // Find which page contains the anchor text
    if (pageBreaks.length === 0) return;
    const seekKey = `${initialAnchor}\u0000${blocks.length}\u0000${pageBreaks.length}`;
    if (lastSeekKeyRef.current === seekKey) return;
    // Search anchors can span paragraph boundaries (a snippet built from
    // concatenated chapter text), so fall back to shorter prefixes until one
    // fits inside a single block.
    const probes = [initialAnchor.length, 40, 30, 20, 15, 10];
    let foundPage = -1;
    for (const len of probes) {
      if (len < 5 || len > initialAnchor.length) continue;
      const probe = initialAnchor.slice(0, len);
      for (let p = 0; p <= pageBreaks.length; p++) {
        const start = p === 0 ? 0 : pageBreaks[p - 1]!;
        const end = p < pageBreaks.length ? pageBreaks[p]! : blocks.length;
        const pageBlocks = blocks.slice(start, end);
        const hasAnchor = pageBlocks.some((b): b is TextBlock =>
          b.kind === 'text' && b.text.includes(probe)
        );
        if (hasAnchor) { foundPage = p; break; }
      }
      if (foundPage >= 0) break;
    }
    if (foundPage >= 0) {
      lastSeekKeyRef.current = seekKey;
      setPage(foundPage);
    }
  }, [initialAnchor, blocks, allTokensReady, pageBreaks]);

  // Auto-translate on page advance (only when translation is enabled)
  useEffect(() => {
    if (!showTranslation || !visibleBlocks || !allTokensReady || loadingTokens || isAutoTranslating) return;
    const textBlocks = visibleBlocks.filter((b): b is TextBlock => b.kind === 'text');
    if (textBlocks.length === 0) return;
    // Only auto-translate if no cached translations exist for this page
    const hasAny = Object.keys(blockTranslations).length > 0;
    if (hasAny) return;
    const texts = textBlocks.map(b => b.text);
    translateGenerationRef.current += 1;
    const gen = translateGenerationRef.current;
    setIsAutoTranslating(true);
    onPageTranslate(texts).then(byKey => {
      if (translateGenerationRef.current !== gen) return; // stale — user navigated away
      const matched = Object.keys(byKey).length;
      if (matched > 0) setBlockTranslations(prev => ({ ...prev, ...byKey }));
    }).catch(() => {
      if (translateGenerationRef.current !== gen) return;
    }).finally(() => {
      setIsAutoTranslating(false);
    });
  }, [visibleBlocks, allTokensReady, loadingTokens, showTranslation]);

  // Keyboard navigation
  useEffect(() => {
    if (activeTab !== 'read') return;
    const onKey = (e: KeyboardEvent) => {
      // Don't hijack keys while typing in an input/textarea/select or
      // contenteditable (e.g. the sidebar search box).
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') prevPage();
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') { e.preventDefault(); nextPage(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeTab, prevPage, nextPage]);

  const innerContent = (
    <div ref={containerRef} className="relative flex min-h-0 flex-1 flex-col">
          {/* Edit mode */}
          {activeTab === 'edit' && (
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              <textarea value={text} onChange={(e) => onTextChange(e.target.value)}
                placeholder={t('placeholder.paste_l2_text', { l2: l2.name })}
                className="min-h-0 flex-1 w-full rounded-lg border border-border bg-background p-4 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-none"
                dir={l2.direction === 'rtl' ? 'rtl' : 'ltr'} lang={l2.code} />
              <div className="flex-shrink-0 flex gap-2">
                {getSampleText(l2.code) && (
                  <Button variant="outline" size="sm" className="flex-1"
                    onClick={() => {
                      const sample = getSampleText(l2.code);
                      if (sample) onFillSample(sample.text, sample.title);
                    }}>
                    <Sparkles className="mr-1 h-3.5 w-3.5" />{t('action.fill_with_sample')}
                  </Button>
                )}
                <Button size="sm" className="flex-1" onClick={onTokenize}>
                  <Sparkles className="mr-1 h-3.5 w-3.5" />{t('action.tokenize')}
                </Button>
              </div>
            </div>
          )}

          {/* Read mode — paginated */}
          {activeTab === 'read' && text && (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 overflow-auto">
                <div
                  className="[&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mt-0 [&_h1]:mb-0
                  [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-0 [&_h2]:mb-0
                  [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-0 [&_h3]:mb-0
                  [&_h4]:text-base [&_h4]:font-semibold [&_h4]:mt-0 [&_h4]:mb-0
                  [&_p]:mb-0 [&_p]:leading-relaxed
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
                  lang={l2.code} dir={l2.direction === 'rtl' ? 'rtl' : 'ltr'}
                >
                  {/* State 1: measuring — loading indicator, no raw text flash */}
                  {!hasMeasured && blocks && (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  )}
                  {/* State 1b: loading tokens — show spinner above paginated content */}
                  {hasMeasured && loadingTokens && blocks && (
                    <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" /> {t('msg.making_words_interactive')}
                    </div>
                  )}
                  {/* State 2: ready — paginated with tokens */}
                  {hasMeasured && allTokensReady && visibleBlocks && blocks && (
                    <>
                      <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
                        <Sparkles className="h-3 w-3" /> {t('msg.tap_any_word_to_lookup')}
                      </div>
                      {visibleBlocks.map((block, i) => {
                        if (block.kind === 'markdown') {
                          return (
                            <div key={i}>
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={markdownComponents}
                              >
                                {block.raw}
                              </ReactMarkdown>
                            </div>
                          );
                        }
                        const tb = block as TextBlock;
                        // Translation lookup is keyed by the block's own text
                        // hash, so a stale or misaligned response can never be
                        // attached to a different block.
                        const blockKey = md5(tb.text);
                        const Tag = blockTag(tb);
                        // Find the original index of this block in the full blocks array
                        const globalIndex = blocks!.indexOf(block);
                        const textBlockIndex = blocks!.slice(0, globalIndex).filter((b): b is TextBlock => b.kind === 'text').length;
                        const cachedTokens = tokenCache[textBlockIndex];
                        // First link in the block — surfaced as an
                        // "Open in Reader" action in the token dictionary popup.
                        // Without a custom handler, only http(s) links qualify.
                        const blockHref = tb.formats.find(
                          f => f.type === 'link' && (onOpenLink ? true : /^https?:\/\//i.test(f.url ?? '')),
                        )?.url;
                        return (
                          <TextActionMenu key={i} text={tb.text} l2Code={l2.code} l1Code={l1.code}
                            translation={showTranslation ? blockTranslations[blockKey] : undefined}
                            translationClass={translationClass(tb)}
                            loading={isAutoTranslating && !blockTranslations[blockKey]}>
                            <Tag className={blockClass(tb)}>
                              <TokenizedText text={tb.text} l2Code={l2.code} textScale={0} context={ctx}
                                tokens={cachedTokens} formats={tb.formats} href={blockHref} onOpenLink={onOpenLink}
                                deferTokenization={!!onLemmatize} selectionMenu />
                            </Tag>
                          </TextActionMenu>
                        );
                      })}
                    </>
                  )}
                  {/* State 3: no blocks yet — fallback */}
                  {!blocks && text && (
                    <TextActionMenu text={stripMarkdown(text)} l2Code={l2.code} l1Code={l1.code}>
                      <TokenizedText text={stripMarkdown(text)} l2Code={l2.code} textScale={1.15} context={ctx} selectionMenu />
                    </TextActionMenu>
                  )}
                </div>
              </div>
              {/* Page navigation + translate */}
              <div className="flex-shrink-0 flex items-center justify-center gap-3 border-t border-border py-2 text-xs text-muted-foreground">
                <button onClick={prevPage} disabled={page === 0}
                  className="rounded p-1 hover:bg-muted disabled:opacity-30">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span>{page + 1} / {totalPages}</span>
                <button onClick={nextPage} disabled={page >= totalPages - 1}
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
            </div>
          )}

          {/* Hidden measuring div — renders ALL blocks to calculate page breaks */}
          <div
            ref={measureRef}
            aria-hidden="true"
            className="absolute inset-x-0 top-0 -z-10 overflow-hidden opacity-0 pointer-events-none"
            style={{ height: '100%' }}
          >
            {activeTab === 'read' && blocks && blocks.map((block, i) => {
              if (block.kind === 'markdown') {
                return (
                  <div key={i} className="mb-4">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={markdownComponents}
                    >
                      {block.raw}
                    </ReactMarkdown>
                    {showTranslation && <div className="h-6" />}
                  </div>
                );
              }
              const tb = block as TextBlock;
              const Tag = blockTag(tb);
              const lines = Math.max(1, Math.ceil(tb.text.length / 50));
              return (
                <div key={i} className="mb-4">
                  <Tag className={blockClass(tb)}>
                    {tb.text}
                  </Tag>
                  {showTranslation && (
                    <div className="flex flex-col gap-y-1.5 pt-1">
                      {Array.from({ length: lines }).map((_, li) => (
                        <div key={li} className="h-3.5" />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Empty state */}
          {activeTab === 'read' && !text && !loading && (
            <div className="flex min-h-[40vh] flex-col items-center justify-center text-center">
              <FileText className="mb-3 h-12 w-12 text-muted-foreground/40" />
              <h2 className="text-lg font-semibold text-muted-foreground">{t('title.notes_reader')}</h2>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                {t('msg.reader_empty_state')}
              </p>
              <div className="mt-4 flex gap-2">
                {hasNotes && onOpenSidebar && !sidebarVisible && (
                  <Button variant="outline" size="sm" onClick={onOpenSidebar}>
                    <PanelRight className="mr-1 h-4 w-4" />{t('action.my_notes')}
                  </Button>
                )}
                {onNewNote && (
                  <Button variant="outline" size="sm" onClick={onNewNote}>
                    <Plus className="mr-1 h-4 w-4" />{t('action.new_note')}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      );

  return (
    <div className="min-w-0 flex-1 flex flex-col min-h-0">
      {/* Mode toggle buttons */}
      {!hideModeTabs && (
        <div className="flex gap-1 border-b border-border px-1 pt-1 pb-[10px] mb-2">
          <button
            onClick={() => activeTab === 'read' ? onTabChange('edit') : undefined}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === 'edit'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <FileText className="h-4 w-4" />
            {t('action.edit')}
          </button>
          <button
            onClick={() => {
              if (activeTab === 'read') return;
              onTokenize();
            }}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === 'read'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <BookOpen className="h-4 w-4" />
            {t('action.read')}
          </button>
        </div>
      )}
      <div className="flex-1 min-h-0 flex flex-col">
        {innerContent}
      </div>
    </div>
  );
}
