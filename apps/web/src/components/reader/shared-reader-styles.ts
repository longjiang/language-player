/**
 * Shared markdown-block rendering helpers for the web readers.
 *
 * The notes reader, the web reader (URL) and the EPUB reader all display the
 * same markdown block stream (`ReaderBlock` from `@/lib/parse-markdown`), so
 * the block→element mapping, the block→class mapping, and the translation
 * styling live here once instead of being duplicated per panel.
 */

import type { JSX } from 'react';
import type { TextBlock } from '@/lib/parse-markdown';

/** Map a markdown text block to the HTML element tag it renders as. */
export function blockTag(tb: TextBlock): keyof JSX.IntrinsicElements {
  switch (tb.type) {
    case 'heading': return `h${tb.depth ?? 1}` as keyof JSX.IntrinsicElements;
    case 'list-item': return 'li';
    case 'blockquote': return 'blockquote';
    default: return 'p';
  }
}

/** Typography classes for a markdown text block. */
export function blockClass(tb: TextBlock): string {
  const b = 'leading-relaxed';
  switch (tb.type) {
    case 'heading': {
      const s: Record<number, string> = { 1: 'text-2xl font-bold', 2: 'text-xl font-semibold', 3: 'text-lg font-semibold' };
      return `${b} ${s[tb.depth ?? 1] ?? 'text-base font-medium'} mt-4`;
    }
    case 'paragraph': return `${b}`;
    case 'list-item': return `${b} ml-4 list-disc`;
    case 'blockquote': return `${b} border-l-4 border-muted pl-4 italic text-muted-foreground`;
    default: return `${b}`;
  }
}

/**
 * Muted variant for translation text. Font size is set explicitly via
 * `translationFontSize` (`TRANSLATION_FACTOR` × the L2 rendered size), so
 * these classes only carry non-size styling.
 */
export function translationClass(tb: TextBlock): string {
  const b = 'leading-relaxed';
  switch (tb.type) {
    case 'heading': return `${b} font-semibold`;
    case 'blockquote': return `${b} border-l-4 border-muted/40 pl-4 italic`;
    default: return `${b}`;
  }
}
