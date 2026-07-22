import { marked } from 'marked';

export interface TextBlock {
  kind: 'text';
  type: 'heading' | 'paragraph' | 'list-item' | 'blockquote';
  depth?: number;
  text: string;
}

/**
 * Parse markdown into plain-text blocks for tokenization.
 * Uses marked.Lexer for proper parsing — no regex hacks.
 */
export function parseMarkdownBlocks(md: string): TextBlock[] {
  const tokens = marked.lexer(md);
  const blocks: TextBlock[] = [];

  for (const token of tokens) {
    switch (token.type) {
      case 'heading':
        blocks.push({
          kind: 'text',
          type: 'heading',
          depth: token.depth,
          text: token.text,
        });
        break;

      case 'paragraph':
        blocks.push({
          kind: 'text',
          type: 'paragraph',
          text: token.text,
        });
        break;

      case 'blockquote':
        // Flatten blockquote children into one text
        const bqText = (token.tokens ?? [])
          .filter((t): t is { type: 'paragraph'; text: string } =>
            t.type === 'paragraph' && 'text' in t)
          .map((t) => t.text)
          .join(' ');
        if (bqText.trim()) {
          blocks.push({ kind: 'text', type: 'blockquote', text: bqText });
        }
        break;

      case 'list':
        for (const item of token.items) {
          const liText = (item.tokens ?? [])
            .filter((t): t is { type: 'text' | 'paragraph'; text?: string } =>
              (t.type === 'text' || t.type === 'paragraph') && 'text' in t)
            .map((t) => (t as any).text ?? '')
            .join(' ');
          if (liText.trim()) {
            blocks.push({ kind: 'text', type: 'list-item', text: liText });
          }
        }
        break;

      // code, table, space, hr — skip
    }
  }

  return blocks;
}
