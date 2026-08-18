import React, { useMemo } from 'react';
import { parseMarkdownBlocks } from '@langplayer/shared';
import { MarkdownBlocks } from '@/components/markdown/MarkdownBlocks';

interface MarkdownTextProps {
  children: string;
  /**
   * Optional render-rule overrides, kept API-compatible with the old
   * react-native-markdown-display rules (e.g. heading onLayout for TOC
   * scrolling in the docs screen). Each rule receives a node-like object
   * (`{ key, content }` — content is the plain heading text), the rendered
   * children, an empty parent array, and `_VIEW_SAFE_heading{n}` styles.
   */
  rules?: Record<string, (node: any, children: any[], parent: any[], styles: any) => React.ReactNode>;
}

/**
 * Renders markdown content through the shared parseMarkdownBlocks →
 * MarkdownBlocks pipeline (SPEC-083) — the same engine the readers and AI
 * explanations use. Replaces the react-native-markdown-display renderer.
 */
export function MarkdownText({ children, rules }: MarkdownTextProps) {
  const blocks = useMemo(() => parseMarkdownBlocks(children), [children]);

  return (
    <MarkdownBlocks
      blocks={blocks}
      ruleOverrides={{
        heading: (depth, text, rendered) => {
          const rule = rules?.[`heading${depth}`];
          if (!rule) return rendered;
          return rule(
            { key: `md-heading-${depth}`, content: text },
            [rendered],
            [],
            { _VIEW_SAFE_heading2: {}, _VIEW_SAFE_heading3: {}, _VIEW_SAFE_heading4: {} },
          );
        },
      }}
    />
  );
}
