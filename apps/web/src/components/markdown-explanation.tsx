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
 *      gloss, byeonggi, interlinear definitions, phonetics, or quiz blanking;
 *      bold, no chip background.
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
        // in bold without the muted chip background
        return (
          <span className="font-bold">
            <TokenizedText
              text={content}
              l2Code={l2Code}
              textScale={0}
              leading="none"
              phonetics={false}
              mode="normal"
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
    // Enforce line-height 2 (leading-loose) on every block element the
    // markdown can produce (paragraphs inherit it, but headings/blockquotes/
    // lists/pre set their own line-heights via the prose plugin).
    <div className="leading-loose [&_p]:leading-loose [&_li]:leading-loose [&_h1]:leading-loose [&_h2]:leading-loose [&_h3]:leading-loose [&_h4]:leading-loose [&_h5]:leading-loose [&_h6]:leading-loose [&_blockquote]:leading-loose [&_pre]:leading-loose [&_hr]:my-3">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={components}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
