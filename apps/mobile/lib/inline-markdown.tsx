import React from 'react';
import { Text } from 'react-native';
import { splitInlineMarkdown } from '@langplayer/shared';
import type { EpubFormatRange } from '@/lib/epub-parser';

/**
 * Mobile inline-markdown wrappers (SPEC-083 Task 5).
 *
 * The tokenizer lives in packages/shared (splitInlineMarkdown) — the same
 * implementation both apps use — and these two RN-facing helpers build on
 * it with unchanged signatures, so all existing call sites keep working:
 * TextActionMenu, SubtitleDisplay, SubsSearchRow, settings/display, and the
 * dictionary corpus examples/collocations.
 */

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
  for (const part of splitInlineMarkdown(text)) {
    if (part.type === 'text') {
      out.text += part.value;
      continue;
    }
    const start = out.text.length;
    out.text += part.value;
    out.formats.push({
      start,
      end: out.text.length,
      type: part.type === 'bold' ? 'bold' : part.type === 'code' ? 'code' : 'italic',
    });
  }
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
  let key = 0;
  for (const part of splitInlineMarkdown(text)) {
    if (part.type === 'text') {
      parts.push(part.value);
    } else if (part.type === 'bold') {
      parts.push(
        opts?.markBold ? (
          <Text key={key} className="rounded bg-primary/15 px-0.5 font-semibold text-primary">
            {part.value}
          </Text>
        ) : (
          <Text key={key} className="font-bold">{part.value}</Text>
        ),
      );
    } else if (part.type === 'code') {
      parts.push(
        <Text key={key} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">
          {part.value}
        </Text>,
      );
    } else {
      parts.push(<Text key={key} className="italic">{part.value}</Text>);
    }
    key++;
  }
  return parts;
}
