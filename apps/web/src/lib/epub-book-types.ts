/**
 * Shared EPUB book-model types (web). Mirrors the shapes the mobile parser
 * produces so both platforms can converge later.
 */

/** One node of the book's table of contents (nav document or NCX). */
export interface TocNode {
  /** Stable id when the source nav doc / NCX provided one. */
  id?: string;
  label: string;
  /** Canonical zip-relative href, fragment preserved. */
  href: string;
  /** Fragment part of the href, without the leading '#'. */
  fragment?: string;
  children: TocNode[];
}

/** One content document in the reading order. */
export interface EpubSpineItem {
  index: number;
  idref: string;
  /** Canonical zip-relative path, fragment stripped. */
  href: string;
  /** Raw manifest href as written in the OPF — used for epubjs loads. */
  hrefRaw: string;
  /** false for <itemref linear="no"> (auxiliary content). */
  linear: boolean;
  mediaType?: string;
}

/** Precise position in the converted block stream of the whole book. */
export interface BookLocation {
  spineIndex: number;
  blockIndex: number;
  /** Character offset within the block's (normalized) text. */
  offset: number;
}

/** Inline formatting inside a text block. */
export interface EpubFormatRange {
  start: number;
  end: number;
  type: 'bold' | 'italic' | 'code' | 'link' | 'highlight';
  url?: string;
}

/** Inline element id found inside a block — used to resolve #fragments. */
export interface EpubBlockAnchor {
  id: string;
  /** Char offset of the anchored element within the block's text. */
  offset: number;
}

export interface EpubTextBlock {
  kind: 'text';
  type: 'heading' | 'paragraph' | 'list-item' | 'blockquote' | 'pre';
  depth?: number;
  text: string;
  formats: EpubFormatRange[];
  /** Id of the block's own element or nearest ancestor with an id. */
  srcElementId?: string;
  /** Char offset of the block's start within its source element. */
  srcCharBase: number;
  anchors: EpubBlockAnchor[];
}

export interface EpubImageBlock {
  kind: 'image';
  /** Blob/data URL (session-lifetime). */
  imageUri: string;
  alt?: string;
  srcElementId?: string;
  srcCharBase: number;
  anchors: EpubBlockAnchor[];
}

export type EpubBlock = EpubTextBlock | EpubImageBlock;

/** A TOC entry resolved to its position in the book flow. */
export interface TocMarker {
  node: TocNode;
  /** Ancestor chain, root first, including the node itself. */
  path: TocNode[];
  location: BookLocation;
  /** Document order in the flattened TOC (0-based). */
  order: number;
}
