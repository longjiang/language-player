'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { LemmatizedToken, SavedWordContext } from '@langplayer/shared';
import { useT } from '@/hooks/use-t';
import { useSettingsContext } from '@/providers/settings-provider';
import { TokenizedText } from '@/components/tokenized-text';
import { TextActionMenu } from '@/components/text-action-menu';
import { Button } from '@/components/ui/button';
import { parseMarkdown, type ReaderBlock, type TextBlock } from '@/lib/parse-markdown';
import { getSampleText } from '@/lib/sample-texts';
import { TabbedPanel } from '@/components/tabbed-panel';
import {
  BookOpen, Loader2, Globe, FileText, Sparkles,
  ChevronLeft, ChevronRight,
} from 'lucide-react';

function stripMarkdown(md: string): string {
  return md
    .replace(/#{1,6}\s/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1')
    .replace(/\*(.+?)\*/g, '$1').replace(/_(.+?)_/g, '$1')
    .replace(/```[\s\S]*?```/g, '').replace(/`(.+?)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/>\s/g, '')
    .replace(/[-*+]\s/g, '').replace(/\d+\.\s/g, '')
    .replace(/\n{3,}/g, '\n\n').trim();
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
      return `${b} ${s[tb.depth ?? 1] ?? 'text-base font-medium'} mb-3 mt-4`;
    }
    case 'paragraph': return `${b} mb-3`;
    case 'list-item': return `${b} mb-1 ml-4 list-disc`;
    case 'blockquote': return `${b} border-l-4 border-muted pl-4 italic text-muted-foreground mb-3`;
    default: return `${b} mb-3`;
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
  urlInput: string;
  translating: boolean;
  blocks: ReaderBlock[] | null;
  blockTokens: LemmatizedToken[][] | null;
  tokenizing: boolean;
  ctx: Partial<SavedWordContext>;
  onTextChange: (text: string) => void;
  onTabChange: (tab: 'edit' | 'read') => void;
  onUrlInputChange: (url: string) => void;
  onUrlSubmit: (url: string) => void;
  onTokenize: () => void;
  onFillSample: (text: string, title: string) => void;
  onPageTranslate: (texts: string[]) => Promise<string[]>;
  /** Called when the visible page changes — gives the first ~40 chars as anchor. */
  onAnchorChange?: (anchor: string) => void;
  /** If set, seek to the page containing this anchor text after blocks load. */
  initialAnchor?: string | null;
}

export function ReaderPanel({
  l2, l1,
  text, loading,
  activeTab, urlInput,
  translating,
  blocks, blockTokens, tokenizing,
  ctx,
  onTextChange,
  onTabChange, onUrlInputChange, onUrlSubmit,
  onTokenize, onFillSample, onPageTranslate,
  onAnchorChange,
  initialAnchor,
}: ReaderPanelProps) {
  const t = useT();
  const { display, updateDisplay } = useSettingsContext();
  const showTranslation = display.translation;
  const measureRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const [pageBreaks, setPageBreaks] = useState<number[]>([]);
  const totalPages = Math.max(1, pageBreaks.length + 1);
  const [blockTranslations, setBlockTranslations] = useState<Record<number, string>>({});

  // Clear translations when blocks change (new note / re-tokenize / page turn)
  const prevBlocksRef = useRef(blocks);
  useEffect(() => {
    if (prevBlocksRef.current !== blocks) {
      setBlockTranslations({});
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
    container.style.height = (containerRef.current?.clientHeight || window.innerHeight - 160) + 'px';

    // Double rAF to ensure layout is complete
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const children = Array.from(container.children) as HTMLElement[];
        if (children.length === 0) { setPageBreaks([]); setPage(0); return; }

        const maxHeight = container.clientHeight || window.innerHeight - 160;
        const breaks: number[] = [];
        let accumulated = 0;

        for (let i = 0; i < children.length; i++) {
          const el = children[i]!;
          const style = getComputedStyle(el);
          const h = el.offsetHeight + parseFloat(style.marginTop || '0') + parseFloat(style.marginBottom || '0');
          if (accumulated + h > maxHeight && accumulated > 0) {
            breaks.push(i);
            accumulated = h;
          } else {
            accumulated += h;
          }
        }

        setPageBreaks(breaks);
        setPage(0);
      });
    });
  }, [text, blocks, blockTokens, activeTab]);

  // Get blocks for the current page
  const visibleBlocks = (() => {
    if (!blocks || pageBreaks.length === 0) return blocks;
    const start = page === 0 ? 0 : pageBreaks[page - 1]!;
    const end = page < pageBreaks.length ? pageBreaks[page]! : blocks.length;
    return blocks.slice(start, end);
  })();

  const prevPage = useCallback(() => {
    if (page <= 0) return;
    setPage(p => p - 1);
    setBlockTranslations({});
  }, [page]);
  const nextPage = useCallback(() => {
    if (page >= totalPages - 1) return;
    setPage(p => p + 1);
    setBlockTranslations({});
  }, [page, totalPages]);

  // Report anchor on page change
  const prevPageRef = useRef(page);
  useEffect(() => {
    if (prevPageRef.current === page || !onAnchorChange) return;
    prevPageRef.current = page;
    const first = visibleBlocks?.find((b): b is TextBlock => b.kind === 'text');
    if (first) onAnchorChange(first.text.slice(0, 40));
  }, [page, visibleBlocks, onAnchorChange]);

  // Seek to initialAnchor on first blocks load
  const initialAnchorSeen = useRef(false);
  useEffect(() => {
    if (!initialAnchor || !blocks || !blockTokens || tokenizing) return;
    if (initialAnchorSeen.current) return;
    initialAnchorSeen.current = true;
    // Find which page contains the anchor text
    if (pageBreaks.length === 0) return;
    for (let p = 0; p <= pageBreaks.length; p++) {
      const start = p === 0 ? 0 : pageBreaks[p - 1]!;
      const end = p < pageBreaks.length ? pageBreaks[p]! : blocks.length;
      const pageBlocks = blocks.slice(start, end);
      const hasAnchor = pageBlocks.some((b): b is TextBlock =>
        b.kind === 'text' && b.text.includes(initialAnchor)
      );
      if (hasAnchor) { setPage(p); break; }
    }
  }, [initialAnchor, blocks, blockTokens, tokenizing, pageBreaks]);

  // Auto-translate on page advance (only when translation is enabled)
  useEffect(() => {
    if (!showTranslation || !visibleBlocks || !blockTokens || tokenizing || translating) return;
    const textBlocks = visibleBlocks.filter((b): b is TextBlock => b.kind === 'text');
    if (textBlocks.length === 0) return;
    // Only auto-translate if no cached translations exist for this page
    const hasAny = Object.keys(blockTranslations).length > 0;
    if (hasAny) return;
    const texts = textBlocks.map(b => b.text);
    onPageTranslate(texts).then(translated => {
      if (translated.length > 0) {
        const map: Record<number, string> = {};
        textBlocks.forEach((_, i) => {
          if (i < translated.length) map[i] = translated[i]!;
        });
        setBlockTranslations(map);
      }
    });
    // Only run once per visibleBlocks identity — no deps on blockTranslations
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleBlocks, blockTokens, tokenizing, translating, showTranslation]);

  // Keyboard navigation
  useEffect(() => {
    if (activeTab !== 'read') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') prevPage();
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') { e.preventDefault(); nextPage(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeTab, prevPage, nextPage]);

  const readerTabs = [
    { key: 'edit', label: t('action.edit'), icon: <FileText className="h-4 w-4" /> },
    { key: 'read', label: t('action.read'), icon: <BookOpen className="h-4 w-4" /> },
  ] as const;

  return (
    <div className="min-w-0 flex-1">
      <TabbedPanel
        tabs={readerTabs}
        activeTab={activeTab}
        onTabChange={onTabChange}
        onTabClick={(key) => key === 'read' ? onTokenize() : onTabChange(key)}
        className="h-[calc(100vh-7.5rem)]"
        contentClassName="p-4"
      >
        <div ref={containerRef} className="relative flex min-h-0 flex-1 flex-col h-full">
          {/* URL input */}
          <form onSubmit={(e) => { e.preventDefault(); if (urlInput.trim()) onUrlSubmit(urlInput.trim()); }} className="mb-4 flex gap-2">
            <div className="relative flex-1">
              <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input type="url" value={urlInput} onChange={(e) => onUrlInputChange(e.target.value)}
                placeholder={t('placeholder.paste_url', { l2: l2.name })}
                className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
            </div>
            <Button type="submit" size="sm" disabled={!urlInput.trim() || loading}>{t('action.load')}</Button>
          </form>

          {/* Edit mode */}
          {activeTab === 'edit' && (
            <div className="space-y-3">
              <textarea value={text} onChange={(e) => onTextChange(e.target.value)}
                placeholder={t('placeholder.paste_l2_text', { l2: l2.name })}
                className="min-h-[40vh] w-full rounded-lg border border-border bg-background p-4 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                dir={l2.direction === 'rtl' ? 'rtl' : 'ltr'} lang={l2.code} />
              <div className="flex gap-2">
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
                  className="[&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mt-6 [&_h1]:mb-4
                  [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-5 [&_h2]:mb-3
                  [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-2
                  [&_h4]:text-base [&_h4]:font-semibold [&_h4]:mt-3 [&_h4]:mb-1
                  [&_p]:mb-3 [&_p]:leading-relaxed
                  [&_ul]:list-disc [&_ul]:ml-6 [&_ul]:mb-3
                  [&_ol]:list-decimal [&_ol]:ml-6 [&_ol]:mb-3
                  [&_li]:mb-1 [&_li]:leading-relaxed
                  [&_blockquote]:border-l-4 [&_blockquote]:border-muted [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground [&_blockquote]:mb-3
                  [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-lg [&_img]:my-4
                  [&_a]:text-primary [&_a]:underline [&_a]:hover:no-underline
                  [&_table]:w-full [&_table]:border-collapse [&_table]:mb-4
                  [&_th]:border [&_th]:border-border [&_th]:px-3 [&_th]:py-1 [&_th]:text-left
                  [&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-1
                  [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-sm [&_code]:font-mono
                  [&_pre]:bg-muted [&_pre]:p-4 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre]:mb-4
                  [&_hr]:border-border [&_hr]:my-6"
                  lang={l2.code} dir={l2.direction === 'rtl' ? 'rtl' : 'ltr'}
                >
                  {(!visibleBlocks || tokenizing) && (
                    <>
                      {tokenizing && (
                        <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
                          <Loader2 className="h-3 w-3 animate-spin" /> {t('msg.making_words_interactive')}
                        </div>
                      )}
                      <div>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
                      </div>
                    </>
                  )}
                  {visibleBlocks && blockTokens && !tokenizing && (
                    <>
                      <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
                        <Sparkles className="h-3 w-3" /> {t('msg.tap_any_word_to_lookup')}
                      </div>
                      {visibleBlocks.map((block, i) => {
                        if (block.kind === 'markdown') {
                          return <div key={i}><ReactMarkdown remarkPlugins={[remarkGfm]}>{block.raw}</ReactMarkdown></div>;
                        }
                        const tb = block as TextBlock;
                        const Tag = blockTag(tb);
                        // Find the original index of this block in the full blocks array
                        const globalIndex = blocks!.indexOf(block);
                        const textBlockIndex = blocks!.slice(0, globalIndex).filter((b): b is TextBlock => b.kind === 'text').length;
                        return (
                          <TextActionMenu key={i} text={tb.text} l2Code={l2.code} l1Code={l1.code}
                            translation={showTranslation ? blockTranslations[i] : undefined} translationClass={translationClass(tb)}>
                            <Tag className={blockClass(tb)}>
                              <TokenizedText text={tb.text} l2Code={l2.code} textScale={0} context={ctx}
                                tokens={blockTokens[textBlockIndex]} />
                            </Tag>
                          </TextActionMenu>
                        );
                      })}
                    </>
                  )}
                  {!visibleBlocks && (
                    <TextActionMenu text={stripMarkdown(text)} l2Code={l2.code} l1Code={l1.code}>
                      <TokenizedText text={stripMarkdown(text)} l2Code={l2.code} textScale={1.15} context={ctx} />
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
                  <span className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input type="checkbox" checked={showTranslation}
                      onChange={e => updateDisplay({ translation: e.target.checked })}
                      className="sr-only peer" />
                    <div className="w-9 h-5 bg-muted rounded-full peer peer-checked:bg-primary peer-focus:ring-2 peer-focus:ring-primary/20 after:content-[''] after:absolute after:top-0.5 after:start-[2px] after:bg-background after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full" />
                  </span>
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
            {activeTab === 'read' && blocks && blockTokens && !tokenizing && blocks.map((block, i) => {
              if (block.kind === 'markdown') {
                return <div key={i}><ReactMarkdown remarkPlugins={[remarkGfm]}>{block.raw}</ReactMarkdown></div>;
              }
              const tb = block as TextBlock;
              const Tag = blockTag(tb);
              // Calculate textBlockIndex from the FULL blocks array
              const textBlockIndex = blocks.slice(0, i).filter((b): b is TextBlock => b.kind === 'text').length;
              return (
                <Tag key={i} className={blockClass(tb)}>
                  {tb.text}
                </Tag>
              );
            })}
          </div>

          {/* Empty state */}
          {activeTab === 'read' && !text && !loading && (
            <div className="flex min-h-[40vh] flex-col items-center justify-center text-center">
              <BookOpen className="mb-3 h-12 w-12 text-muted-foreground/40" />
              <h2 className="text-lg font-semibold text-muted-foreground">{t('title.reader')}</h2>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                {t('msg.reader_empty_state', { l2: l2.name })}
              </p>
              <Button variant="outline" size="sm" className="mt-4" onClick={() => onTabChange('edit')}>
                <FileText className="mr-1 h-4 w-4" />{t('action.start_writing')}
              </Button>
            </div>
          )}
        </div>
      </TabbedPanel>
    </div>
  );
}
