import { marked } from 'marked';

export interface TextBlock {
  kind: 'text';
  type: 'heading' | 'paragraph' | 'list-item' | 'blockquote';
  depth?: number;
  text: string;
}

export interface ImageBlock {
  kind: 'image';
  uri: string;
  alt?: string;
}

export type ContentBlock = TextBlock | ImageBlock;

/**
 * Parse markdown into blocks for rendering.
 * Uses marked.Lexer for proper parsing — no regex hacks.
 */
export function parseMarkdownBlocks(md: string): ContentBlock[] {
  const tokens = marked.lexer(md);
  const blocks: ContentBlock[] = [];

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
        // Check if paragraph contains only an image
        if (isSingleImage(token)) {
          blocks.push({
            kind: 'image',
            uri: (token.tokens![0] as any).href ?? '',
            alt: (token.tokens![0] as any).text ?? '',
          });
        } else {
          blocks.push({
            kind: 'text',
            type: 'paragraph',
            text: plainText(token),
          });
        }
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
            .map((t: any) => plainText(t))
            .join(' ');
          if (liText.trim()) {
            blocks.push({ kind: 'text', type: 'list-item', text: liText });
          }
        }
        break;

      case 'image':
        blocks.push({
          kind: 'image',
          uri: (token as any).href ?? '',
          alt: (token as any).text ?? '',
        });
        break;
    }
  }

  return blocks;
}

/** Check if a paragraph token contains only a single image. */
function isSingleImage(token: any): boolean {
  const children = token.tokens;
  if (!children || children.length !== 1) return false;
  return children[0].type === 'image';
}

/** Walk inner tokens to extract plain text, stripping **bold**, *italic*, `code` markers. */
function plainText(token: any): string {
  // If token has child tokens, walk them to strip inline formatting
  if (token.tokens) return token.tokens.map((t: any) => plainText(t)).join('');
  if (token.type === 'text') return token.text ?? '';
  if (token.type === 'codespan') return token.text ?? '';
  return '';
}
