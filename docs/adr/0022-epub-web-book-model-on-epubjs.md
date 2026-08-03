# ADR-0022: Keep epubjs on Web — Layer the Whole-Book Model on Top

**Date**: 2026-08-02
**Status**: accepted
**See also**: [SPEC-032 (EPUB Re-Engineering)](../specs/032-epub-reader-re-engineering.md), [ADR-0012 (Custom EPUB Parser for Mobile)](0012-custom-epub-parser-mobile.md), [ARCH-013 (EPUB Reader Architecture)](../arch/013-epub-reader-architecture.md)

## Context

SPEC-032 re-engineers the web EPUB reader around the book model: the spine is the reading flow, the TOC is a hierarchy of bookmarks into it, and every navigation/search/restore action resolves to a `BookLocation { spineIndex, blockIndex, offset }` over a continuous block stream with whole-book pagination.

The original spec draft proposed replacing `epubjs` with a new shared parser package. Reconsidering, we decided **not** to:

- `epubjs` already handles ZIP/OPF parsing, spine, cover, and content loading — re-implementing that is exactly the "reinvent the wheel" we wanted to avoid.
- `turndown` stays for the article reader (`reader`/`web-reader` pages); it was never slated for removal from the web app.
- The web and mobile apps already have different parsers (ADR-0012 chose a hand-rolled parser for mobile because epubjs does not fit React Native without fragile polyfills). Building a shared parser would unify them eventually, but it is a separate, larger effort than the reader re-engineering.

## Decision

**Keep `epubjs` (and `turndown`) on web, and layer the whole-book model on top of epubjs** in `apps/web/src/lib/epub-book.ts`.

The new layer owns everything the reader actually needs beyond parsing:

1. **Canonical href resolution** — epubjs leaves spine hrefs OPF-relative and TOC hrefs nav-document-relative, never aligning them. `EpubBook` resolves both to zip-relative canonical paths, fixing empty chapters and missed search on books with nested nav documents (the known epubjs gap).
2. **TOC mapping** — epubjs's nested `toc` becomes the shared `TocNode` tree (full hierarchy).
3. **Content conversion** — each spine document becomes `EpubBlock[]` via a browser-DOM walker with source mapping (element ids + char offsets), so `#fragment`s and internal links resolve precisely without text-anchor heuristics.
4. **Locations** — TOC entries, links, search hits, and saved positions all resolve to `BookLocation`.

## Consequences

### Gained

- No new parser dependency and no new package to maintain.
- epubjs's proven EPUB 2/3 parsing (nav + NCX, cover, archive) stays.
- The chapter-at-a-time model, spine-range concatenation, per-TOC-chapter search indexing, and 40-char text anchors are gone from web.

### Accepted

- epubjs's nav parser still drops TOC entries whose `<a>` is not a direct child of `<li>` (rare in practice); hierarchy comes from epubjs's nested `toc`.
- Web (epubjs) and mobile (hand-rolled JSZip parser) remain two implementations of the same book model. A future unification is a separate ADR.
- The browser-DOM converter is web-local; mobile keeps its regex pipeline.
