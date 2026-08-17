'use client';

import { useState, useCallback, useMemo, type JSX } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useRouter } from 'next/navigation';
import { loadSampleContent, type LemmatizedToken, type SavedWordContext } from '@langplayer/shared';
import { useT } from '@/hooks/use-t';
import { useTextScale } from '@/hooks/use-text-scale';
import { useSettingsContext } from '@/providers/settings-provider';
import { TokenizedText } from '@/components/tokenized-text';
import { TextActionMenu } from '@/components/text-action-menu';
import { translationFontSizeRem } from '@/lib/reader-text-size';
import { Button } from '@/components/ui/button';
import {
  PaginatedReader,
  type BlockRenderCtx,
  type ReaderPageItem,
} from '@/components/reader/paginated-reader';
import {
  SentenceHighlightBlock,
} from '@/components/reader/sentence-highlight';
import { type ReaderBlock, type TextBlock } from '@/lib/parse-markdown';
import { languageName } from '@/lib/language-data';
import {
  BookOpen, Loader2, FileText, Sparkles, Plus, PanelRight,
} from 'lucide-react';

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

/** Muted variant for translation text. Font size is set explicitly via
 *  `translationFontSize` (`TRANSLATION_FACTOR` × the L2 rendered size), so
 *  these classes only carry non-size styling. */
function translationClass(tb: TextBlock): string {
  const b = 'leading-relaxed';
  switch (tb.type) {
    case 'heading': return `${b} font-semibold`;
    case 'blockquote': return `${b} border-l-4 border-muted/40 pl-4 italic`;
    default: return `${b}`;
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
}: ReaderPanelProps) {
  const t = useT();
  const router = useRouter();
  const { display } = useSettingsContext();
  const showTranslation = display.translation;
  // Reader headings keep their natural size and scale via the container zoom;
  // body blocks scale through TokenizedText's own zoom (SPEC-051).
  const textZoom = useTextScale();

  // Layout identity: any change re-measures page breaks (SPEC-077 §9 policy,
  // measurement-based).
  const measureNonce = `${textZoom}:${showTranslation ? 1 : 0}`;

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
        <div key={item.key}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={markdownComponents}
          >
            {item.block.raw}
          </ReactMarkdown>
        </div>
      );
    }
    const tb = item.block as TextBlock;
    const Tag = blockTag(tb);
    // First link in the block — surfaced as an "Open in Reader" action in
    // the token dictionary popup. Without a custom handler, only http(s)
    // links qualify.
    const blockHref = tb.formats.find(
      f => f.type === 'link' && (onOpenLink ? true : /^https?:\/\//i.test(f.url ?? '')),
    )?.url;
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
            translationZoom={textZoom}
            translationFontSize={translationFontSizeRem(tb, textZoom)}
            loading={rctx.isTranslating && !rctx.translation}>
            <Tag
              className={blockClass(tb)}
              style={tb.type === 'heading' ? { zoom: textZoom } : undefined}
            >
              <TokenizedText text={tb.text} l2Code={l2.code}
                inheritSize={tb.type === 'heading'} context={ctx}
                tokens={rctx.tokens} formats={tb.formats} href={blockHref} onOpenLink={onOpenLink}
                deferTokenization={!!onLemmatize} selectionDictionary
                onTokenHover={onTokenHover} />
            </Tag>
          </TextActionMenu>
        )}
      </SentenceHighlightBlock>
    );
  }, [showTranslation, textZoom, ctx, l2.code, l1.code, onOpenLink, markdownComponents, onLemmatize, measureNonce]);

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
        <Tag className={blockClass(tb)} style={{ zoom: textZoom }}>
          {tb.text}
        </Tag>
        {showTranslation && (
          <div className="flex flex-col gap-y-1.5 pt-1" style={{ fontSize: `${translationFontSizeRem(tb, textZoom)}rem` }}>
            {Array.from({ length: lines }).map((_, li) => (
              <div key={li} style={{ height: `${translationFontSizeRem(tb, textZoom)}rem` }} />
            ))}
          </div>
        )}
      </div>
    );
  }, [showTranslation, textZoom, markdownComponents]);

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
            dir={l2.direction === 'rtl' ? 'rtl' : 'ltr'} lang={l2.code} />
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
          onLemmatize={onLemmatize}
          onPageTranslate={onPageTranslate}
          header={
            <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
              <Sparkles className="h-3 w-3" /> {t('msg.tap_any_word_to_lookup')}
            </div>
          }
          contentClassName="[&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mt-0 [&_h1]:mb-0
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
    </div>
  );
}
