'use client';

import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cleanAiQuote } from '@langplayer/utils';
import { TokenizedText } from '@/components/tokenized-text';

interface MarkdownExplanationProps {
  /** Markdown text to render (the AI explanation response). */
  text: string;
  /** Target language code — backticked L2 spans are tokenized against this. */
  l2Code: string;
  /** True while the response is still streaming: backticked spans render as
   *  plain code and tokenization is deferred until the stream ends. */
  streaming?: boolean;
  /** Reader "Ask AI": render `[[original||translation]]` markers as small
   *  tappable chips INLINE at the position the model placed them (instead of
   *  raw text). `onQuotePress` opens the reader search. */
  quoteChips?: {
    onQuotePress: (original: string) => void;
  };
}

/**
 * Turns `[[original||translation]]` quote markers in markdown text nodes into
 * custom `quoteChip` hast elements, so react-markdown renders them as inline
 * chips at their position (the reader "Ask AI" summary). Non-matching text is
 * left untouched; markers that straddle formatting boundaries (e.g. a quote
 * containing its own markdown) are not converted and stay as raw text.
 */
function remarkReaderQuote() {
  return (tree: any) => {
    const markerRe = /\[\[([\s\S]+?)\|\|([\s\S]+?)\]\]/g;
    const convertText = (value: string): any[] => {
      const matches = [...value.matchAll(markerRe)];
      if (matches.length === 0) return [{ type: 'text', value }];
      const children: any[] = [];
      let last = 0;
      for (const m of matches) {
        const start = m.index ?? 0;
        if (start > last) children.push({ type: 'text', value: value.slice(last, start) });
        const original = cleanAiQuote(m[1] ?? '');
        const translation = cleanAiQuote(m[2] ?? '');
        if (original) {
          children.push({
            type: 'quoteChip',
            data: { hName: 'quoteChip', hProperties: { original, translation } },
          });
        }
        last = start + m[0].length;
      }
      if (last < value.length) children.push({ type: 'text', value: value.slice(last) });
      return children;
    };

    const walk = (node: any): void => {
      if (!node || !Array.isArray(node.children)) return;
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (!child) continue;
        if (child.type === 'text') {
          const replaced = convertText(child.value ?? '');
          if (replaced.length !== 1) {
            node.children.splice(i, 1, ...replaced);
            i += replaced.length - 1;
          }
        } else {
          walk(child);
        }
      }
    };

    walk(tree);
  };
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
export function MarkdownExplanation({ text, l2Code, streaming = false, quoteChips }: MarkdownExplanationProps) {
  // Memoize the renderers so their identity is stable across re-renders. An
  // inline components object would be recreated on every render, and React
  // would treat the new code-renderer function as a different component type —
  // unmounting and remounting every TokenizedText span on each parent render.
  const components = useMemo<Components | undefined>(() => {
    const renderers: Record<string, any> = {};
    if (quoteChips) {
      renderers.quoteChip = ({ original, translation }: any) => {
        const o = String(original ?? '').trim();
        const t = String(translation ?? '').trim();
        if (!o) return null;
        return (
          <button
            type="button"
            onClick={() => quoteChips.onQuotePress(o)}
            title="Search this passage"
            className="mx-0.5 inline-flex max-w-full flex-col gap-0.5 rounded border border-border bg-muted/60 px-1.5 py-0.5 align-middle transition-colors hover:border-primary hover:bg-muted"
          >
            <span className="truncate text-xs font-medium text-foreground">{o}</span>
            {t ? <span className="truncate text-[10px] text-muted-foreground">{t}</span> : null}
          </button>
        );
      };
    }

    if (streaming) {
      // During streaming, keep the plain (non-tokenized) render, but still
      // surface quote chips as the markers complete.
      return Object.keys(renderers).length > 0 ? (renderers as Components) : undefined;
    }

    renderers.code = function code({ node: _node, children, className, ...props }: any) {
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
            inline
            phonetics={false}
            mode="normal"
            highlightSaved={false}
            quickGloss={false}
            showDefinition={false}
            byeonggi={false}
          />
        </span>
      );
    };
    return renderers as Components;
  }, [streaming, l2Code, quoteChips]);

  return (
    // Enforce line-height 2 (leading-loose) on every block element the
    // markdown can produce (paragraphs inherit it, but headings/blockquotes/
    // lists/pre set their own line-heights via the prose plugin).
    <div className="leading-loose [&_p]:leading-loose [&_li]:leading-loose [&_h1]:leading-loose [&_h2]:leading-loose [&_h3]:leading-loose [&_h4]:leading-loose [&_h5]:leading-loose [&_h6]:leading-loose [&_blockquote]:leading-loose [&_pre]:leading-loose [&_hr]:my-3">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkReaderQuote]}
        components={components}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
