# EPUB Reader

Read EPUB e-books with interactive word lookup, per-block translation, and progress that persists across sessions.

## Getting Started

### Upload an EPUB

1. Navigate to **Reading → EPUB Reader** in the menu
2. **Drag & drop** an `.epub` file onto the upload zone, or click **Browse** to select one from your device
3. The cover image appears — tap it to start reading

The file is stored locally in your browser (IndexedDB). Next time you visit, it will load automatically and you'll resume from where you left off.

### Navigation

| Feature | How |
|---|---|
| **Next/Previous chapter** | Use the buttons at the top of the sidebar, or click chapter titles in the table of contents |
| **Collapse/expand sidebar** | Click the `≡` toggle in the top-right corner of the title bar |
| **Close the book** | Click `✕ Close` in the title bar to return to the upload screen |
| **Page turn within a chapter** | Use `←` / `→` keys or the page controls at the bottom of the reader |
| **Table of contents** | Nested TOC items are indented for easy navigation |

### Reading Features

- **Click any word** to look up its dictionary definition, pronunciation, and example sentences
- **Per-block translation** — Click the `Languages` icon in the page nav bar to translate the current page's visible blocks
- **Auto-translate on page turn** — When translation is enabled, the next page's content is translated automatically
- **Inline translation display** — On wide screens, original and translation appear side by side. On narrow screens, translation appears below each block.

## Supported Formats

- **`.epub`** — Standard EPUB files (EPUB 2 and EPUB 3)
- **`.epub` with furigana/ruby** — Japanese books with ruby annotations are converted to inline text: `基(き)礎(そ)`
- **Vertical text** — Books with CSS `writing-mode: vertical-rl` are detected (display uses standard horizontal layout for readability)

## Progress Saving

Your reading position is saved automatically in your browser:

- **Current chapter** is saved when you switch chapters
- **Text anchor** (the first ~40 characters of the visible page) is saved when you turn pages
- On your next visit, the book reloads and scrolls to the correct position

**Note:** Progress is stored locally (IndexedDB), not synced to the cloud. Only one book is stored at a time — uploading a new one replaces the previous.

## Tips for Language Learning

- **Start with what you know** — Children's books, graded readers, or books you've already read in your native language
- **Read actively** — Tap unfamiliar words to see their meaning, then save them for later review
- **Use translation as a crutch** — Enable per-block translation when you get stuck, but try reading without it first
- **Read aloud** — Use the speaker icon in each block's action menu (⋮) to hear pronunciation
- **Japanese learners** — Ruby/furigana is preserved inline, making it easier to read kanji you haven't learned yet

## Getting Free EPUBs

- **[Project Gutenberg](https://www.gutenberg.org/)** — 70,000+ free ebooks in many languages (look for " EPUB with images" or " Plain Text UTF-8")
- **[Aozora Bunko](https://www.aozora.gr.jp/)** (青空文庫) — Japanese literature, public domain
- **[Wikisource](https://wikisource.org/)** — Public domain texts in many languages, downloadable as EPUB
