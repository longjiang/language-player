/**
 * Block streams for the shared CSS-columns pager (SPEC-077).
 *
 * Every web reader (notes, web-reader, EPUB) exposes its content as a single
 * global stream of blocks. The pager hook only consumes this interface, so
 * one panel serves all three readers. A stream may be lazy (EPUB spine items
 * load on demand), so char math goes through `warm()` + `charsBefore()`
 * instead of touching block objects directly.
 */

import type { ReaderBlock } from '@/lib/parse-markdown';
import type { EpubBook } from '@/lib/epub-book';
import type { BookLocation, EpubBlock } from '@/lib/epub-book-types';

/** A position in the reader's global block stream. */
export interface ReaderLocation {
  /** Index into the stream's global block sequence. */
  streamIndex: number;
  /** Character offset within the block's text (paging is block-granular). */
  offset: number;
}

export interface BlockStream<B> {
  /** Identity token — a changed id resets the pager (new stream instance). */
  readonly id: string;
  /** Number of blocks currently known. May grow as lazy sources load. */
  readonly blockCount: number;
  /**
   * Total text characters of the whole stream. Valid only after `warm()`
   * has been called (returns 0 before).
   */
  totalChars(): number;
  /**
   * Warm any caches needed so `charsBefore()` and `blocks()` are fast for
   * the given range (and the global char map is complete).
   */
  warm(from: number, to: number): Promise<void>;
  /**
   * Cumulative text chars before `streamIndex` (chars of blocks [0, i)).
   * Synchronous once `warm()` has completed.
   */
  charsBefore(streamIndex: number): number;
  /** Fetch blocks [from, to). */
  blocks(from: number, to: number): Promise<B[]>;
  /** Whether this block participates in tokenization/translation. */
  isTextBlock(block: B): boolean;
  /** Plain text of a block (for lemmatization/translation requests). */
  blockText(block: B): string;
  streamIndexToLocation(streamIndex: number): ReaderLocation;
  locationToStreamIndex(loc: ReaderLocation): number;
}

// ── Markdown stream (notes reader + web reader) ──────────────────────────

let markdownStreamSeq = 0;

/** Sync stream over a parsed markdown block array. */
export class MarkdownBlockStream implements BlockStream<ReaderBlock> {
  readonly id: string;
  readonly blockCount: number;
  private readonly prefix: number[];

  constructor(private readonly items: ReaderBlock[]) {
    this.id = `md:${++markdownStreamSeq}:${items.length}`;
    this.blockCount = items.length;
    this.prefix = new Array(items.length + 1);
    this.prefix[0] = 0;
    for (let i = 0; i < items.length; i++) {
      this.prefix[i + 1] = this.prefix[i]! + blockTextLength(items[i]!);
    }
  }

  totalChars(): number {
    return this.prefix[this.blockCount] ?? 0;
  }

  async warm(_from: number, _to: number): Promise<void> {
    // Synchronous stream — nothing to warm.
  }

  charsBefore(streamIndex: number): number {
    return this.prefix[Math.max(0, Math.min(streamIndex, this.blockCount))] ?? 0;
  }

  async blocks(from: number, to: number): Promise<ReaderBlock[]> {
    return this.items.slice(Math.max(0, from), Math.max(from, Math.min(to, this.blockCount)));
  }

  isTextBlock(block: ReaderBlock): boolean {
    return block.kind === 'text';
  }

  blockText(block: ReaderBlock): string {
    return block.kind === 'text' ? block.text : block.raw;
  }

  streamIndexToLocation(streamIndex: number): ReaderLocation {
    return { streamIndex, offset: 0 };
  }

  locationToStreamIndex(loc: ReaderLocation): number {
    return Math.max(0, Math.min(loc.streamIndex, this.blockCount - 1));
  }
}

function blockTextLength(b: ReaderBlock): number {
  return b.kind === 'text' ? b.text.length : b.raw.length;
}

// ── EPUB stream adapter ───────────────────────────────────────────────────

/**
 * Adapter over `EpubBook` presenting the whole spine as one block stream.
 * The spine map (block counts + char offsets per spine item) is built by the
 * first `warm()` — the same per-spine text data the book already caches.
 */
export class EpubBlockStream implements BlockStream<EpubBlock> {
  readonly id: string;

  private spineMap: {
    spineIndex: number;
    /** Global stream index of this spine item's first block. */
    blockStart: number;
    blockCount: number;
    /** Total chars of all blocks before this spine item. */
    charsBefore: number;
    text: string;
    starts: number[];
  }[] | null = null;
  private totalCharsValue = 0;

  constructor(
    private readonly book: EpubBook,
    private readonly openId: string,
  ) {
    this.id = `epub:${openId}`;
  }

  get blockCount(): number {
    if (!this.spineMap || this.spineMap.length === 0) return 0;
    const last = this.spineMap[this.spineMap.length - 1]!;
    return last.blockStart + last.blockCount;
  }

  totalChars(): number {
    return this.totalCharsValue;
  }

  async warm(_from: number, _to: number): Promise<void> {
    if (this.spineMap) return;
    const items = this.book.spine;
    const map: NonNullable<EpubBlockStream['spineMap']> = [];
    let blockStart = 0;
    let charsBefore = 0;
    for (let s = 0; s < items.length; s++) {
      const { text, starts } = await this.book.spineTextData(s);
      map.push({ spineIndex: s, blockStart, blockCount: starts.length, charsBefore, text, starts });
      blockStart += starts.length;
      charsBefore += text.length;
    }
    this.spineMap = map;
    this.totalCharsValue = charsBefore;
  }

  /** (spineIndex, blockIndex) for a global stream index (binary search). */
  private locate(streamIndex: number): { spine: number; block: number } {
    const map = this.spineMap!;
    let lo = 0;
    let hi = map.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (map[mid]!.blockStart <= streamIndex) lo = mid;
      else hi = mid - 1;
    }
    const s = map[lo]!;
    return { spine: lo, block: Math.min(s.blockCount - 1, Math.max(0, streamIndex - s.blockStart)) };
  }

  charsBefore(streamIndex: number): number {
    const map = this.spineMap!;
    if (map.length === 0) return 0;
    if (streamIndex >= this.blockCount) return this.totalCharsValue;
    const { spine, block } = this.locate(streamIndex);
    const s = map[spine]!;
    return s.charsBefore + (s.starts[block] ?? 0);
  }

  async blocks(from: number, to: number): Promise<EpubBlock[]> {
    const map = this.spineMap!;
    if (map.length === 0 || to <= from) return [];
    const out: EpubBlock[] = [];
    const { spine, block } = this.locate(from);
    let s = spine;
    let b = block;
    while (out.length < to - from && s < map.length) {
      const spineBlocks = await this.book.getBlocks(s);
      while (b < spineBlocks.length && out.length < to - from) {
        out.push(spineBlocks[b]!);
        b += 1;
      }
      s += 1;
      b = 0;
    }
    return out;
  }

  isTextBlock(block: EpubBlock): boolean {
    return block.kind === 'text';
  }

  blockText(block: EpubBlock): string {
    return block.kind === 'text' ? block.text : '';
  }

  streamIndexToLocation(streamIndex: number): ReaderLocation {
    return { streamIndex, offset: 0 };
  }

  locationToStreamIndex(loc: ReaderLocation): number {
    return Math.max(0, Math.min(loc.streamIndex, Math.max(0, this.blockCount - 1)));
  }

  /** EPUB-specific: global stream index → book location (for persistence). */
  bookLocationAt(streamIndex: number): BookLocation {
    const map = this.spineMap!;
    if (map.length === 0) return { spineIndex: 0, blockIndex: 0, offset: 0 };
    const { spine, block } = this.locate(streamIndex);
    return { spineIndex: spine, blockIndex: block, offset: 0 };
  }

  /** EPUB-specific: book location → global stream index. */
  bookLocationToStreamIndex(loc: BookLocation): number {
    const map = this.spineMap!;
    if (map.length === 0) return 0;
    if (loc.spineIndex < 0 || loc.spineIndex >= map.length) return this.blockCount - 1;
    const s = map[loc.spineIndex]!;
    if (s.blockCount === 0) return s.blockStart;
    return s.blockStart + Math.max(0, Math.min(loc.blockIndex, s.blockCount - 1));
  }
}
