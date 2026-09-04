'use client';

import { useState, useEffect, useCallback, useMemo, type JSX } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useRouter } from 'next/navigation';
import { loadSampleContent, type LemmatizedToken, type SavedWordContext } from '@langplayer/shared';
import { useT } from '@/hooks/use-t';
import { useGlyphLang } from '@/hooks/use-glyph-lang';
import { useTextScale } from '@/hooks/use-text-scale';
import { useSettingsContext } from '@/providers/settings-provider';
import { translationFontSizeRem } from '@/lib/reader-text-size';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  PaginatedReader,
  type BlockRenderCtx,
  type ReaderLoc,
  type ReaderPageItem,
} from '@/components/reader/paginated-reader';
import { ReaderTextBlock, ReaderMarkdownBlock } from '@/components/reader/reader-block';
import { blockTag, blockClass, translationClass } from '@/components/reader/shared-reader-styles';
import { ReaderHeadingToc, extractHeadings, type ReaderHeading } from '@/components/reader/reader-heading-toc';
import { ReaderSearchPanel, type ReaderSearchResult } from '@/components/reader/reader-search-panel';
import { AiExplanation } from '@/components/ai-explanation';
import {
  READER_ASK_AI_TEXT_PRESETS,
  READER_ASK_AI_INITIAL_PRESET,
  truncateReaderAiContent,
  type ReaderAiContent,
} from '@langplayer/utils';
import { type FormatRange, type ReaderBlock, type TextBlock } from '@/lib/parse-markdown';
import { languageName } from '@/lib/language-data';
import {
  BookOpen, Loader2, FileText, Sparkles, Plus, PanelRight,
} from 'lucide-react';

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
  /** Called by the reader to lemmatize text blocks for the current page. */
  onLemmatize: (texts: string[]) => Promise<LemmatizedToken[][]>;
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
  /** Initial reading location to restore on mount (saved position). */
  initialLocation?: ReaderLoc | null;
  /** Called whenever the visible page's start changes (persist the position). */
  onLocationChange?: (loc: ReaderLoc) => void;
}

export function ReaderPanel({
  l2, l1,
  text, loading,
  activeTab,
  blocks,
  ctx,
  onTextChange,
  onTabChange,
  onTokenize, onFillSample, onPageTranslate,
  onLemmatize,
  onOpenLink,
  hideModeTabs = false,
  hasNotes = false,
  sidebarVisible = false,
  onNewNote,
  onOpenSidebar,
  initialLocation,
  onLocationChange,
}: ReaderPanelProps) {
  const t = useT();
  const router = useRouter();
  const { display, tokenizedText, updateDisplay } = useSettingsContext();
  const glyphLang = useGlyphLang(l2.code);
  const showTranslation = display.translation;
  const textZoom = useTextScale();

  // Splitter live state. During a drag the row re-splits immediately via
  // `liveSplit` (no persistence, no pagination re-measure); the final ratio
  // is committed once on release, persisting it and re-measuring page breaks.
  const [liveSplit, setLiveSplit] = useState(display.translationSplit);
  const persistedSplit = display.translationSplit;
  const appliedSplit = liveSplit;

  const onTranslationSplitChange = useCallback((r: number) => setLiveSplit(r), []);

  const onTranslationSplitCommit = useCallback((r: number) => {
    setLiveSplit(r);
    updateDisplay({ translationSplit: r });
  }, [updateDisplay]);

  // Keep the live value in sync if the persisted value changes externally
  // (e.g. another tab, or a settings update) while not mid-drag.
  useEffect(() => {
    setLiveSplit((prev) => (Math.abs(prev - persistedSplit) < 0.001 ? prev : persistedSplit));
  }, [persistedSplit]);

  // Layout identity: any change re-measures page breaks (SPEC-077 §9 policy,
  // measurement-based). Only the COMMITTED split participates, so a live drag
  // does not re-paginate on every pixel; re-measure happens on release.
  const measureNonce = `${textZoom}:${showTranslation ? 1 : 0}:${persistedSplit}:${tokenizedText.translationSize}`;

  // ── Table of contents + search (notes/web reader; SPEC-087 §8) ──
  // TOC is heading-derived and shown only when the text has headings (h1–h6);
  // search is always available when there is text.
  const [tocOpen, setTocOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  /** Pre-fill + auto-run search (quote chips) — `searchNonce` re-triggers. */
  const [searchQuery, setSearchQuery] = useState('');
  const [searchNonce, setSearchNonce] = useState(0);
  /** Reader "Ask AI" summary chat (SPEC-087 §…): current page text + dialog. */
  const [askAiOpen, setAskAiOpen] = useState(false);
  const [currentPageText, setCurrentPageText] = useState('');
  /** Active search-match highlight (block + char range), if any. */
  const [highlight, setHighlight] = useState<{ blockIndex: number; start: number; end: number } | null>(null);
  /** Jump target for the paginator (markdown readers pass `{ blockIndex }`). */
  const [jumpLoc, setJumpLoc] = useState<ReaderLoc | null>(null);
  /** Increment to re-apply `jumpLoc` after a jump. */
  const [jumpNonce, setJumpNonce] = useState(0);
  /** Reader's current block (for the TOC active-entry highlight). */
  const [currentBlockIndex, setCurrentBlockIndex] = useState<number | null>(null);

  const headings = useMemo(() => extractHeadings(blocks), [blocks]);

  const handleReaderLocationChange = useCallback((loc: ReaderLoc) => {
    if ('blockIndex' in loc) setCurrentBlockIndex(loc.blockIndex);
    onLocationChange?.(loc);
  }, [onLocationChange]);

  const openToc = useCallback(() => setTocOpen(true), []);
  const openSearch = useCallback(() => setSearchOpen(true), []);
  const openAskAi = useCallback(() => setAskAiOpen(true), []);
  /** Open the search panel pre-filled with a query (quote chip tap). */
  const openSearchFor = useCallback((query: string) => {
    setSearchQuery(query);
    setSearchNonce((n) => n + 1);
    setSearchOpen(true);
  }, []);

  const handleTocSelect = useCallback((heading: ReaderHeading) => {
    setTocOpen(false);
    setHighlight(null);
    setJumpLoc({ blockIndex: heading.blockIndex });
    setJumpNonce(n => n + 1);
  }, []);

  const handleSearchNavigate = useCallback((result: ReaderSearchResult) => {
    setSearchOpen(false);
    setHighlight({ blockIndex: result.blockIndex, ...result.match });
    setJumpLoc({ blockIndex: result.blockIndex });
    setJumpNonce(n => n + 1);
  }, []);

  // Markdown-block links (images, tables, raw-markdown fallbacks) open inside
  // the web reader instead of sending the user to the original site in a new
  // tab — matching how links behave in tokenized text.
  const openLinkInReader = useCallback((href: string) => {
    router.push(`/${l1.code}/${l2.code}/web-reader?url=${encodeURIComponent(href)}`);
  }, [router, l1.code, l2.code]);

  const markdownComponents = useMemo(() => ({
    a: ({ href, children, ...props }: any) => {
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

  /** Visible blocks — text blocks use TextActionMenu + TokenizedText;
   *  markdown-kind blocks (images, tables, raw fallbacks) render via
   *  ReactMarkdown. */
  const renderBlock = useCallback((item: ReaderPageItem, rctx: BlockRenderCtx) => {
    if (item.kind === 'markdown') {
      return (
        <ReaderMarkdownBlock key={item.key} raw={item.block.raw} components={markdownComponents} />
      );
    }
    const tb = item.block as TextBlock;
    // Append the search-match highlight range when this block contains it.
    const idx = (item.loc as { blockIndex: number }).blockIndex;
    let extraFormats: FormatRange[] = [];
    if (highlight && highlight.blockIndex === idx) {
      const start = Math.max(0, Math.min(highlight.start, tb.text.length));
      const end = Math.max(start, Math.min(highlight.end, tb.text.length));
      if (end > start) extraFormats = [{ start, end, type: 'highlight' as const }];
    }
    // First link in the block — surfaced as an "Open in Reader" action in
    // the token dictionary popup. Without a custom handler, only http(s)
    // links qualify.
    const blockHref = tb.formats.find(
      f => f.type === 'link' && (onOpenLink ? true : /^https?:\/\//i.test(f.url ?? '')),
    )?.url;
    return (
      <ReaderTextBlock
        key={item.key}
        block={tb}
        rctx={rctx}
        ctx={ctx}
        extraFormats={extraFormats}
        href={blockHref}
        onOpenLink={onOpenLink}
        deferTokenization={!!onLemmatize}
        measureNonce={measureNonce}
        translationSplit={appliedSplit}
        onTranslationSplitChange={onTranslationSplitChange}
        onTranslationSplitCommit={onTranslationSplitCommit}
        loading={rctx.isTranslating && !rctx.translation}
        l2Code={l2.code}
        l1Code={l1.code}
      />
    );
  }, [ctx, onOpenLink, markdownComponents, onLemmatize, measureNonce, appliedSplit, onTranslationSplitChange, onTranslationSplitCommit, highlight, l2.code, l1.code]);

  /** Mirror of the visible rendering for the measuring container — one root
   *  element per block, matching spacing, the translation skeleton, and the
   *  text-zoom the visible blocks render with. */
  const renderMeasureBlock = useCallback((item: ReaderPageItem) => {
    if (item.kind === 'markdown') {
      return (
        <div key={item.key} className="mb-4">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={markdownComponents}
          >
            {item.block.raw}
          </ReactMarkdown>
          {showTranslation && <div className="h-6" />}
        </div>
      );
    }
    const tb = item.block as TextBlock;
    const Tag = blockTag(tb);
    const lines = Math.max(1, Math.ceil(tb.text.length / 50));
    return (
      <div key={item.key} className="mb-4">
        {/* Mirrors TextActionMenu's dual-column layout: stacked below md,
            side-by-side at md+ (the translation is a flex sibling, not a
            stacked block) — otherwise the mirror measures taller than the
            visible row and pages break early. */}
        <div className="flex flex-col gap-y-2 md:flex-row md:gap-2 md:items-start">
          <div className="flex-[3] min-w-0">
            <Tag className={blockClass(tb)} style={{ zoom: textZoom }}>
              {tb.text}
            </Tag>
          </div>
          {showTranslation && (
            <div
              className="flex-[2] min-w-0 pt-1 md:pt-0"
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
      </div>
    );
  }, [showTranslation, textZoom, markdownComponents, tokenizedText.translationSize]);

  const [loadingSample, setLoadingSample] = useState(false);

  // Load the per-language sample (long for popular L2s, short otherwise) into
  // the editor. Lazily imports only the language's chunk on web.
  const handleAddSampleText = useCallback(async () => {
    setLoadingSample(true);
    try {
      const content = await loadSampleContent(l2.code);
      onFillSample(content.long ?? content.short, content.title);
    } catch {
      // Sample load failed — leave the editor untouched.
    } finally {
      setLoadingSample(false);
    }
  }, [l2.code, onFillSample]);

  const innerContent = (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* Edit mode */}
      {activeTab === 'edit' && (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <textarea value={text} onChange={(e) => onTextChange(e.target.value)}
            placeholder={t('placeholder.paste_l2_text', { l2: languageName(l2.code, l1.code) })}
            className="min-h-0 flex-1 w-full rounded-lg border border-border bg-background p-4 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-none"
            dir={l2.direction === 'rtl' ? 'rtl' : 'ltr'} lang={glyphLang} />
          <div className="flex-shrink-0 flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={handleAddSampleText}
              disabled={loadingSample}
            >
              {loadingSample ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="mr-1 h-3.5 w-3.5" />
              )}
              {t('action.add_sample_text')}
            </Button>
            <Button size="sm" className="flex-1" onClick={onTokenize}>
              <Sparkles className="mr-1 h-3.5 w-3.5" />{t('action.tokenize')}
            </Button>
          </div>
        </div>
      )}

      {/* Read mode — shared paginated reader */}
      {activeTab === 'read' && text && (
        <PaginatedReader
          blocks={blocks}
          text={text}
          l1={l1} l2={l2}
          ctx={ctx}
          measureNonce={measureNonce}
          initialLocation={initialLocation}
          onLocationChange={handleReaderLocationChange}
          onLemmatize={onLemmatize}
          onPageTranslate={onPageTranslate}
          location={jumpLoc}
          jumpNonce={jumpNonce}
          onOpenToc={headings.length > 0 ? openToc : undefined}
          onOpenSearch={openSearch}
          onOpenAskAi={openAskAi}
          onPageTextChange={setCurrentPageText}
          contentClassName="[&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mt-0 [&_h1]:mb-0
            [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-0 [&_h2]:mb-0
            [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-0 [&_h3]:mb-0
            [&_h4]:text-base [&_h4]:font-semibold [&_h4]:mt-0 [&_h4]:mb-0
            [&_p]:mb-0 [&_p]:leading-relaxed
            [&_ul]:list-disc [&_ul]:ml-6 [&_ul]:mb-0
            [&_ol]:list-decimal [&_ol]:ml-6 [&_ol]:mb-0
            [&_li]:mb-0 [&_li]:leading-relaxed
            [&_blockquote]:border-l-4 [&_blockquote]:border-muted [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground [&_blockquote]:mb-0
            [&_img]:max-w-full [&_img]:max-h-[var(--reader-page-height)] [&_img]:w-auto [&_img]:h-auto [&_img]:object-contain [&_img]:rounded-lg [&_img]:my-4
            [&_a]:text-primary [&_a]:underline [&_a]:hover:no-underline
            [&_table]:w-full [&_table]:border-collapse [&_table]:mb-4
            [&_th]:border [&_th]:border-border [&_th]:px-3 [&_th]:py-1 [&_th]:text-left
            [&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-1
            [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-sm [&_code]:font-mono
            [&_pre]:bg-muted [&_pre]:p-4 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre]:mb-0
            [&_hr]:border-border [&_hr]:my-6"
          renderBlock={renderBlock}
          renderMeasureBlock={renderMeasureBlock}
        />
      )}

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

      {/* ── Table of contents modal (heading-derived, nested) ── */}
      {headings.length > 0 && (
        <Dialog open={tocOpen} onOpenChange={setTocOpen}>
          <DialogContent className="flex max-h-[80vh] flex-col sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{t('action.table_of_contents')}</DialogTitle>
            </DialogHeader>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <ReaderHeadingToc
                headings={headings}
                activeIndex={currentBlockIndex ?? (initialLocation && 'blockIndex' in initialLocation ? initialLocation.blockIndex : null)}
                onSelect={handleTocSelect}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Search modal (block navigation + term highlight) ── */}
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="flex h-[min(70vh,560px)] flex-col sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('action.search')}</DialogTitle>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col">
            <ReaderSearchPanel
              blocks={blocks}
              onNavigate={handleSearchNavigate}
              initialQuery={searchQuery}
              queryNonce={searchNonce}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* ── "Ask AI" summary chat — opens on the toolbar button, auto-summarizes
          the current page, and preloads the summary follow-up buttons. ── */}
      <Dialog open={askAiOpen} onOpenChange={setAskAiOpen}>
        <DialogContent className="flex h-[min(70vh,560px)] flex-col sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('action.ask_ai')}</DialogTitle>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <AiExplanation
              word={ctx.textTitle || t('title.web_reader')}
              contextText={undefined}
              contextForm={undefined}
              entryFound={true}
              autoLoad
              followUpPresets={READER_ASK_AI_TEXT_PRESETS}
              initialPreset={READER_ASK_AI_INITIAL_PRESET}
              quoteChips
              onQuotePress={openSearchFor}
              readerContent={
                {
                  text: truncateReaderAiContent(text),
                  page: truncateReaderAiContent(currentPageText),
                  chapter: null,
                  bookUpToChapter: null,
                } satisfies ReaderAiContent
              }
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
