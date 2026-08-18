import { marked } from 'marked';
import type { EpubFormatRange } from '@/lib/epub-parser';

export interface TextBlock {
  kind: 'text';
  type: 'heading' | 'paragraph' | 'list-item' | 'blockquote';
  depth?: number;
  text: string;
  /** EPUB (SPEC-049 §9.1): source element id used to resolve #fragments. */
  srcElementId?: string;
  /** EPUB (SPEC-049 §9.7): inline link ranges mapped onto the text. */
  formats?: EpubFormatRange[];
  /** EPUB: index of the containing spine item (whole-book flow). */
  spineIndex?: number;
  /** EPUB (SPEC-082 Task 5): first block of a spine item — a hard page
   *  start (chapters begin on a fresh page). */
  startsNewSpine?: boolean;
}

export interface ImageBlock {
  kind: 'image';
  uri: string;
  alt?: string;
  /** EPUB (SPEC-082 Task 5): first block of a spine item — a hard page start. */
  startsNewSpine?: boolean;
}

export interface TableBlock {
  kind: 'table';
  header: string[];
  rows: string[][];
}

export type ContentBlock = TextBlock | ImageBlock | TableBlock;

/** Regex matching [IMG:uri] markers injected by use-epub for inline EPUB images. */
const IMG_MARKER_RE = /\[IMG:([^\]]+)\]/;

/** Regex matching markdown syntax at line start or inline patterns. */
const MD_PATTERN = /^(#{1,6}\s|[*\-\+] |\d+\. |> |---+|\|)|```|\[.*\]\(.*\)|!\[.*\]\(.*\)|<[a-z][\s\S]*>/m;

/**
 * Detect if text is plain (no markdown markers). When the user pastes plain
 * text with single line breaks (e.g. from an email or document), each line
 * should become a separate paragraph. Markdown text is left untouched.
 */
function isPlainText(text: string): boolean {
  if (!text.trim()) return true;
  return !MD_PATTERN.test(text);
}

/**
 * Normalize single \n to \n\n for plain text only, without doubling existing
 * \n\n. Handles \r\n, \n\r, and \n consistently.
 */
function normalizeNewlines(text: string): string {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return normalized.replace(/(?<!\n)\n(?!\n)/g, '\n\n');
}

/**
 * Parse text (with optional [IMG:...] markers) into content blocks.
 * Splits on image markers before markdown parsing, so EPUB-injected images
 * are preserved as standalone ImageBlock entries in their original positions.
 * Falls back to standard markdown parsing for non-EPUB content.
 *
 * If the text is plain (no markdown markers), single line breaks are
 * normalized to double line breaks so each line renders as a separate
 * paragraph block. The original text is not modified — this only affects
 * how blocks are computed for display.
 */
export function parseMarkdownBlocks(md: string): ContentBlock[] {
  // Normalize single line breaks for plain text (without modifying the source)
  const normalized = isPlainText(md) ? normalizeNewlines(md) : md;

  // EPUB image markers: split first, then parse each text segment as markdown
  if (IMG_MARKER_RE.test(normalized)) {
    const parts = normalized.split(/(\[IMG:[^\]]+\])/);
    const blocks: ContentBlock[] = [];

    for (const part of parts) {
      const imgMatch = part.match(IMG_MARKER_RE);
      if (imgMatch) {
        blocks.push({ kind: 'image', uri: imgMatch[1]! });
      } else if (part.trim()) {
        blocks.push(...parseMarkdownOnly(part));
      }
    }

    return blocks;
  }

  // Standard markdown parsing (handles markdown-native ![alt](url) images)
  return parseMarkdownOnly(normalized);
}

/**
 * Parse a plain markdown string (no EPUB image markers) into ContentBlock[].
 * Handles headings, paragraphs, blockquotes, lists, and markdown-native images.
 */
function parseMarkdownOnly(md: string): ContentBlock[] {
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
        if (isSingleImage(token)) {
          blocks.push({
            kind: 'image',
            uri: (token.tokens![0] as any).href ?? '',
            alt: (token.tokens![0] as any).text ?? '',
          });
        } else {
          const { text, formats } = flattenWithFormats(token.tokens ?? []);
          blocks.push({
            kind: 'text',
            type: 'paragraph',
            text,
            formats: formats.length ? formats : undefined,
          });
        }
        break;

      case 'blockquote': {
        const { text: bqText, formats } = flattenTokensJoined(token.tokens ?? []);
        if (bqText.trim()) {
          blocks.push({
            kind: 'text',
            type: 'blockquote',
            text: bqText,
            formats: formats.length ? formats : undefined,
          });
        }
        break;
      }

      case 'list':
        for (const item of token.items) {
          const { text: liText, formats } = flattenTokensJoined(item.tokens ?? []);
          if (liText.trim()) {
            blocks.push({
              kind: 'text',
              type: 'list-item',
              text: liText,
              formats: formats.length ? formats : undefined,
            });
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

      case 'table': {
        const header = token.header.map((cell: any) =>
          typeof cell === 'string' ? cell : plainText({ tokens: cell.tokens ?? [] }),
        );
        const rows = token.rows.map((row: any) =>
          row.map((cell: any) =>
            typeof cell === 'string' ? cell : plainText({ tokens: cell.tokens ?? [] }),
          ),
        );
        blocks.push({ kind: 'table', header, rows });
        break;
      }
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

/** Flatten tokens to plain text while recording `link` ranges as formats. */
function flattenWithFormats(tokens: any[]): { text: string; formats: EpubFormatRange[] } {
  let text = '';
  const formats: EpubFormatRange[] = [];

  const walk = (items: any[]) => {
    for (const t of items) {
      if (t.type === 'link') {
        const start = text.length;
        const inner = flattenWithFormats(t.tokens ?? []);
        text += inner.text;
        if (t.href) {
          formats.push({ start, end: text.length, type: 'link', url: t.href });
        }
        formats.push(...inner.formats.map((f) => ({
          ...f,
          start: f.start + start,
          end: f.end + start,
        })));
      } else if (t.type === 'strong' || t.type === 'em') {
        const start = text.length;
        const inner = flattenWithFormats(t.tokens ?? []);
        text += inner.text;
        formats.push({
          start,
          end: text.length,
          type: t.type === 'strong' ? 'bold' : 'italic',
        });
        formats.push(...inner.formats.map((f) => ({
          ...f,
          start: f.start + start,
          end: f.end + start,
        })));
      } else if (t.tokens) {
        walk(t.tokens);
      } else if (t.type === 'codespan') {
        const start = text.length;
        text += t.text ?? '';
        formats.push({ start, end: text.length, type: 'code' });
      } else if (t.type === 'text') {
        text += t.text ?? '';
      }
    }
  };

  walk(tokens);
  return { text, formats };
}

/** Join multiple token groups with spaces, preserving format offsets. */
function flattenTokensJoined(tokens: any[]): { text: string; formats: EpubFormatRange[] } {
  let text = '';
  const formats: EpubFormatRange[] = [];
  for (const t of tokens) {
    if (text) text += ' ';
    const offset = text.length;
    const r = flattenWithFormats([t]);
    text += r.text;
    formats.push(...r.formats.map((f) => ({
      ...f,
      start: f.start + offset,
      end: f.end + offset,
    })));
  }
  return { text, formats };
}
