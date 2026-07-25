# ADR-0012: Build Custom EPUB Parser (Mobile) Rather Than Using epubjs

**Date**: 2026-07-25
**Status**: accepted
**See also**: [EPUB Reader Architecture](../arch/013-epub-reader-architecture.md), [SPEC-012 (EPUB Image Rendering)](../specs/012-epub-image-rendering.md)

## Context

The web app (`apps/web`) uses `epubjs` (`^0.3.93`) to parse EPUB files. When building the mobile EPUB reader (`apps/mobile`), we needed to choose how to parse EPUBs: port `epubjs` to React Native (with polyfills), find a React Native–compatible EPUB library, or build a minimal parser ourselves.

The EPUB reader's core requirement is straightforward: extract the table of contents (TOC), spine (reading order), and plain text from each content document. We do not need page layout, CSS rendering, font embedding, or JavaScript execution — the reader renders everything as plain text with interactive word tokens (`TokenizedText`).

## Options Considered

### Option A: Port epubjs to React Native with polyfills

Add `react-native-fs`, `xmldom`/`@xmldom/xmldom`, a `fetch` polyfill, `url` polyfill, and `blob-polyfill` to satisfy epubjs's browser API dependencies.

- **Pros**: Same library as web — shared mental model, proven EPUB 3 support, built-in image resolution and ruby stripping.
- **Cons**: epubjs is ~140KB minified. The polyfill chain is fragile — epubjs uses `DOMParser`, `Blob`, `URL.createObjectURL`, `fetch`, and `atob`/`btoa` throughout its codebase. Every epubjs update risks breaking the polyfill bridge. epubjs's rendering engine (page layout, CSS, fonts) is entirely wasted — we strip all formatting to plain text. The polyfill surface area is large: 4-5 additional dependencies, none of which are maintained by the epubjs team. Debugging polyfill failures in a complex library is time-consuming and opaque.

### Option B: Use a React Native–specific EPUB library

- **`react-native-epub-reader`** — Unmaintained (last commit 2020), depends on native modules, doesn't work with Expo managed workflow.
- **`@sillsdev/epub-kit`** — React Native wrapper around Readium (C++). Requires native modules. Abandoned.
- **`foliate-js`** — Modern EPUB renderer built as a web component. Could embed in a `WebView` and communicate via `postMessage`. Adds a bridge layer between WebView and React Native.

- **Pros**: Potentially full-featured if one worked.
- **Cons**: None of these libraries are actively maintained for React Native. Native module dependencies break Expo managed workflow. WebView-based approaches lose native `TokenizedText` rendering — would need to reimplement word tapping and dictionary popups in the WebView.

### Option C: Build a minimal custom parser using JSZip + hand-rolled XML parsing

Extract only what we need: TOC, spine, cover, and plain text from content documents. Use `jszip` (already in `package.json` for other purposes) to read the ZIP archive, and regex-based XML parsing for OPF, NCX, and nav documents.

- **Pros**:
  - Zero native dependencies — works in Expo Go, Expo managed builds, and EAS
  - Tiny footprint — the parser (`epub-parser.ts`) is ~240 lines
  - Full control — we decide exactly what to extract and how to handle edge cases
  - Predictable — regex-based parsing of XML metadata files is straightforward; EPUB's XML schemas (OPF, NCX, nav) are stable and well-documented
  - No wasted work — we don't parse CSS, fonts, or layout that we'll immediately discard
  - Image support is a natural extension — already have `JSZip` file access, just need to extract base64 for `<Image>` rendering (SPEC-012)
- **Cons**:
  - Must handle EPUB edge cases ourselves (fragments, nav directory resolution, EPUB 2 vs 3 TOC sources)
  - Must maintain the parser as EPUB specs evolve
  - Not a drop-in replacement if requirements expand (e.g., if we later want rich HTML rendering)

## Decision

**Option C: Build a minimal custom parser using JSZip + hand-rolled XML parsing.**

### Rationale

1. **We don't need EPUB rendering.** The reader's entire value proposition is interactive word lookup (`TokenizedText`) and translation — plain text features. epubjs's most complex subsystems (CSS layout, font loading, page rendering) are dead weight. Using epubjs for plain text extraction is like using a web browser to read `curl` output.

2. **The shared layer handles everything downstream.** Once text is extracted, both platforms use the identical pipeline: `parseMarkdownBlocks` → `TokenizedText` → Python API for lemmatization and translation. The parser's only job is to produce clean text and a TOC. There's no value in having the parser "understand" EPUB semantics beyond that.

3. **The extraction surface is small.** EPUB parsing for our needs reduces to:
   - Reading `META-INF/container.xml` to find the OPF path
   - Parsing the OPF for manifest (image/ content mappings), spine (reading order), and metadata (cover)
   - Parsing the nav document (EPUB 3) or NCX (EPUB 2) for TOC
   - Extracting text from XHTML content documents via regex stripping
   - Resolving relative paths between content documents and images

   All of these are well-understood problems with stable XML schemas. The edge cases encountered so far (fragment stripping, nav directory resolution, nested navPoints, `[IMG:...]` injection) are each ~5-10 line fixes.

4. **Expo compatibility is non-negotiable.** The mobile app must work in Expo Go for development velocity and in Expo managed builds for production. Any library requiring native modules (Readium, custom native EPUB renderers) is incompatible with this constraint. `jszip` is pure JavaScript and works everywhere.

5. **The web and mobile parsers are already different.** The web app uses `epubjs` → `turndown` (HTML→Markdown); the mobile app uses `JSZip` → regex (HTML→plain text). Changing the mobile parser to epubjs wouldn't unify the pipelines — it would just add polyfill complexity for no architectural benefit. The unification happens at the `parseMarkdownBlocks` → `TokenizedText` layer, which is already shared.

6. **Maintenance cost is lower than polyfill cost.** The custom parser is ~240 lines of straightforward string parsing. Debugging a regex mismatch on an XML attribute is a 5-minute fix. Debugging why `URL.createObjectURL` returns `undefined` in React Native's JavaScriptCore engine (which lacks the full URL API) is a multi-hour investigation with uncertain resolution.

## Consequences

### What we gain
- Zero new dependencies for EPUB parsing (JSZip was already in use)
- Works identically in Expo Go, simulator, and production builds
- Full control over text extraction quality and edge case handling
- Natural extension path for image support (SPEC-012) — same `JSZip` file access, just encode as base64 instead of stripping tags

### What we accept
- Must maintain our own EPUB specification knowledge (OPF, NCX, nav document schemas)
- Must handle EPUB edge cases as they're discovered (each ~5-10 line fix)
- Cannot support rich EPUB features (embedded fonts, CSS layout, fixed-layout EPUBs) — acceptable because the reader is text-only by design
- The web and mobile parsers remain different implementations of the same concept — acceptable because they converge at the `parseMarkdownBlocks` layer

### What we avoid
- 4-5 polyfill dependencies that would need ongoing maintenance
- Fragile interop with browser APIs not present in React Native's JavaScriptCore
- epubjs's ~140KB bundle size for features we don't use
- Native module requirements that break Expo managed workflow
- Debugging opaque polyfill failures in a third-party library
