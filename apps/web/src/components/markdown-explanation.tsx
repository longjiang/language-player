'use client';

import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { TokenizedText } from '@/components/tokenized-text';

interface MarkdownExplanationProps {
  /** Markdown text to render (the AI explanation response). */
  text: string;
  /** Target language code — backticked L2 spans are tokenized against this. */
  l2Code: string;
  /** True while the response is still streaming: backticked spans render as
   *  plain code and tokenization is deferred until the stream ends. */
  streaming?: boolean;
}

/**
 * Renders an AI explanation in two phases:
 *   1. streaming — plain formatted markdown, no tokenization (backticked L2
 *      spans show as regular inline code);
 *   2. finished — the markdown is re-rendered and backticked L2 spans are
 *      swapped for interactive TokenizedText. Tokens stay clickable for
 *      dictionary lookup but render plain: no saved-word highlighting, quick
 *      gloss, byeonggi, or interlinear definitions.
 */
export function MarkdownExplanation({ text, l2Code, streaming = false }: MarkdownExplanationProps) {
  // Memoize the renderer so its identity is stable across re-renders. An inline
  // components object would be recreated on every render, and React would treat
  // the new code-renderer function as a different component type — unmounting
  // and remounting every TokenizedText span on each parent re-render.
  const components = useMemo<Components | undefined>(
    () => (streaming ? undefined : {
      code({ node: _node, children, className, ...props }) {
        const content = String(children ?? '');
        const isBlock = /\n/.test(content) || (className ?? '').startsWith('language-');
        if (isBlock) {
          return (
            <code className={className} {...props}>{children}</code>
          );
        }
        // Inline code (backticked L2 string) → interactive tokenized text
        // with a muted highlight, matching <code> styling without the ticks
        return (
          <span className="rounded bg-muted px-0.5 py-px">
            <TokenizedText
              text={content}
              l2Code={l2Code}
              textScale={0}
              leading="none"
              highlightSaved={false}
              quickGloss={false}
              showDefinition={false}
              byeonggi={false}
            />
          </span>
        );
      },
    }),
    [streaming, l2Code],
  );

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={components}
    >
      {text}
    </ReactMarkdown>
  );
}
