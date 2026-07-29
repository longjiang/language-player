import React from 'react';
import { View, Text } from 'react-native';
import { parseMarkdownBlocks } from '@/lib/parse-markdown';
import type { ContentBlock, TextBlock, ImageBlock, TableBlock } from '@/lib/parse-markdown';
import { ICON_MUTED } from '@/lib/theme-colors';

interface MarkdownTextProps {
  children: string;
}

/**
 * Renders markdown using the same block-level parsing pipeline as the reader
 * (parseMarkdownBlocks), but without per-word tokenization — text blocks use
 * plain <Text> instead of <TokenizedText>.
 */
export function MarkdownText({ children }: MarkdownTextProps) {
  const blocks = parseMarkdownBlocks(children);

  return (
    <View>
      {blocks.map((block, i) => renderBlock(block, i))}
    </View>
  );
}

function renderBlock(block: ContentBlock, key: number) {
  if (block.kind === 'image') {
    return (
      <View key={key} className="my-3 items-center">
        <Text className="text-xs text-muted-foreground">[{block.alt ?? 'image'}]</Text>
      </View>
    );
  }

  if (block.kind === 'table') {
    return (
      <View key={key} className="mb-3 overflow-hidden rounded-lg border border-border">
        <View className="flex-row bg-muted/50">
          {block.header.map((cell, ci) => (
            <View key={ci} className={`px-2 py-1.5 ${ci < block.header.length - 1 ? 'border-r border-border' : ''}`} style={{ flex: 1 }}>
              <Text className="text-xs font-semibold text-foreground">{cell}</Text>
            </View>
          ))}
        </View>
        {block.rows.map((row, ri) => (
          <View key={ri} className={`flex-row ${ri < block.rows.length - 1 ? 'border-b border-border' : ''}`}>
            {row.map((cell, ci) => (
              <View key={ci} className={`px-2 py-1.5 ${ci < row.length - 1 ? 'border-r border-border' : ''}`} style={{ flex: 1 }}>
                <Text className="text-sm text-foreground">{cell}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    );
  }

  const tb = block as TextBlock;

  switch (tb.type) {
    case 'heading': {
      const headingSize = tb.depth === 1 ? 'text-lg' : tb.depth === 2 ? 'text-base' : 'text-sm';
      return (
        <Text key={key} className={`mb-2 font-bold ${headingSize} text-foreground`}>
          {tb.text}
        </Text>
      );
    }
    case 'paragraph':
      return (
        <Text key={key} className="mb-2 text-sm leading-relaxed text-foreground">
          {tb.text}
        </Text>
      );
    case 'blockquote':
      return (
        <View key={key} className="mb-2 border-l-2 border-muted-foreground/30 pl-3">
          <Text className="text-sm leading-relaxed italic text-muted-foreground">
            {tb.text}
          </Text>
        </View>
      );
    case 'list-item':
      return (
        <View key={key} className="mb-1 flex-row">
          <Text className="mr-2 text-muted-foreground">•</Text>
          <View className="flex-1">
            <Text className="text-sm leading-relaxed text-foreground">{tb.text}</Text>
          </View>
        </View>
      );
    default:
      return (
        <Text key={key} className="mb-2 text-sm text-foreground">
          {tb.text}
        </Text>
      );
  }
}
