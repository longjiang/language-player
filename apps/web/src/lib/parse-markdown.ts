/**
 * Parses markdown text into reader blocks using remark-parse AST.
 */

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import type { Root, PhrasingContent } from 'mdast';

export interface FormatRange {
  start: number;
  end: number;
  type: 'bold' | 'italic' | 'code' | 'link';
  url?: string;
}

export interface TextBlock {
  kind: 'text';
  type: 'heading' | 'paragraph' | 'list-item' | 'blockquote';
  depth?: number;
  text: string;
  formats: FormatRange[];
}

export interface MarkdownBlock {
  kind: 'markdown';
  raw: string;
}

export type ReaderBlock = TextBlock | MarkdownBlock;

export function parseMarkdown(md: string): ReaderBlock[] {
  const ast = unified().use(remarkParse).parse(md) as Root;
  const blocks: ReaderBlock[] = [];

  for (const node of ast.children) {
    const result = convertTopLevel(node);
    if (Array.isArray(result)) {
      blocks.push(...result);
    } else if (result) {
      blocks.push(result);
    }
  }

  return blocks;
}

function convertTopLevel(node: any): ReaderBlock | ReaderBlock[] | null {
  switch (node.type) {
    case 'heading': {
      // If heading contains an image, render as markdown block so image is preserved
      if (hasImage(node)) return { kind: 'markdown', raw: reconstructNode(node) } as MarkdownBlock;
      return makeTextBlock(node, 'heading', (node as any).depth);
    }

    case 'paragraph': {
      // If paragraph contains an image, render as markdown block
      if (hasImage(node)) return { kind: 'markdown', raw: reconstructNode(node) } as MarkdownBlock;
      return makeTextBlock(node, 'paragraph');
    }

    case 'blockquote': {
      if (hasImage(node)) return { kind: 'markdown', raw: reconstructNode(node) } as MarkdownBlock;
      return makeTextBlock(node, 'blockquote');
    }

    case 'list': {
      const items: ReaderBlock[] = [];
      for (const item of node.children) {
        if (item.type === 'listItem') {
          if (hasImage(item)) {
            items.push({ kind: 'markdown', raw: reconstructNode(item) } as MarkdownBlock);
          } else {
            const b = makeTextBlock(item, 'list-item');
            if (b) items.push(b);
          }
        }
      }
      return items;
    }

    case 'code':
    case 'table':
    case 'thematicBreak':
    case 'image':
      return { kind: 'markdown', raw: reconstructNode(node) } as MarkdownBlock;

    default:
      return null;
  }
}

/** Check if a node tree contains an image (recursive). */
function hasImage(node: any): boolean {
  if (node.type === 'image') return true;
  if (!node.children) return false;
  return node.children.some((c: any) => hasImage(c));
}

/** Extract plain text + formatting ranges from any node with children. */
function makeTextBlock(
  node: any, // Blockquote / ListItem / Heading / Paragraph — all have children
  type: TextBlock['type'],
  depth?: number,
): TextBlock | null {
  const children = node.children as any[] | undefined;
  if (!children || children.length === 0) return null;

  // Collect phrasing content, flattening paragraph wrappers (common in blockquote/listitems)
  const phrasing: PhrasingContent[] = [];
  for (const c of children) {
    if (isPhrasing(c)) {
      phrasing.push(c);
    } else if (c.type === 'paragraph' && c.children) {
      for (const pc of c.children) {
        if (isPhrasing(pc)) phrasing.push(pc);
      }
    }
  }
  if (phrasing.length === 0) return null;

  const { text, formats } = extractTextAndFormats(phrasing);
  if (!text.trim()) return null;

  return { kind: 'text', type, depth, text, formats };
}

function isPhrasing(node: any): node is PhrasingContent {
  const phrasingTypes = ['text', 'strong', 'emphasis', 'inlineCode', 'link', 'image', 'break', 'delete'];
  return phrasingTypes.includes(node.type);
}

/** Walk phrasing children, building plain text and format ranges with offsets. */
function extractTextAndFormats(children: PhrasingContent[]): {
  text: string;
  formats: FormatRange[];
} {
  let text = '';
  const formats: FormatRange[] = [];

  function walk(nodes: PhrasingContent[]) {
    for (const node of nodes) {
      switch (node.type) {
        case 'text':
          text += node.value;
          break;

        case 'strong': {
          const start = text.length;
          walk(node.children);
          formats.push({ start, end: text.length, type: 'bold' });
          break;
        }

        case 'emphasis': {
          const start = text.length;
          walk(node.children);
          formats.push({ start, end: text.length, type: 'italic' });
          break;
        }

        case 'inlineCode': {
          const start = text.length;
          text += node.value;
          formats.push({ start, end: text.length, type: 'code' });
          break;
        }

        case 'link': {
          const start = text.length;
          walk(node.children);
          formats.push({ start, end: text.length, type: 'link', url: node.url });
          break;
        }

        case 'image':
          text += node.alt ?? '';
          break;

        case 'break':
          text += '\n';
          break;

        case 'delete':
          if ('children' in node) walk(node.children as PhrasingContent[]);
          break;

        default:
          break;
      }
    }
  }

  walk(children);
  return { text, formats };
}

/** Reconstruct a node's original markdown (approximate, for ReactMarkdown). */
function reconstructNode(node: any): string {
  switch (node.type) {
    case 'heading': {
      const hashes = '#'.repeat((node as any).depth ?? 1);
      return hashes + ' ' + reconstructChildren(node);
    }
    case 'paragraph':
      return reconstructChildren(node);
    case 'blockquote':
      return '> ' + reconstructChildren(node).replace(/\n/g, '\n> ');
    case 'listItem': {
      const content = reconstructChildren(node);
      // Detect ordered vs unordered from parent context — default to unordered
      return '- ' + content;
    }
    case 'code': {
      const lang = 'lang' in node ? (node as any).lang ?? '' : '';
      return '```' + lang + '\n' + (node as any).value + '\n```';
    }
    case 'thematicBreak':
      return '---';
    case 'table': {
      const rows: string[] = [];
      for (const row of node.children) {
        const cells: string[] = [];
        for (const cell of row.children) {
          cells.push(cell.children.map((c: any) => ('value' in c ? c.value : '')).join(''));
        }
        rows.push('| ' + cells.join(' | ') + ' |');
      }
      return rows.join('\n');
    }
    case 'image': {
      const img = node as any;
      const title = img.title ? ` "${img.title}"` : '';
      return `![${img.alt ?? ''}](${img.url ?? ''}${title})`;
    }
    default:
      return '';
  }
}

/** Reconstruct inline children as markdown. */
function reconstructChildren(node: any): string {
  if (!node.children) return '';
  let out = '';
  for (const child of node.children) {
    switch (child.type) {
      case 'text':
        out += child.value;
        break;
      case 'strong':
        out += '**' + reconstructChildren(child) + '**';
        break;
      case 'emphasis':
        out += '*' + reconstructChildren(child) + '*';
        break;
      case 'inlineCode':
        out += '`' + child.value + '`';
        break;
      case 'link':
        out += '[' + reconstructChildren(child) + '](' + (child.url ?? '') + ')';
        break;
      case 'image': {
        const title = child.title ? ` "${child.title}"` : '';
        out += `![${child.alt ?? ''}](${child.url ?? ''}${title})`;
        break;
      }
      case 'break':
        out += '\n';
        break;
      case 'delete':
        out += '~~' + reconstructChildren(child) + '~~';
        break;
      case 'html':
        out += child.value ?? '';
        break;
      default:
        break;
    }
  }
  return out;
}
