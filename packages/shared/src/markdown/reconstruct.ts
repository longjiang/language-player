/**
 * Reconstruct typed blocks back to raw markdown (SPEC-083).
 *
 * Ported from apps/web/src/lib/parse-markdown.ts (reconstructNode /
 * reconstructChildren) and generalized over the shared block model. Web's
 * reader renders non-text blocks (tables, code, images, hr, raw HTML) through
 * ReactMarkdown; `reconstructRaw` feeds that path so web keeps its rendering
 * while both apps share the same parser.
 */

import type { ContentBlock } from './types';

/** Wrap a markdown destination in angle brackets when it contains characters
 *  that would break re-parsing (spaces or parentheses) — e.g. image URLs like
 *  `![](<https://x/logo (1).png>)` must keep their brackets on reconstruction. */
function mdDestination(url: string): string {
  return /[\s()]/.test(url) ? `<${url}>` : url;
}

/**
 * Reconstruct a non-text block as raw markdown, or null when the block has no
 * markdown form (text blocks — callers render those natively).
 */
export function reconstructRaw(block: ContentBlock): string | null {
  switch (block.kind) {
    case 'code':
      return `\`\`\`${block.language ?? ''}\n${block.text}\n\`\`\``;

    case 'hr':
      return '---';

    case 'html':
      return block.text;

    case 'image':
      return `![${block.alt ?? ''}](${mdDestination(block.uri)})`;

    case 'table': {
      const header = `| ${block.header.join(' | ')} |`;
      const separator = `| ${block.header.map(() => '---').join(' | ')} |`;
      const rows = block.rows.map((row) => `| ${row.join(' | ')} |`);
      return [header, separator, ...rows].join('\n');
    }

    default:
      return null;
  }
}
