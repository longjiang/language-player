import React from 'react';
import { useWindowDimensions } from 'react-native';
import Markdown from 'react-native-markdown-display';

interface MarkdownTextProps {
  children: string;
  /** Optional render-rule overrides (e.g. heading onLayout for TOC scrolling). */
  rules?: Record<string, (node: any, children: any[], parent: any[], styles: any) => React.ReactNode>;
}

/**
 * Renders markdown content using react-native-markdown-display.
 * Styled with NativeWind-compatible rules matching the app's design tokens.
 */
export function MarkdownText({ children, rules }: MarkdownTextProps) {
  const { width } = useWindowDimensions();

  return (
    <Markdown
      rules={rules}
      style={{
        body: {
          color: 'rgb(248 250 252)',
          fontSize: 14,
          lineHeight: 28, // 2 × 14
        },
        paragraph: {
          marginBottom: 12,
        },
        heading1: {
          fontSize: 18,
          fontWeight: '700',
          lineHeight: 36, // 2 × 18
          marginBottom: 8,
          marginTop: 4,
          color: 'rgb(248 250 252)',
        },
        heading2: {
          fontSize: 16,
          fontWeight: '700',
          lineHeight: 32, // 2 × 16
          marginBottom: 6,
          marginTop: 4,
          color: 'rgb(248 250 252)',
        },
        heading3: {
          fontSize: 14,
          fontWeight: '700',
          lineHeight: 28, // 2 × 14
          marginBottom: 4,
          color: 'rgb(248 250 252)',
        },
        strong: {
          fontWeight: '700',
        },
        em: {
          fontStyle: 'italic',
        },
        code_inline: {
          backgroundColor: 'rgba(148 163 184 / 0.15)',
          borderRadius: 4,
          paddingHorizontal: 4,
          fontFamily: 'monospace',
          fontSize: 12,
          lineHeight: 24, // 2 × 12
        },
        code_block: {
          backgroundColor: 'rgba(148 163 184 / 0.1)',
          borderRadius: 8,
          padding: 12,
          marginBottom: 12,
          fontFamily: 'monospace',
          fontSize: 12,
          lineHeight: 24, // 2 × 12
        },
        fence: {
          backgroundColor: 'rgba(148 163 184 / 0.1)',
          borderRadius: 8,
          padding: 12,
          marginBottom: 12,
          fontFamily: 'monospace',
          fontSize: 12,
          lineHeight: 24, // 2 × 12
        },
        blockquote: {
          borderLeftWidth: 2,
          borderLeftColor: 'rgba(148 163 184 / 0.3)',
          paddingLeft: 12,
          marginBottom: 12,
          fontStyle: 'italic',
          color: 'rgb(148 163 184)',
        },
        bullet_list: {
          marginBottom: 8,
        },
        ordered_list: {
          marginBottom: 8,
        },
        list_item: {
          flexDirection: 'row',
          marginBottom: 4,
        },
        hr: {
          marginVertical: 12,
          height: 1,
          backgroundColor: 'rgba(148 163 184 / 0.2)',
        },
        link: {
          color: 'rgb(56 189 248)',
          textDecorationLine: 'underline',
        },
        image: {
          width: width - 64,
          height: (width - 64) * 0.6,
          borderRadius: 8,
          marginBottom: 12,
          resizeMode: 'contain',
        },
        table: {
          borderWidth: 1,
          borderColor: 'rgba(148 163 184 / 0.2)',
          borderRadius: 8,
          marginBottom: 12,
        },
        thead: {
          backgroundColor: 'rgba(148 163 184 / 0.1)',
        },
        th: {
          padding: 8,
          fontWeight: '600',
          fontSize: 13,
        },
        td: {
          padding: 8,
          fontSize: 13,
        },
        tr: {
          borderBottomWidth: 1,
          borderBottomColor: 'rgba(148 163 184 / 0.1)',
        },
      }}
    >
      {children}
    </Markdown>
  );
}
