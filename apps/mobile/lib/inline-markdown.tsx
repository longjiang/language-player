import React from 'react';
import { Text } from 'react-native';
import type { EpubFormatRange } from '@/lib/epub-parser';

/**
 * Strip simple inline markdown (**bold**, *italic*, `code`) while recording
 * each span's character range in the stripped text. Used to feed one
 * TokenizedText with formats so formatting survives tokenization and can
 * coexist with ruby/phonetics.
 */
export function parseInlineMarkdownRanges(text: string): {
  text: string;
  formats: EpubFormatRange[];
} {
  const out: { text: string; formats: EpubFormatRange[] } = { text: '', formats: [] };
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) out.text += text.slice(last, m.index);
    const token = m[0];
    const start = out.text.length;
    let inner: string;
    let type: EpubFormatRange['type'];
    if (token.length >= 4 && token.startsWith('**') && token.endsWith('**')) {
      inner = token.slice(2, -2);
      type = 'bold';
    } else if (token.startsWith('`') && token.endsWith('`')) {
      inner = token.slice(1, -1);
      type = 'code';
    } else {
      inner = token.slice(1, -1);
      type = 'italic';
    }
    out.text += inner;
    out.formats.push({ start, end: out.text.length, type });
    last = m.index + token.length;
  }
  if (last < text.length) out.text += text.slice(last);
  return out;
}

/**
 * Render a translation string with the inline markdown the translate backend
 * emits (it bolds highlighted terms with `**…**`). Handles **bold**, *italic*,
 * and `code`; anything else passes through untouched.
 *
 * With `markBold`, the bolded term renders as a prominent highlight
 * (bg-primary/15 + text-primary) instead of plain bold — matching web's
 * renderInlineMarkdown({ markBold: true }).
 */
export function renderInlineMarkdown(
  text: string,
  opts?: { markBold?: boolean },
): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const token = m[0];
    if (token.length >= 4 && token.startsWith('**') && token.endsWith('**')) {
      const inner = token.slice(2, -2);
      parts.push(
        opts?.markBold ? (
          <Text key={key} className="rounded bg-primary/15 px-0.5 font-semibold text-primary">
            {inner}
          </Text>
        ) : (
          <Text key={key} className="font-bold">{inner}</Text>
        ),
      );
    } else if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(
        <Text key={key} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">
          {token.slice(1, -1)}
        </Text>,
      );
    } else {
      parts.push(<Text key={key} className="italic">{token.slice(1, -1)}</Text>);
    }
    last = m.index + token.length;
    key++;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}
