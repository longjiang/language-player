/**
 * Unified markdown block model (SPEC-083).
 *
 * Pure types — no React/RN/Next imports — consumed by both apps/web and
 * apps/mobile. Superset of the legacy models:
 * - web's `ReaderBlock` (TextBlock + raw markdown reconstruction via
 *   `reconstructRaw`), and
 * - mobile's `ContentBlock` (TextBlock + ImageBlock + TableBlock), extended
 *   with CodeBlock / ThematicBreakBlock / HtmlBlock and list metadata.
 */

export interface FormatRange {
  start: number;
  end: number;
  type: 'link' | 'highlight' | 'bold' | 'italic' | 'code' | 'strikethrough';
  /** Raw href from the source (relative or absolute, may carry #fragment). */
  url?: string;
}

export type TextBlockType = 'heading' | 'paragraph' | 'list-item' | 'blockquote';

export interface TextBlock {
  kind: 'text';
  type: TextBlockType;
  /** Heading level (1–6) for `type: 'heading'`. */
  depth?: number;
  /** List nesting level (0 = top) for `type: 'list-item'`. */
  listDepth?: number;
  /** True when the item's list is ordered (`1.`, `3.`, …). */
  ordered?: boolean;
  /** Starting number of the item's ordered list. */
  start?: number;
  text: string;
  /** Inline format ranges (bold/italic/code/link/strikethrough/highlight). */
  formats: FormatRange[];
  /** EPUB: source element id (own or nearest ancestor) — resolves #fragments. */
  srcElementId?: string;
  /** EPUB: index of the containing spine item (whole-book flow). */
  spineIndex?: number;
  /** EPUB: first block of a spine item — a hard page start. */
  startsNewSpine?: boolean;
}

export interface CodeBlock {
  kind: 'code';
  /** Fenced-code language tag, if any (e.g. `ts`). */
  language?: string;
  text: string;
}

export interface ThematicBreakBlock {
  kind: 'hr';
}

/** Raw inline HTML passthrough (never executed — rendered as muted source). */
export interface HtmlBlock {
  kind: 'html';
  text: string;
}

export interface ImageBlock {
  kind: 'image';
  uri: string;
  alt?: string;
  /** EPUB: first block of a spine item — a hard page start. */
  startsNewSpine?: boolean;
}

export interface TableBlock {
  kind: 'table';
  header: string[];
  rows: string[][];
}

export type ContentBlock =
  | TextBlock
  | CodeBlock
  | ThematicBreakBlock
  | HtmlBlock
  | ImageBlock
  | TableBlock;
