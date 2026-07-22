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
          text: plainText(token),
        });
        break;

      case 'paragraph':
        blocks.push({
          kind: 'text',
          type: 'paragraph',
          text: plainText(token),
        });
        break;

      case 'blockquote': {
        const bqText = (token.tokens ?? [])
          .map((t) => plainText(t))
          .join(' ');
        if (bqText.trim()) {
          blocks.push({ kind: 'text', type: 'blockquote', text: bqText });
        }
        break;
      }

      case 'list':
        for (const item of token.items) {
          const liText = (item.tokens ?? [])
            .map((t) => plainText(t))
            .join(' ');
          if (liText.trim()) {
            blocks.push({ kind: 'text', type: 'list-item', text: liText });
          }
        }
        break;
    }
  }

  return blocks;
}

/** Walk inner tokens to extract plain text, stripping **bold**, *italic*, `code` markers. */
function plainText(token: any): string {
  // If token has child tokens, walk them to strip inline formatting
  if (token.tokens) return token.tokens.map((t: any) => plainText(t)).join('');
  if (token.type === 'text') return token.text ?? '';
  if (token.type === 'codespan') return token.text ?? '';
}
