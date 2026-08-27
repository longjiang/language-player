'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useSettingsContext } from '@/providers/settings-provider';
import { useTextScale } from '@/hooks/use-text-scale';
import { TokenizedText } from '@/components/tokenized-text';
import { TextActionMenu } from '@/components/text-action-menu';
import { SentenceHighlightBlock } from '@/components/reader/sentence-highlight';
import {
  blockTag,
  blockClass,
  translationClass,
} from '@/components/reader/shared-reader-styles';
import { translationFontSizeRem } from '@/lib/reader-text-size';
import type { FormatRange, TextBlock } from '@/lib/parse-markdown';
import type { LemmatizedToken, SavedWordContext } from '@langplayer/shared';

/**
 * Shared per-block renderers for the web readers (spec-077/SPEC-032).
 *
 * The EPUB reader, the notes/web/image `ReaderPanel`, and the PDF reader all
 * page through the SAME `PaginatedReader`; the only thing they inject is a
 * `renderBlock` / `renderMeasureBlock`. Those three `renderBlock`s were near
 * identical except for markdown link parsing, image handling, and — for the
 * PDF reader — a simplified renderer that dropped the baseline-aligned
 * translation. These two components are the single home for that block
 * rendering, so every reader gets identical sentence-highlighted,
 * baseline-aligned translation, and only the small, reader-specific bits
 * (markdown url transform, link handler, search highlight, deferred
 * tokenization) are passed in as props.
 *
 * Each reader still supplies its own `renderMeasureBlock` (the measuring
 * mirror) because it is tuned per reader (ruby/phonetics line-height
 * estimates for EPUB) and is independent of the visible block rendering.
 */

export interface ReaderTextBlockProps {
  /** The markdown text block being rendered. */
  block: TextBlock;
  /** Live pagination context for the block (tokens, translation, loading). */
  rctx: {
    tokens?: LemmatizedToken[];
    translation?: string;
    isTranslating?: boolean;
  };
  /** Saved-word context passed to TokenizedText. */
  ctx?: Partial<SavedWordContext>;
  /** Extra format ranges appended to the block's own (e.g. a search match). */
  extraFormats?: FormatRange[];
  /** URL of the block's first link, surfaced as an "Open in Reader" action. */
  href?: string;
  /** Resolve a tapped link (in-book navigation for EPUB, in-reader for others). */
  onOpenLink?: (href: string) => void;
  /** Wait for server tokens instead of tokenizing synchronously (notes reader). */
  deferTokenization?: boolean;
  /** Layout identity — re-measure/re-align when it changes. */
  measureNonce?: string | number;
  /** Fraction of the side-by-side row given to the L2 column (draggable split). */
  translationSplit?: number;
  onTranslationSplitChange?: (ratio: number) => void;
  onTranslationSplitCommit?: (ratio: number) => void;
  /** L2↔translation column gap (px). Omit to use the default split gap. */
  sideBySideGapPx?: number;
  /** Whether to render the translation-loading skeleton. Defaults to
   *  "translation on but none present yet"; readers may refine (e.g. the
   *  notes reader only while a request is actually in flight). */
  loading?: boolean;
  l2Code: string;
  l1Code: string;
}

/**
 * Render one visible text block with baseline-aligned, sentence-highlighted
 * translation (the aligned-reader path), topped with the TextActionMenu so
 * word actions (copy/speak/explain/translate) and the token dictionary work.
 */
export function ReaderTextBlock({
  block,
  rctx,
  ctx,
  extraFormats,
  href,
  onOpenLink,
  deferTokenization,
  measureNonce,
  translationSplit,
  onTranslationSplitChange,
  onTranslationSplitCommit,
  sideBySideGapPx,
  loading: loadingProp,
  l2Code,
  l1Code,
}: ReaderTextBlockProps) {
  const { display, tokenizedText } = useSettingsContext();
  const textZoom = useTextScale();
  const showTranslation = display.translation;
  const Tag = blockTag(block);
  const formats = extraFormats?.length ? [...block.formats, ...extraFormats] : block.formats;
  const translation = showTranslation ? (rctx.translation ?? null) : null;
  const isLoading = loadingProp ?? (showTranslation && !rctx.translation);

  return (
    <SentenceHighlightBlock text={block.text} translation={translation}>
      {({ map, activeSentence, onTokenHover }) => (
        <TextActionMenu
          text={block.text}
          l2Code={l2Code}
          l1Code={l1Code}
          translationAligned={showTranslation && rctx.translation ? {
            text: rctx.translation,
            map,
            active: activeSentence,
            measureNonce,
          } : null}
          translationClass={translationClass(block)}
          translationFontSize={translationFontSizeRem(block, textZoom, tokenizedText.translationSize)}
          translationSplit={translationSplit}
          onTranslationSplitChange={onTranslationSplitChange}
          onTranslationSplitCommit={onTranslationSplitCommit}
          sideBySideBreakpoint="md"
          sideBySideGapPx={sideBySideGapPx}
          loading={isLoading}
        >
          <Tag
            className={blockClass(block)}
            style={block.type === 'heading' ? { zoom: textZoom } : undefined}
          >
            <TokenizedText
              text={block.text}
              l2Code={l2Code}
              inheritSize={block.type === 'heading'}
              context={ctx}
              tokens={rctx.tokens}
              formats={formats}
              href={href}
              onOpenLink={onOpenLink}
              selectionDictionary
              deferTokenization={deferTokenization}
              onTokenHover={onTokenHover}
            />
          </Tag>
        </TextActionMenu>
      )}
    </SentenceHighlightBlock>
  );
}

/** Render one visible markdown-kind block (images, tables, raw fallbacks). */
export function ReaderMarkdownBlock({
  raw,
  components,
  urlTransform,
}: {
  raw: string;
  /** Reader-specific ReactMarkdown component overrides (e.g. link handling). */
  components?: Record<string, React.ComponentType<any>>;
  /** Reader-specific URL transform (EPUB preserves blob:/data: image URLs). */
  urlTransform?: (url: string) => string;
}) {
  return (
    <div>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={components}
        urlTransform={urlTransform}
      >
        {raw}
      </ReactMarkdown>
    </div>
  );
}


