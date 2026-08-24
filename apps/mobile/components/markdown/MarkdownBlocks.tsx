import React, { Suspense, useMemo } from 'react';
import { View, Text, Image, useWindowDimensions } from 'react-native';
import type { ContentBlock, FormatRange, TextBlock } from '@langplayer/shared';

// Loaded on demand to break the static require cycle:
// TokenizedText → DictionaryPopup → AiExplanation → MarkdownExplanation →
// MarkdownBlocks → TokenizedText (Metro warns about the cycle; lazy-loading
// keeps rendering synchronous after first use).
const LazyTokenizedText = React.lazy(async () => ({
  default: (await import('@/components/TokenizedText')).TokenizedText,
}));

/** Unordered bullet glyphs by nesting depth. */
const BULLETS = ['•', '◦', '▪'] as const;

export interface MarkdownBlocksProps {
  blocks: ContentBlock[];
  /** When set, text blocks render via TokenizedText (L2 tokenization,
   *  clickable words); otherwise plain Text with inline formatting. */
  l2Code?: string;
  /**
   * How backticked (code-format) spans render when `l2Code` is set:
   * - `'code'` (default): monospace, part of the tokenized text (readers);
   * - `'tokenize'`: split out and rendered as interactive TokenizedText
   *   spans (AI explanations — backticked L2 words stay clickable).
   */
  codeSpans?: 'code' | 'tokenize';
  /** Open links inside the app (reader-style) instead of the OS browser. */
  onOpenLink?: (href: string) => void;
  /** Text scale multiplier for headings/paragraphs. */
  textScale?: number;
  /**
   * Line-height multiplier relative to the font size for paragraph text
   * (default 2.0, the `leading-loose` look). Pass 1.625 (Tailwind's
   * `leading-relaxed`) to match a surface that renders plain `text-sm
   * leading-relaxed` text while streaming — the finished parsed render then
   * keeps the same size AND leading (AI explanations, SPEC-083).
   */
  lineHeightScale?: number;
  /** Per-kind render overrides (e.g. docs TOC heading onLayout hooks). */
  ruleOverrides?: {
    /** Wrap (or replace) a rendered heading; `text` is the plain heading
     *  text (formats stripped), `children` the rendered heading content. */
    heading?: (depth: number, text: string, children: React.ReactNode) => React.ReactNode;
  };
}

/**
 * The single native markdown block renderer (SPEC-083).
 *
 * Renders the shared ContentBlock model with design tokens only. Text blocks
 * go through TokenizedText (formats map onto tokens) when an l2Code is given,
 * or through a plain formatted-Text fallback otherwise. Every markdown
 * surface (docs, AI explanations, readers) renders through this component.
 */
export function MarkdownBlocks({
  blocks,
  l2Code,
  codeSpans = 'code',
  onOpenLink,
  textScale = 1,
  lineHeightScale = 2,
  ruleOverrides,
}: MarkdownBlocksProps) {
  const { width: windowWidth } = useWindowDimensions();

  // Ordered-list numbering across flat blocks: consecutive list items that
  // share (listDepth, ordered, start) count up from `start`. Pure memo (no
  // render-time mutation — strict-mode safe).
  const orderedNumbers = useMemo(() => {
    const numbers = new Map<number, number>();
    const counters = new Map<string, number>();
    blocks.forEach((block, i) => {
      if (block.kind !== 'text' || block.type !== 'list-item' || !block.ordered) return;
      const key = `${block.listDepth ?? 0}:${block.start ?? 1}`;
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      numbers.set(i, next);
    });
    return numbers;
  }, [blocks]);

  return (
    <View>
      {blocks.map((block, i) => {
        switch (block.kind) {
          case 'text':
            return (
              <TextBlockView
                key={i}
                block={block}
                l2Code={l2Code}
                codeSpans={codeSpans}
                onOpenLink={onOpenLink}
                textScale={textScale}
                lineHeightScale={lineHeightScale}
                ruleOverrides={ruleOverrides}
                orderedNumber={orderedNumbers.get(i)}
              />
            );

          case 'code':
            return (
              <View key={i} className="my-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
                <Text className="font-mono text-xs leading-relaxed text-foreground">
                  {block.text}
                </Text>
              </View>
            );

          case 'hr':
            return <View key={i} className="my-3 h-px bg-border" />;

          case 'html':
            return (
              <View key={i} className="my-2 rounded-lg bg-muted/40 px-3 py-2">
                <Text className="font-mono text-xs leading-relaxed text-muted-foreground">
                  {block.text}
                </Text>
              </View>
            );

          case 'image':
            return (
              <View key={i} className="my-3 items-center">
                <Image
                  source={{ uri: block.uri }}
                  style={{ width: Math.min(windowWidth - 48, 560), height: (Math.min(windowWidth - 48, 560)) * 0.6 }}
                  resizeMode="contain"
                />
              </View>
            );

          case 'table':
            return (
              <View key={i} className="mb-3 overflow-hidden rounded-lg border border-border">
                <View className="flex-row bg-muted/50">
                  {block.header.map((cell, ci) => (
                    <View
                      key={ci}
                      className={`px-2 py-1.5 ${ci < block.header.length - 1 ? 'border-r border-border' : ''}`}
                      style={{ flex: 1 }}
                    >
                      <Text className="text-xs font-semibold text-foreground">{cell}</Text>
                    </View>
                  ))}
                </View>
                {block.rows.map((row, ri) => (
                  <View
                    key={ri}
                    className={`flex-row ${ri < block.rows.length - 1 ? 'border-b border-border' : ''}`}
                  >
                    {row.map((cell, ci) => (
                      <View
                        key={ci}
                        className={`px-2 py-1.5 ${ci < row.length - 1 ? 'border-r border-border' : ''}`}
                        style={{ flex: 1 }}
                      >
                        <Text className="text-xs text-foreground">{cell}</Text>
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            );

          default:
            return null;
        }
      })}
    </View>
  );
}

const HEADING_FONT: Record<number, number> = { 1: 24, 2: 20, 3: 17, 4: 16, 5: 16, 6: 16 };

function TextBlockView({
  block,
  l2Code,
  codeSpans,
  onOpenLink,
  textScale,
  lineHeightScale,
  ruleOverrides,
  orderedNumber,
}: {
  block: TextBlock;
  l2Code?: string;
  codeSpans: 'code' | 'tokenize';
  onOpenLink?: (href: string) => void;
  textScale: number;
  lineHeightScale: number;
  ruleOverrides?: MarkdownBlocksProps['ruleOverrides'];
  orderedNumber?: number;
}) {
  const isHeading = block.type === 'heading';
  const headingFactor = isHeading
    ? block.depth === 1 ? 1.5 : block.depth === 2 ? 1.25 : block.depth === 3 ? 1.125 : 1
    : 1;

  const content = l2Code ? (
    codeSpans === 'tokenize' ? (
      <TokenizedCodeSpans
        block={block}
        l2Code={l2Code}
        onOpenLink={onOpenLink}
        fontSize={(isHeading ? HEADING_FONT[block.depth ?? 1] : 16) * textScale * headingFactor}
        textScale={textScale * headingFactor}
        lineHeightScale={lineHeightScale}
      />
    ) : (
      <TokenizedTextLazy
        text={block.text}
        l2Code={l2Code}
        formats={block.formats}
        onOpenLink={onOpenLink}
        textScale={textScale * headingFactor}
        bold={isHeading}
      />
    )
  ) : (
    <FormattedText
      text={block.text}
      formats={block.formats}
      fontSize={(isHeading ? HEADING_FONT[block.depth ?? 1] : 16) * textScale}
      lineHeightScale={lineHeightScale}
      bold={isHeading}
    />
  );

  let wrapped: React.ReactNode = content;
  if (isHeading && ruleOverrides?.heading) {
    wrapped = ruleOverrides.heading(block.depth ?? 1, block.text, content);
  }

  switch (block.type) {
    case 'heading':
      return <View className="mb-2 mt-1">{wrapped}</View>;

    case 'blockquote':
      return (
        <View className="mb-3 border-l-2 border-muted-foreground/30 pl-3">
          <View className="opacity-90">{wrapped}</View>
        </View>
      );

    case 'list-item': {
      const indent = (block.listDepth ?? 0) * 16;
      const marker = block.ordered
        ? `${orderedNumber ?? block.start ?? 1}.`
        : BULLETS[Math.min(block.listDepth ?? 0, BULLETS.length - 1)];
      return (
        <View className="mb-1 flex-row" style={{ paddingLeft: 8 + indent }}>
          <Text className="mr-2 text-muted-foreground" style={{ fontSize: 16 * textScale, lineHeight: 26 * textScale }}>
            {marker}
          </Text>
          <View className="flex-1">{wrapped}</View>
        </View>
      );
    }

    default:
      return <View className="mb-3">{wrapped}</View>;
  }
}

/** TokenizedText through the lazy boundary (breaks the require cycle). */
function TokenizedTextLazy(props: {
  text: string;
  l2Code: string;
  formats?: FormatRange[];
  onOpenLink?: (href: string) => void;
  textScale: number;
  bold?: boolean;
}) {
  return (
    <Suspense fallback={<Text className="text-foreground">{props.text}</Text>}>
      <LazyTokenizedText
        text={props.text}
        l2Code={props.l2Code}
        formats={props.formats}
        onOpenLink={props.onOpenLink}
        textScale={props.textScale}
        bold={props.bold}
      />
    </Suspense>
  );
}

interface CodeSegment {
  isCode: boolean;
  text: string;
  /** Non-code formats, offsets rebased to the segment start. */
  formats: FormatRange[];
}

/**
 * Split a block's text into [plain | backticked-code] segments. Used by the
 * AI explanation policy (`codeSpans: 'tokenize'`): backticked L2 spans become
 * interactive TokenizedText, everything else renders as formatted plain text
 * (mirrors the legacy MarkdownExplanation splitter, but from the shared
 * parser's format model).
 */
function splitByCodeFormats(text: string, formats: FormatRange[]): CodeSegment[] {
  const codeRanges = formats
    .filter((f) => f.type === 'code')
    .map((f) => [f.start, f.end] as const)
    .sort((a, b) => a[0] - b[0]);
  const segments: CodeSegment[] = [];
  let pos = 0;
  for (const [start, end] of codeRanges) {
    if (start > pos) segments.push(makePlain(pos, start));
    if (end > start) segments.push({ isCode: true, text: text.slice(start, end), formats: [] });
    pos = Math.max(pos, end);
  }
  if (pos < text.length) segments.push(makePlain(pos, text.length));
  if (segments.length === 0) segments.push({ isCode: false, text, formats: [] });
  return segments;

  function makePlain(from: number, to: number): CodeSegment {
    return {
      isCode: false,
      text: text.slice(from, to),
      formats: formats
        .filter((f) => f.type !== 'code' && f.end > from && f.start < to)
        .map((f) => ({
          ...f,
          start: Math.max(f.start, from) - from,
          end: Math.min(f.end, to) - from,
        })),
    };
  }
}

/** Tokenize-mode text block: code spans interactive, rest formatted. */
function TokenizedCodeSpans({
  block,
  l2Code,
  onOpenLink,
  fontSize,
  textScale,
  lineHeightScale,
}: {
  block: TextBlock;
  l2Code: string;
  onOpenLink?: (href: string) => void;
  fontSize: number;
  textScale: number;
  lineHeightScale: number;
}) {
  const segments = useMemo(
    () => splitByCodeFormats(block.text, block.formats),
    [block.text, block.formats],
  );
  return (
    <Text
      className="text-foreground"
      style={{ fontSize, lineHeight: fontSize * lineHeightScale }}
    >
      {segments.map((seg, i) =>
        seg.isCode ? (
          <Suspense key={i} fallback={<Text className="text-foreground">{seg.text}</Text>}>
            <LazyTokenizedText
              text={seg.text}
              l2Code={l2Code}
              inline
              phonetics={false}
              highlightSaved={false}
              quickGloss={false}
              showDefinition={false}
              byeonggi={false}
              mode="normal"
              bold
              onOpenLink={onOpenLink}
              textScale={textScale}
            />
          </Suspense>
        ) : (
          <FormattedText key={i} text={seg.text} formats={seg.formats} fontSize={fontSize} lineHeightScale={lineHeightScale} />
        ),
      )}
    </Text>
  );
}

/** Plain-text inline formatting (no tokenization) — bold/italic/code/strike. */
function FormattedText({
  text,
  formats,
  fontSize,
  lineHeightScale,
  bold,
}: {
  text: string;
  formats: FormatRange[];
  fontSize: number;
  lineHeightScale: number;
  bold?: boolean;
}) {
  const spans = useMemo(() => {
    const points = new Set<number>([0, text.length]);
    for (const f of formats) {
      if (f.start < f.end && f.start >= 0 && f.end <= text.length) {
        points.add(f.start);
        points.add(f.end);
      }
    }
    const sorted = [...points].sort((a, b) => a - b);
    const out: { seg: string; active: FormatRange[] }[] = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      const start = sorted[i]!;
      const end = sorted[i + 1]!;
      if (start >= end) continue;
      const active = formats.filter((f) => f.start <= start && f.end >= end);
      out.push({ seg: text.slice(start, end), active });
    }
    return out;
  }, [text, formats]);

  return (
    <Text
      className="text-foreground"
      style={{ fontSize, lineHeight: fontSize * lineHeightScale, fontWeight: bold ? '700' : undefined }}
    >
      {spans.map((span, i) => {
        const style: {
          fontWeight?: '700';
          fontStyle?: 'italic';
          textDecorationLine?: 'line-through' | 'underline';
          fontFamily?: string;
        } = {};
        if (span.active.some((f) => f.type === 'bold')) style.fontWeight = '700';
        if (span.active.some((f) => f.type === 'italic')) style.fontStyle = 'italic';
        if (span.active.some((f) => f.type === 'strikethrough')) style.textDecorationLine = 'line-through';
        if (span.active.some((f) => f.type === 'link')) style.textDecorationLine = 'underline';
        if (span.active.some((f) => f.type === 'code')) style.fontFamily = 'monospace';
        return (
          <Text key={i} style={style}>
            {span.seg}
          </Text>
        );
      })}
    </Text>
  );
}
