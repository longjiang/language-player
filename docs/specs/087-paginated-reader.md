# Paginated Reader

## Metadata
- **Spec ID**: SPEC-087
- **Feature**: The paginated reading component shared by the web and mobile readers — paged reading, content parsing, translation, and tokenized-text actions
- **Status**: draft
- **Created**: 2026-08-23
- **ROADMAP Phase**: Phase 5 (Content Features) — "Reader and Notes"
- **Scope**: `apps/web` and `apps/mobile` paginated reader
- **See also**: [SPEC-083 — Mobile Unified Markdown](083-mobile-unified-markdown.md) · [SPEC-078 — Resizable Text|Translation Splitter](078-resizable-text-translation-splitter.md) · [SPEC-077 — CSS-Columns Paginated Reader Panel](077-css-columns-paginated-reader.md) · [SPEC-084 — Mobile Selection Dictionary](084-mobile-selection-dictionary.md) · [SPEC-082 — Mobile/Web Parity Reader](082-mobile-web-parity-reader-subs-sync.md) · [ARCH-030 — Native Ruby Text Rendering](../arch/030-ruby-text-native-rendering.md)

## Overview

The Paginated Reader is how someone reads any text in Language Player — a translated article, an EPUB book, or pasted text — in **pages** rather than a continuous scroll. It shows the target-language (L2) text as interactive, tappable words with optional pronunciation (ruby), together with the native-language (L1) translation. On a wide screen the translation sits beside the text in a column you can resize; on a narrow screen it sits below it. The L2 and the translation stay aligned line-for-line, whether or not readings are shown.

This spec describes what the reader must do — the finished product behavior — for both web and mobile. Where the two platforms differ it is only because of the input/output they have (touch vs mouse/keyboard, a wide window vs a tablet), never in the feature set.

## User Stories

- As a reader, I want the text broken into whole pages that fill the screen exactly, so I read forward one page at a time without a scrolling bar.
- As a reader, I want to turn pages with buttons and by swiping/flicking (and on web by keyboard), so it feels natural on my device.
- As a reader, I want every word tappable to open its dictionary entry, and each paragraph to offer Copy / Speak / AI Explain / Translation, so I can look things up without leaving the page.
- As a learner, I want the translation on the right on wide screens and below on narrow screens, kept aligned to the words, so I can follow the meaning line by line.
- As a reader, I want to widen the text or translation column myself and have that choice stick, so I can read the way I prefer.
- As a reader, I want a book's real structure (headings, lists, tables, images, code) preserved and each chapter to start a new page, so reading feels like the original.

## Requirements

These are grouped by feature area. Each requirement describes the finished behavior, not how it is built.

### 1. Paged reading

- **One page per screenful.** The reader lays the content into pages so that each page fills the available viewport height exactly. There is no continuous vertical scroll bar between pages; a tall block can scroll *within* the page, but page breaks are the primary navigation.
- **Navigation.** The reader always exposes previous/next controls and a page counter. The counter is tappable/clickable and opens a **jump-to-page** dialog.
- **Page count.** Once measured, the total page count is exact. A large book still in progress shows an **estimated** count (marked with a `~`) and refines to the exact count once measurement settles.
- **Turn gestures.** All of these turn a page:
  - previous/next buttons;
  - a swipe/flick on touch (a flick past a small distance or with enough velocity turns the page; a short drag snaps back, and an in-progress turn is cancelled);
  - keyboard on web (`←`/`↑`/`PageUp` previous; `→`/`↓`/`PageDown`/`Space` next), ignored while typing or focused on a control;
  - a pointer drag-flick on web; a mouse drag is reserved for selecting text; a trackpad horizontal wheel swipe also pages on web.
- **Re-pagination without losing your place.** When the content, the window/viewport size, the text size or zoom, the line spacing, the translation setting, the translation size, or the column split changes, the reader re-paginates — but it keeps you on the block you were reading rather than snapping back to page 1.
- **Immersive reading (books).** In a book, the reader chrome can be hidden. Tapping the blank area toggles the chrome; when hidden, a muted chapter title and page count stay overlaid. Top and bottom reserved strips keep the controls reachable.

### 2. Content parsing (markdown and HTML/EPUB)

- **One shared pipeline.** Web and mobile use the same parser so a document renders identically on both.
- **Block model.** Markdown and HTML become a flat list of blocks:
  - headings 1–6;
  - paragraphs;
  - blockquotes;
  - list items, nested, with ordered/bulleted markers and numbering;
  - fenced code (with its language);
  - thematic breaks (`hr`);
  - raw inline HTML — shown as its source, never executed;
  - images;
  - GFM tables (real rows/columns, not preformatted text).
- **Inline formatting.** Within a text block, bold, italic, code, links, strikethrough, and highlights are preserved.
- **Images.** An image inside a paragraph is split into its own block, and book/embedded images are resolved to a displayable source.
- **Books (EPUB).** Each chapter's XHTML is parsed into these blocks, preserving heading hierarchy, lists, tables, images, and code. Internal links resolve to in-book targets. **Each chapter starts a new page.**
- **Plain pasted text.** Newlines become paragraphs.
- **Paragraph indent.** Book paragraphs are indented by one full-width ideographic space. When shown, the stacked translation mirrors the same indent — and this mirroring is the **same behavior in every reader** (books and the notes/web reader alike), not just for books.

### 3. Translation display

- **Toggle.** A shared Display setting turns the L1 translation on or off for the tokenized text, everywhere (the reader and the settings screen agree). Turning it on/off re-paginates the page.
- **Stacked (narrow screens).** When there isn't room for two columns, the translation renders directly under the L2 text with the same line spacing (leading). It mirrors the L2 paragraph's first-line indent by default — the **same behavior in every reader** (books and the notes/web reader alike).
- **Side-by-side (wide screens and portrait tablets).** The translation renders in a column to the right of the L2 text on wide screens **and on portrait tablets** (e.g., an iPad), not only on desktop-wide displays. The L2 column takes the larger share of the width and the translation the remainder.
- **Baseline alignment (requirement).** In the side-by-side layout every translation line must baseline-align with the corresponding tokenized L2 line **whether or not ruby phonetics are on**. The reading (furigana/pinyin) bands on the L2 must not push the translation off its line.
- **Line-for-line pairing.** Each translation line sits on its L2 line's baseline. The translation column stays the same height as the L2 column: extra translation lines beyond the L2's line count are not stacked below it, and L2 lines without a translation leave an empty space so nothing drifts out of alignment.
- **Sentence highlight.** Tapping a L2 sentence highlights the matching translation sentence; the dictionary popup can present a linked source sentence.

### 4. Resizable text/translation column

- **Draggable divider.** In the side-by-side layout a slim vertical handle sits between the L2 and translation columns.
- **Invisible until dragged.** The handle's divider line is **invisible by default** (no permanent line between the columns); it appears only once the user starts adjusting it — while dragging (touch) / on hover-drag (web). The boundary area stays a full draggable touch/pointer target so the drag remains discoverable.
- **Live resize.** Dragging it resizes both columns as you move, clamped to a range (an approximate 3:7 to 7:3 split) so neither column collapses away.
- **Persisted and shared.** The chosen split is saved and reused across page turns and sessions, and shared by all the readers.
- **Re-pagination.** Changing the split re-paginates so page breaks match the new column widths.
- **Hidden when stacked.** On narrow screens (no side-by-side) the handle is not shown.

### 5. Tokenized Text

- **Words are interactive tokens.** The L2 text is broken into tokens — words and punctuation. Only word tokens respond to a tap (opening the dictionary); punctuation marks are not tappable.
- **Word tokens reconstruct the source.** Tokens concatenate back to the original text exactly (no missing or doubled spaces, newlines preserved), so selecting/copying gives the true source.
- **Phonetics (ruby).** A shared per-language display setting controls phonetics: **ruby** (reading shown above the characters), **word** (the word replaced by its reading), or **off**. It applies consistently to language blocks in the reader.
- **Readings attach to the right characters.** The reading sits above the base characters it belongs to: per-character pinyin/jyutping for Chinese and Cantonese, per-kanji furigana for Japanese, romanization for Korean and other languages with a reading.
- **Uniform lines with readings.** Words without a reading still reserve the same vertical slot, so a line keeps one pitch whether or not every word carries a reading.
- **Consistent spacing across languages.** Two measurements must be identical in every language and script: the **ruby↔base gap** (the vertical distance between the bottom of the reading glyphs and the top of the base characters) and the **line pitch** (each line's full height including its reading band). A reading must never overlap the characters below it or the line above it, in any language. *(Known gap: Japanese kana readings currently grow a line more than other scripts, so Japanese line pitch is larger — e.g. ~37px vs ~29px for the same settings — and the ruby↔base gap is not yet uniform. This must be reconciled so Japanese matches the other languages.)*
- **Rendered on the native text engine.** Readings use the platform text engine so ruby typography (centering, overhang) matches the platform; the result is layout-neutral whether or not a native renderer is available.
- **Correct CJK glyphs with the system font.** The base text uses the **system font** (so the line pitch is uniform across every script) and is **language-tagged**, so the platform's CJK font fallback renders the right glyph variant per language (simplified vs traditional Chinese, Japanese kanji, Korean) — see [SPEC-088 — CJK Glyph Rendering](088-cjk-glyph-rendering.md).
- **Highlighting.** Saved words and searched/highlighted terms are visually marked, and a reviewed/target word is highlighted even when its inflected surface differs from the saved headword.
- **Quiz mode.** Words can be blanked and progressively revealed so a reader can self-test.
- **Script variants.** Where a language has script variants (traditional/simplified Chinese, Korean hanja, Vietnamese hán tự), the text follows the user's display setting.
- **Hard-words-only.** When the per-language proficiency filter is set, only words the user hasn't yet mastered get a reading.
- **Karaoke (video).** In video subtitles, the spoken words are highlighted and the not-yet-spoken words are dimmed in time with playback.
- **RTL scripts.** Right-to-left languages (Arabic, Hebrew, Persian, …) render right-to-left with readings in the correct direction.

### 6. Tokenized-text action menu

- **Per-block menu.** Each L2 text block exposes a "more" (⋮) affordance with:
  - **Copy** — copy the block's text;
  - **Speak / Stop** — read the block aloud with text-to-speech (the button toggles to Stop);
  - **Let AI Explain** — a streaming AI explanation of the block in a modal;
  - **Translation** — show/hide or view the block's translation.
- **Interactive words.** Every word in the tokenized text is tappable: tapping opens the dictionary popup (definition, add to vocabulary, linked examples). Selecting text opens the dictionary for the selected span.
- **Formatting honored.** Bold/italic/code/links/underline in the source render in the tokenized text; linked phrases open the link.

### 7. Reader chrome

- **Controls.** The reader shows: previous/next, the page counter, the translation toggle, and (for books) table-of-contents and search buttons, plus the current chapter name.
- **Empty / pending states.** A load state (pulsing skeleton) shows while a page's words and translation are prepared, so the layout doesn't jump.
- **Notes.** The notes reader has a sidebar to create, rename, delete, and switch between notes.

### 8. Search, table of contents, and place

- **Search (books).** A whole-book search panel: results show a snippet with the matched span highlighted and a chapter label; clicking a result jumps to and highlights the matching block. Recent searches are remembered (and can be cleared).
- **Table of contents.** A nested chapter tree highlighting the current chapter and its ancestors; clicking jumps to the chapter. Previous/next chapter controls are available.
- **Position restore.** The reader remembers where you were (the block you were reading) and restores it when you reopen the same note, book, or URL — and survives a reload or a window resize.

## Glossary of Terms

Terms used throughout this spec, in plain language.

- **L1 / L2** — L1 is your native/interface language; L2 is the language you are learning. The reader shows L2 text (the thing you're reading) and its L1 translation.
- **Tokenized text** — the L2 text split into individual words and punctuation marks so each word can be tapped.
- **Token** — one word (or punctuation mark) unit after tokenization.
- **Lemma** — the dictionary/base form a word reduces to (e.g. *went* → *go*).
- **Ruby / reading** — the small pronunciation guide shown above characters: furigana for Japanese, pinyin for Chinese, jyutping for Cantonese, romanization for Korean and other languages. *Ruby mode* shows the reading above; *word mode* replaces the word with its reading; *off* hides it.
- **Reading band** — the vertical space reserved above the characters to hold the reading.
- **Ruby↔base gap** — the vertical distance between the bottom of the reading glyphs and the top of the base characters (the whitespace between the reading and the text it annotates). Must be consistent across all languages and scripts.
- **Line pitch** — the distance from one line's top to the next line's top; i.e. each line's full height including its reading band. A larger line pitch means the lines are farther apart.
- **Baseline** — the invisible horizontal line a line of text sits on (roughly the bottom of most letters). Two lines are *baseline-aligned* when their baselines sit at the same height.
- **Baseline alignment (translation ↔ L2)** — a translation line's baseline is placed at the same height as the L2 line it pairs with, so the two columns line up when you read across.
- **Block** — one unit of content in the reader: a heading, paragraph, list item, blockquote, code block, image, table, or horizontal rule. The reader pages and lays out these blocks.
- **Block model** — the set of block types plus inline formatting the parser turns markdown/HTML into.
- **GFM table** — a table written in GitHub-flavored Markdown syntax.
- **Thematic break (`hr`)** — a horizontal rule separating sections.
- **Hard page start** — a point where a new page must begin regardless of leftover space, e.g. the start of each chapter.
- **Spine item** — one chapter/section in an EPUB book.
- **Side-by-side** — the L2 text and translation shown as two columns next to each other (on wide screens and portrait tablets).
- **Stacked** — the translation shown directly below the L2 text (on narrow screens).
- **Split** — the share of the row's width given to the L2 column vs the translation column in side-by-side layout.
- **Clamp** — the allowed range (roughly 3:7 to 7:3) past which the drag handle won't resize a column.
- **First-line indent** — a paragraph's first line pushed in by one full-width ideographic space (a typographic indent used in books).
- **Immersive mode** — hiding the reader chrome so only the text shows, with floating page/chapter labels.
- **Karaoke** — highlighting the word being spoken and dimming the not-yet-spoken words, in time with playback.
- **Hard-words-only** — showing readings only on words above your chosen proficiency level.
- **Script variant** — an alternate script for the same language (traditional vs simplified Chinese, hanja, hán tự).
- **RTL** — right-to-left writing direction (Arabic, Hebrew, Persian, and others).
- **TTS / Speak** — reading text aloud with text-to-speech.
- **AI Explain** — an AI-generated explanation of a block of text.
- **Skeleton** — a pulsing placeholder shown while a page's words and translation are being prepared.

## Cross-Platform Parity

- The **feature set is identical** on web and mobile.
- **Input differs by device**: web uses mouse/keyboard/trackpad; mobile uses touch. Both support the same set of gestures logically (page turn by swipe/flick on touch, keyboard and pointer-flick on web).
- **Layout differs by width**: side-by-side translation + the drag handle appear on wide screens and on portrait tablets; stacked translation (no handle) appears only on narrow screens.
- **Chrome**: books support immersive (chrome-hiding) mode on both; the overlay/muted labels differ only in how they're sized.

## Acceptance Criteria

- Text fills one page exactly; previous/next, the page counter, and jump-to-page work.
- Page turns work by buttons, swipe/flick (mobile), keyboard and pointer-flick (web).
- Toggling translation, changing text size/zoom/leading, changing translation size, or dragging the split re-paginates **without losing the current place**.
- Every word is tappable (dictionary popup) and every text block shows Copy / Speak / AI Explain / Translation.
- On wide screens, each translation line baseline-aligns to its L2 line **whether or not ruby phonetics are on**, and the translation column is no taller than the L2 column.
- The drag handle resizes live (within the clamp) and the split persists across turns and sessions.
- Books render headings, lists, blockquotes, tables, images, and code; each chapter starts a new page; search jumps to a match with highlight; the TOC highlights the current chapter.
- Reopening the same note/book/URL restores the position.

## Out of Scope

- Authoring/editing the document inside the reader (beyond pasting text to tokenize).
- Dictionary contents, translation quality, or text-to-speech quality — only that these are reachable from the reader.
- Offline dictionary downloads (covered by SPEC-058/SPEC-084).

## Dependencies

- SPEC-083 — unified markdown/HTML parsing shared by both apps.
- SPEC-078 — the resizable text/translation splitter (the handle + persisted split).
- SPEC-084 — native selection dictionary over ruby/plain text.
- ARCH-030 — native ruby rendering and the line grid that underpins baseline alignment.

> **Behavior gap note:** two requirements above are not yet fully met by the current implementation and are tracked here so they aren't lost:
> - *Side-by-side on portrait tablets* — both apps currently key side-by-side (and the drag handle) to a fixed `md`-width breakpoint (`768`). Most portrait iPads are ≥ `768` and already get side-by-side, but the smallest portrait iPad (`iPad mini`, 744pt) falls below it. The requirement above says portrait tablets get side-by-side; the breakpoint should be lowered/adjusted so even the smallest portrait iPad qualifies.
> - *Stacked translation mirrors first-line indent in every reader* — the mobile EPUB reader already mirrors the indent for stacked translation, but the web notes reader does not match it. These should be unified so all readers behave identically.
