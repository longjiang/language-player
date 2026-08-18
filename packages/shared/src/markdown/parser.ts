/**
 * Unified markdown → ContentBlock parser (SPEC-083).
 *
 * remark-parse + remark-gfm produce an mdast AST; the walkers below (ported
 * from apps/web/src/lib/parse-markdown.ts) flatten it into the shared block
 * model with inline format ranges (bold/italic/code/link/strikethrough) that
 * TokenizedText applies per token. Both apps consume this exact module, so a
 * fix here lands on web and mobile at once.
 *
 * Behavior notes:
 * - GFM is enabled (tables, strikethrough, autolinks).
 * - `repairDelimiters` fixes CommonMark flanking refusals for CJK text
 *   (e.g. `**調理時間：**20分` — the closing `**` can't right-flank, so remark
 *   would keep the asterisks literal).
 * - List items stay FLAT top-level blocks (pagination/search stay simple),
 *   each carrying `listDepth` + `ordered`/`start`; nested lists are walked
 *   recursively.
 * - Paragraphs mixing text and images are split into adjacent
 *   text/image blocks so nothing disappears.
 * - `preserveIds` consumes `<a id="…"></a>` anchors (emitted by
 *   `htmlToMarkdown` for EPUB) as `srcElementId` markers on the following
 *   block, so `#fragment` TOC links survive the HTML→MD→blocks path.
 */

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import type { Root, PhrasingContent } from 'mdast';
import type { ContentBlock, FormatRange, TableBlock, TextBlock } from './types';

export interface MarkdownParseOptions {
  /** Consume `<a id="…"></a>` anchors as srcElementId markers for the
   *  following block (EPUB fragment support, SPEC-083). */
  preserveIds?: boolean;
}

/**
 * CommonMark's flanking rules refuse to close `**…**` / `*…*` when the marked
 * text ends in punctuation immediately followed by more non-space text — e.g.
 * `**調理時間：**20分` (the closing `**` is preceded by `：` and followed by a
 * digit, so it can't right-flank and remark keeps the asterisks literal).
 * Turndown emits exactly this shape for CJK pages. Repair by moving the
 * trailing punctuation after the closing delimiter: the plain text is
 * unchanged, only the punctuation's boldness differs.
 */
export function repairDelimiters(md: string): string {
  return md
    .replace(/\*\*([^*\n]+?)([\p{P}]+)\*\*(?=[^\s\p{P}])/gu, '**$1**$2')
    .replace(/(?<!\*)\*([^*\n]+?)([\p{P}]+)\*(?!\*)(?=[^\s\p{P}])/gu, '*$1*$2');
}

/** Parse markdown into the shared flat block model. */
export function parseMarkdownBlocks(md: string, opts: MarkdownParseOptions = {}): ContentBlock[] {
  const ast = unified().use(remarkParse).use(remarkGfm).parse(repairDelimiters(md)) as Root;
  const blocks: ContentBlock[] = [];
  const state: { pendingSrcId: string | null } = { pendingSrcId: null };

  for (const node of ast.children) {
    blocks.push(...convertTopLevel(node, 0, opts, state));
  }

  return blocks;
}

function convertTopLevel(
  node: any,
  listDepth: number,
  opts: MarkdownParseOptions,
  state: { pendingSrcId: string | null },
): ContentBlock[] {
  switch (node.type) {
    case 'heading':
      return splitImages(node, 'heading', node.depth, undefined, opts, state);

    case 'paragraph':
      return splitImages(node, 'paragraph', undefined, undefined, opts, state);

    case 'blockquote':
      return splitImages(node, 'blockquote', undefined, undefined, opts, state);

    case 'list': {
      const out: ContentBlock[] = [];
      const listMeta = { ordered: node.ordered === true, start: node.start ?? 1 };
      for (const item of node.children ?? []) {
        if (item.type !== 'listItem') continue;
        // List items contain block content plus nested lists; emit the item's
        // own content first (flat), then recurse into nested lists at depth+1.
        const contentNodes: any[] = [];
        const nestedLists: any[] = [];
        for (const child of item.children ?? []) {
          if (child.type === 'list') nestedLists.push(child);
          else contentNodes.push(child);
        }
        if (contentNodes.length > 0) {
          out.push(
            ...splitImagesFromChildren(
              contentNodes,
              'list-item',
              listDepth,
              listMeta,
              opts,
              state,
            ),
          );
        }
        for (const nested of nestedLists) {
          out.push(...convertTopLevel(nested, listDepth + 1, opts, state));
        }
      }
      return out;
    }

    case 'code':
      return [{ kind: 'code', language: node.lang ?? undefined, text: node.value }];

    case 'html': {
      if (opts.preserveIds) {
        const id = anchorId(node.value);
        if (id) {
          state.pendingSrcId = id;
          return [];
        }
      }
      if (!node.value?.trim()) return [];
      return [{ kind: 'html', text: node.value }];
    }

    case 'thematicBreak':
      return [{ kind: 'hr' }];

    case 'table':
      return [tableToBlock(node)];

    case 'image':
      return [{ kind: 'image', uri: node.url ?? '', alt: node.alt ?? '' }];

    default:
      return [];
  }
}

/** True when an html node is a standalone `<a id="…"></a>` anchor marker. */
function anchorId(value: string): string | null {
  const m = value.trimStart().match(/^<a\s+id=["']([^"']+)["']/i);
  return m?.[1] ?? null;
}

/** Convert a GFM table node to a TableBlock (cell inline formatting dropped). */
function tableToBlock(node: any): TableBlock {
  const rows: any[] = node.children ?? [];
  const header = (rows[0]?.children ?? []).map(cellPlainText);
  const body = rows
    .slice(1)
    .map((row: any) => (row.children ?? []).map(cellPlainText));
  return { kind: 'table', header, rows: body };
}

function cellPlainText(cell: any): string {
  return (cell.children ?? [])
    .map((c: any) => ('value' in c ? c.value : ''))
    .join('');
}

/**
 * Split a block node (heading/paragraph/blockquote) whose phrasing content
 * may contain images into adjacent text/image blocks, preserving order.
 */
function splitImages(
  node: any,
  type: TextBlock['type'],
  depth: number | undefined,
  listMeta: { ordered: boolean; start: number } | undefined,
  opts: MarkdownParseOptions,
  state: { pendingSrcId: string | null },
): ContentBlock[] {
  // Flatten phrasing content, unwrapping paragraph wrappers (common in
  // blockquote/list-item children).
  const phrasing: any[] = [];
  for (const c of node.children ?? []) {
    if (isPhrasing(c)) phrasing.push(c);
    else if (c.type === 'paragraph' && c.children) phrasing.push(...c.children);
  }
  return splitImagesFromPhrasing(
    phrasing,
    type,
    depth,
    listMeta ? { ...listMeta, listDepth: 0 } : undefined,
    opts,
    state,
  );
}

function splitImagesFromChildren(
  children: any[],
  type: TextBlock['type'],
  listDepth: number,
  listMeta: { ordered: boolean; start: number },
  opts: MarkdownParseOptions,
  state: { pendingSrcId: string | null },
): ContentBlock[] {
  // Unwrap paragraph wrappers, then split on images.
  const phrasing: any[] = [];
  for (const c of children) {
    if (c.type === 'paragraph' && c.children) phrasing.push(...c.children);
    else if (isPhrasing(c)) phrasing.push(c);
  }
  return splitImagesFromPhrasing(
    phrasing,
    type,
    undefined,
    { ...listMeta, listDepth },
    opts,
    state,
  );
}

function splitImagesFromPhrasing(
  phrasing: any[],
  type: TextBlock['type'],
  depth: number | undefined,
  listMeta: { ordered: boolean; start: number; listDepth: number } | undefined,
  opts: MarkdownParseOptions,
  state: { pendingSrcId: string | null },
): ContentBlock[] {
  const out: ContentBlock[] = [];
  let pending: any[] = [];

  const flush = () => {
    if (pending.length === 0) return;
    const block = makeTextBlock(pending, type, depth, listMeta, opts, state);
    if (block) out.push(block);
    pending = [];
  };

  for (const c of phrasing) {
    if (c.type === 'image') {
      flush();
      out.push({ kind: 'image', uri: c.url ?? '', alt: c.alt ?? '' });
    } else if (c.type === 'html') {
      // `<a id="…"></a>` anchors are INLINE html in CommonMark (not block
      // html), so they surface as paragraph children. Consume them as
      // srcElementId markers when preserveIds; otherwise drop (web parity —
      // web's walker also ignores inline html).
      if (opts.preserveIds) {
        const id = anchorId(c.value);
        if (id) {
          state.pendingSrcId = id;
          continue;
        }
      }
      // Non-anchor inline html: dropped, not rendered as text.
    } else {
      pending.push(c);
    }
  }
  flush();
  return out;
}

function isPhrasing(node: any): boolean {
  const phrasingTypes = [
    'text',
    'strong',
    'emphasis',
    'inlineCode',
    'link',
    'image',
    'break',
    'delete',
    'html',
  ];
  return phrasingTypes.includes(node.type);
}

/** Build a TextBlock from phrasing content, applying pending srcElementId. */
function makeTextBlock(
  children: any[],
  type: TextBlock['type'],
  depth: number | undefined,
  listMeta: { ordered: boolean; start: number; listDepth: number } | undefined,
  opts: MarkdownParseOptions,
  state: { pendingSrcId: string | null },
): TextBlock | null {
  const { text, formats } = extractTextAndFormats(children);
  if (!text.trim()) return null;

  const block: TextBlock = {
    kind: 'text',
    type,
    text,
    formats,
    ...(depth !== undefined ? { depth } : {}),
  };
  if (listMeta) {
    block.listDepth = listMeta.listDepth;
    block.ordered = listMeta.ordered;
    block.start = listMeta.start;
  }
  if (opts.preserveIds && state.pendingSrcId) {
    block.srcElementId = state.pendingSrcId;
    state.pendingSrcId = null;
  }
  return block;
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
          walk(node.children ?? []);
          formats.push({ start, end: text.length, type: 'bold' });
          break;
        }

        case 'emphasis': {
          const start = text.length;
          walk(node.children ?? []);
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
          walk(node.children ?? []);
          formats.push({ start, end: text.length, type: 'link', url: node.url });
          break;
        }

        case 'image':
          text += node.alt ?? '';
          break;

        case 'break':
          text += '\n';
          break;

        case 'delete': {
          const start = text.length;
          walk(node.children ?? []);
          formats.push({ start, end: text.length, type: 'strikethrough' });
          break;
        }

        default:
          break;
      }
    }
  }

  walk(children);
  return { text, formats };
}
