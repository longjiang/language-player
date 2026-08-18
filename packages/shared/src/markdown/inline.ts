/**
 * Minimal inline markdown tokenizer (SPEC-083).
 *
 * Pure splitter for the short strings the translate backend emits (it bolds
 * highlighted terms with `**…**`). Handles **bold**, *italic*, and `code`;
 * anything else passes through as plain text. Both apps' renderers
 * (web `renderInlineMarkdown`, mobile `renderInlineMarkdown`) build on this
 * single implementation so highlighting renders identically.
 */

export type InlineMarkdownPart =
  | { type: 'text'; value: string }
  | { type: 'bold'; value: string }
  | { type: 'italic'; value: string }
  | { type: 'code'; value: string };

/** Split inline markdown into styled segments (order preserved). */
export function splitInlineMarkdown(text: string): InlineMarkdownPart[] {
  const out: InlineMarkdownPart[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) out.push({ type: 'text', value: text.slice(last, m.index) });
    const token = m[0];
    if (token.length >= 4 && token.startsWith('**') && token.endsWith('**')) {
      out.push({ type: 'bold', value: token.slice(2, -2) });
    } else if (token.startsWith('`') && token.endsWith('`')) {
      out.push({ type: 'code', value: token.slice(1, -1) });
    } else {
      out.push({ type: 'italic', value: token.slice(1, -1) });
    }
    last = m.index + token.length;
  }
  if (last < text.length) out.push({ type: 'text', value: text.slice(last) });
  return out;
}
