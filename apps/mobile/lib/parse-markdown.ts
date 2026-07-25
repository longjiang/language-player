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
}

export type ContentBlock = TextBlock | ImageBlock;

/** Regex matching [IMG:dataUri] markers injected by use-epub. */
const IMG_MARKER_RE = /\[IMG:([^\]]+)\]/;

/**
 * Parse text (with optional [IMG:...] markers) into interleaved content blocks.
 * Splits on image markers before markdown parsing, so images are preserved
 * as standalone ImageBlock entries in their original positions.
 */
export function parseMarkdownBlocks(md: string): ContentBlock[] {
  // Split on image markers, keeping the markers in the result array
  const parts = md.split(/(\[IMG:[^\]]+\])/);
  const blocks: ContentBlock[] = [];

  for (const part of parts) {
    const imgMatch = part.match(IMG_MARKER_RE);
    if (imgMatch) {
      // Emit an ImageBlock for each marker
      blocks.push({ kind: 'image', uri: imgMatch[1]! });
    } else if (part.trim()) {
      // Parse text segment as markdown
      const textBlocks = parseTextBlocks(part);
      blocks.push(...textBlocks);
    }
  }

  return blocks;
}

/**
 * Parse a plain markdown string (no image markers) into TextBlock[].
 */
function parseTextBlocks(md: string): TextBlock[] {
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
          .map((t: any) => plainText(t))
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
  return '';
}
