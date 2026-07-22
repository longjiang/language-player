import { unified } from 'unified';
import remarkParse from 'remark-parse';
import type { Root } from 'mdast';

export interface TextBlock {
  kind: 'text';
  type: 'heading' | 'paragraph' | 'list-item' | 'blockquote';
  depth?: number;
  text: string;
}

/**
 * Parse markdown into plain-text blocks for tokenization.
 * Headings (#, ##, ###), paragraphs, blockquotes (> ), and list items (-, *, 1.)
 * all become TextBlock entries. Code blocks, tables, images, and horizontal rules
 * are skipped (not supported in mobile reader yet).
 */
export function parseMarkdownBlocks(md: string): TextBlock[] {
  const ast = unified().use(remarkParse).parse(md) as Root;
  const blocks: TextBlock[] = [];

  for (const node of ast.children as any[]) {
    switch (node.type) {
      case 'heading': {
        const text = extractPlainText(node);
        if (!text.trim()) break;
        blocks.push({ kind: 'text', type: 'heading', depth: (node as any).depth, text });
        break;
      }
      case 'paragraph': {
        const text = extractPlainText(node);
        if (!text.trim()) break;
        blocks.push({ kind: 'text', type: 'paragraph', text });
        break;
      }
      case 'blockquote': {
        const text = extractPlainText(node);
        if (!text.trim()) break;
        blocks.push({ kind: 'text', type: 'blockquote', text });
        break;
      }
      case 'list': {
        for (const item of (node as any).children ?? []) {
          const text = extractPlainText(item);
          if (!text.trim()) continue;
          blocks.push({ kind: 'text', type: 'list-item', text });
        }
        break;
      }
      // code, table, thematicBreak, image — skip for now
    }
  }

  return blocks;
}

/** Walk a node tree and collect all text values into a single string. */
function extractPlainText(node: any): string {
  if (node.type === 'text') return node.value ?? '';
  if (node.type === 'inlineCode') return node.value ?? '';
  if (node.type === 'break') return '\n';
  let result = '';
  if (node.children) {
    for (const child of node.children) {
      result += extractPlainText(child);
    }
  }
  return result;
}
