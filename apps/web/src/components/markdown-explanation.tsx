'use client';

import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Quote, ChevronRight } from 'lucide-react';
import { cleanAiQuote, parseTimestampToken, formatTimestamp } from '@langplayer/utils';
import { TokenizedText } from '@/components/tokenized-text';
import { useT } from '@/hooks/use-t';

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
  /** Video "Ask AI": render `[MM:SS]` timestamp markers as tappable chips.
   *  Each chip is a full-width BLOCK (own line); tapping it calls
   *  `onTimestampPress` with the time in seconds (the caller seeks the
   *  video). */
  timestampChips?: {
    onTimestampPress: (timeSeconds: number) => void;
  };
}

/**
 * Turns `[[original||translation]]` quote markers and `[MM:SS]` timestamp
 * tokens in markdown text nodes into custom hast elements, so react-markdown
 * renders them as chips at their position.
 *
 * - Quote chips (reader "Ask AI"): hoisted to BLOCK level — the paragraph is
 *   split into prose paragraphs and standalone `quoteChip` nodes, so a chip
 *   never renders inside the sentence around it.
 * - Timestamp chips (video "Ask AI"): kept INLINE within the paragraph (e.g.
 *   "the answer at [00:12]"), rendered as a tappable pill that calls
 *   `onTimestampPress` with the time in seconds.
 *
 * Markers inside inline formatting (bold/emphasis) convert in place.
 * Non-matching text is left untouched; markers that straddle formatting
 * boundaries (e.g. a quote containing its own markdown) are not converted and
 * stay as raw text.
 */
function remarkReaderQuote(config?: { quoteChips?: boolean; timestampChips?: boolean }) {
  const enableQuotes = !!config?.quoteChips;
  const enableTimestamps = !!config?.timestampChips;
  return (tree: any) => {
    // Built fresh per plugin run: a /g regex is stateful (`lastIndex`), and
    // sharing one between `.test()` and `matchAll` silently skips matches.
    const anyRe = /(\[\[[\s\S]+?\|\|[\s\S]+?\]\])|(\[(?:(\d+):)?(\d{1,2}):(\d{2})\])/g;
    const makeChip = (m: RegExpMatchArray): any | null => {
      const original = cleanAiQuote(m[1] ?? '');
      const translation = cleanAiQuote(m[2] ?? '');
      if (!original) return null;
      return {
        type: 'quoteChip',
        data: { hName: 'quoteChip', hProperties: { original, translation } },
      };
    };
    const makeTimestampChip = (token: string): any | null => {
      const time = parseTimestampToken(token);
      if (time == null) return null;
      return {
        type: 'timestampChip',
        data: { hName: 'timestampChip', hProperties: { time } },
      };
    };
    /** Split a plain-text value into prose / chip pieces. quoteChips are block
     *  (hoisted), timestampChips are inline (stay in the prose array). */
    const convertText = (value: string): any[] => {
      const matches = [...value.matchAll(anyRe)];
      if (matches.length === 0) return [{ type: 'text', value }];
      const children: any[] = [];
      let last = 0;
      for (const m of matches) {
        const start = m.index ?? 0;
        if (start > last) children.push({ type: 'text', value: value.slice(last, start) });
        if (m[1] !== undefined && enableQuotes) {
          const chip = makeChip(m);
          if (chip) children.push(chip);
        } else if (m[2] !== undefined && enableTimestamps) {
          const chip = makeTimestampChip(m[0]);
          if (chip) children.push(chip);
        } else {
          // Marker type disabled — keep the raw token as text.
          children.push({ type: 'text', value: m[0] });
        }
        last = start + m[0].length;
      }
      if (last < value.length) children.push({ type: 'text', value: value.slice(last) });
      return children;
    };
    /** In-place conversion (the old inline behavior) for inline-formatting
     *  subtrees — a chip inside bold still renders. */
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
        (c: any) =>
          c?.type === 'text' &&
          (/\[\[[\s\S]+?\|\|[\s\S]+?\]\]/.test(c.value ?? '') ||
            (enableTimestamps && /\[(?:(\d+):)?(\d{1,2}):(\d{2})\]/.test(c.value ?? ''))),
      );

    const process = (parent: any): void => {
      if (!parent || !Array.isArray(parent.children)) return;
      for (let i = 0; i < parent.children.length; i++) {
        const child = parent.children[i];
        if (!child) continue;
        if (child.type === 'paragraph' && paragraphHasMarker(child)) {
          // Rebuild the paragraph as [prose paragraph, quote chip, prose
          // paragraph, …] so each QUOTE chip becomes a sibling BLOCK of the
          // prose, while TIMESTAMP chips stay inline within the prose.
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
                } else if (piece.type === 'quoteChip') {
                  flushProse();
                  expanded.push(piece);
                } else {
                  // timestampChip — keep inline within the prose paragraph.
                  prose.push(piece);
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
export function MarkdownExplanation({ text, l2Code, streaming = false, quoteChips, timestampChips }: MarkdownExplanationProps) {
  const t = useT();
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
    if (timestampChips) {
      renderers.timestampChip = ({ time }: any) => {
        const seconds = Number(time ?? 0);
        if (!Number.isFinite(seconds)) return null;
        return (
          <button
            type="button"
            onClick={() => timestampChips.onTimestampPress(seconds)}
            title={`${formatTimestamp(seconds)} — ${t('action.seek_to_timestamp')}`}
            className="mx-0.5 inline-flex items-center rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 align-baseline font-mono text-[11px] leading-tight text-primary transition-colors hover:bg-primary/20"
          >
            {formatTimestamp(seconds)}
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
  }, [streaming, l2Code, quoteChips, timestampChips, t]);

  const remarkPlugins = useMemo(
    () => [remarkGfm, () => remarkReaderQuote({ quoteChips: !!quoteChips, timestampChips: !!timestampChips })],
    [quoteChips, timestampChips],
  );

  return (
    // Enforce line-height 2 (leading-loose) on every block element the
    // markdown can produce (paragraphs inherit it, but headings/blockquotes/
    // lists/pre set their own line-heights via the prose plugin).
    <div className="leading-loose [&_p]:leading-loose [&_li]:leading-loose [&_h1]:leading-loose [&_h2]:leading-loose [&_h3]:leading-loose [&_h4]:leading-loose [&_h5]:leading-loose [&_h6]:leading-loose [&_blockquote]:leading-loose [&_pre]:leading-loose [&_hr]:my-3">
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        components={components}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
