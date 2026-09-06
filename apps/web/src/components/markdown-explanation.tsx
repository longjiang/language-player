'use client';

import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Quote, ChevronRight } from 'lucide-react';
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
  /** Reader "Ask AI": render `[[original||translation]]` markers as tappable
   *  chips at the position the model placed them (instead of raw text).
   *  Each chip is a full-width BLOCK (own line), with a quote icon on the
   *  left and a right-chevron on the right. `onQuotePress` opens the reader
   *  search. */
  quoteChips?: {
    onQuotePress: (original: string) => void;
  };
}

/**
 * Turns `[[original||translation]]` quote markers in markdown text nodes into
 * custom `quoteChip` hast elements, so react-markdown renders them as chips at
 * their position (the reader "Ask AI" summary). In a PARAGRAPH's own text the
 * markers are hoisted to BLOCK level — the paragraph is split into prose
 * paragraphs and standalone `quoteChip` nodes, so a chip never renders inside
 * the sentence around it (the prompt asks the model to emit each marker on its
 * own line; this cleans up the ones it still places mid-sentence). Markers
 * inside inline formatting (bold/emphasis) convert in place. Non-matching text
 * is left untouched; markers that straddle formatting boundaries (e.g. a quote
 * containing its own markdown) are not converted and stay as raw text.
 */
function remarkReaderQuote() {
  return (tree: any) => {
    // Built fresh per plugin run: a /g regex is stateful (`lastIndex`), and
    // sharing one between `.test()` and `matchAll` silently skips matches.
    const markerRe = /\[\[([\s\S]+?)\|\|([\s\S]+?)\]\]/g;
    const makeChip = (m: RegExpMatchArray): any | null => {
      const original = cleanAiQuote(m[1] ?? '');
      const translation = cleanAiQuote(m[2] ?? '');
      if (!original) return null;
      return {
        type: 'quoteChip',
        data: { hName: 'quoteChip', hProperties: { original, translation } },
      };
    };
    /** Split a plain-text value into prose / block-chip pieces. */
    const convertText = (value: string): any[] => {
      const matches = [...value.matchAll(markerRe)];
      if (matches.length === 0) return [{ type: 'text', value }];
      const children: any[] = [];
      let last = 0;
      for (const m of matches) {
        const start = m.index ?? 0;
        if (start > last) children.push({ type: 'text', value: value.slice(last, start) });
        const chip = makeChip(m);
        if (chip) children.push(chip);
        last = start + m[0].length;
      }
      if (last < value.length) children.push({ type: 'text', value: value.slice(last) });
      return children;
    };
    /** In-place conversion (the old inline behavior) for inline-formatting
     *  subtrees — a chip inside bold still renders full-width. */
    const walkInline = (node: any): void => {
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
          walkInline(child);
        }
      }
    };
    /** True when the paragraph has a marker in one of its DIRECT text nodes
     *  (markers only inside inline formatting don't need the split). Uses a
     *  fresh non-global regex — a /g regex's `lastIndex` would leak between
     *  `.test()` calls and corrupt the later `matchAll`. */
    const paragraphHasMarker = (node: any): boolean =>
      Array.isArray(node.children) &&
      node.children.some(
        (c: any) => c?.type === 'text' && /\[\[[\s\S]+?\|\|[\s\S]+?\]\]/.test(c.value ?? ''),
      );

    const process = (parent: any): void => {
      if (!parent || !Array.isArray(parent.children)) return;
      for (let i = 0; i < parent.children.length; i++) {
        const child = parent.children[i];
        if (!child) continue;
        if (child.type === 'paragraph' && paragraphHasMarker(child)) {
          // Rebuild the paragraph as [prose paragraph, chip, prose paragraph,
          // …] so each chip becomes a sibling BLOCK of the prose.
          const expanded: any[] = [];
          let prose: any[] = [];
          const flushProse = () => {
            if (prose.length > 0) expanded.push({ type: 'paragraph', children: prose });
            prose = [];
          };
          for (const inner of child.children) {
            if (inner?.type === 'text') {
              for (const piece of convertText(inner.value ?? '')) {
                if (piece.type === 'text') {
                  if (piece.value.trim()) prose.push(piece);
                } else {
                  flushProse();
                  expanded.push(piece);
                }
              }
            } else {
              walkInline(inner);
              prose.push(inner);
            }
          }
          flushProse();
          parent.children.splice(i, 1, ...expanded);
          i += expanded.length - 1;
        } else {
          process(child);
        }
      }
    };

    process(tree);
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
        const gloss = String(translation ?? '').trim();
        if (!o) return null;
        return (
          <button
            type="button"
            onClick={() => quoteChips.onQuotePress(o)}
            title={gloss ? `${o} — ${gloss}` : o}
            className="my-1.5 flex w-full items-center gap-2.5 rounded-md border border-border bg-muted/60 px-2.5 py-2 text-left transition-colors hover:border-primary hover:bg-muted"
          >
            <Quote className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 flex-col">
              <span className="block truncate text-xs font-medium text-foreground">{o}</span>
              {gloss ? (
                <span className="block truncate text-[11px] text-muted-foreground">{gloss}</span>
              ) : null}
            </span>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
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
