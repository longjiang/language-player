'use client';

import ReactMarkdown from 'react-markdown';
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
 * Renders an AI explanation as markdown. Backticked spans (per the prompt,
 * every L2 word/phrase/sentence is backticked) render as interactive
 * TokenizedText with a muted highlight instead of <code>.
 */
export function MarkdownExplanation({ text, l2Code, streaming = false }: MarkdownExplanationProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ node: _node, children, className, ...props }) {
          const content = String(children ?? '');
          const isBlock = /\n/.test(content) || (className ?? '').startsWith('language-');
          if (isBlock) {
            return (
              <code className={className} {...props}>{children}</code>
            );
          }
          if (streaming) {
            // Defer tokenization until the stream finishes (avoids lemmatizing partial text)
            return (
              <code className={className} {...props}>{children}</code>
            );
          }
          // Inline code (backticked L2 string) → interactive tokenized text
          // with a muted highlight, matching <code> styling without the ticks
          return (
            <span className="rounded bg-muted px-0.5 py-px">
              <TokenizedText text={content} l2Code={l2Code} textScale={0} leading="none" />
            </span>
          );
        },
      }}
    >
      {text}
    </ReactMarkdown>
  );
}
