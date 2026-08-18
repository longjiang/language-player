import React, { useMemo } from 'react';
import { View, Text, Image, useWindowDimensions } from 'react-native';
import { TokenizedText } from '@/components/TokenizedText';
import type { ContentBlock, FormatRange, TextBlock } from '@langplayer/shared';

/** Unordered bullet glyphs by nesting depth. */
const BULLETS = ['•', '◦', '▪'] as const;

export interface MarkdownBlocksProps {
  blocks: ContentBlock[];
  /** When set, text blocks render via TokenizedText (L2 tokenization,
   *  clickable words); otherwise plain Text with inline formatting. */
  l2Code?: string;
  /** Open links inside the app (reader-style) instead of the OS browser. */
  onOpenLink?: (href: string) => void;
  /** Text scale multiplier for headings/paragraphs. */
  textScale?: number;
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
  onOpenLink,
  textScale = 1,
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
                onOpenLink={onOpenLink}
                textScale={textScale}
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
  onOpenLink,
  textScale,
  ruleOverrides,
  orderedNumber,
}: {
  block: TextBlock;
  l2Code?: string;
  onOpenLink?: (href: string) => void;
  textScale: number;
  ruleOverrides?: MarkdownBlocksProps['ruleOverrides'];
  orderedNumber?: number;
}) {
  const isHeading = block.type === 'heading';
  const content = l2Code ? (
    <TokenizedText
      text={block.text}
      l2Code={l2Code}
      formats={block.formats}
      onOpenLink={onOpenLink}
      textScale={textScale * (isHeading ? (block.depth === 1 ? 1.5 : block.depth === 2 ? 1.25 : 1.125) : 1)}
      bold={isHeading}
    />
  ) : (
    <FormattedText
      text={block.text}
      formats={block.formats}
      fontSize={(isHeading ? HEADING_FONT[block.depth ?? 1] : 16) * textScale}
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

/** Plain-text inline formatting (no tokenization) — bold/italic/code/strike. */
function FormattedText({
  text,
  formats,
  fontSize,
  bold,
}: {
  text: string;
  formats: FormatRange[];
  fontSize: number;
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
      style={{ fontSize, lineHeight: fontSize * 2, fontWeight: bold ? '700' : undefined }}
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
