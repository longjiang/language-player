# Web Reader

Paste a URL and read any web page in your target language with interactive word lookup and translations. No account needed.

## How It Works

Enter the URL of a web page — a news article, a blog post, a Wikipedia page, or any public webpage. The Web Reader fetches the page, strips away navigation and ads, and displays the main content as clean, readable text. Every word becomes clickable for dictionary lookup.

The Web Reader is read-only — it doesn't save anything to your account. If you want to keep your text and come back to it later, use the [Notes Reader](/docs/reading/reader) instead.

## Loading a Page

1. Paste a full URL (starting with `https://`) into the input at the top of the page
2. Click **{$action.load}**
3. The page content appears as clean text, ready to read

You can also share a link directly. Add `?url=` to the Web Reader URL:

```
/en/zh/web-reader?url=https://zh.wikipedia.org/wiki/...
```

This loads the page when someone opens the link.

## What Gets Kept

The Web Reader extracts the main content of a page and removes clutter:

- Navigation menus, sidebars, headers, and footers are stripped
- Wikipedia edit links, reference lists, infoboxes, and metadata are removed
- The main article body is preserved — paragraphs, headings, lists, and links
- Relative links are rewritten to point back to the original page

The cleaned content is displayed as formatted text with markdown styling. Headings, bullet lists, blockquotes, and code blocks all render as you'd expect.

## Interactive Words

After the page loads, click **{$action.tokenize}** to make every word interactive. Tap or click any word to open the [Popup Dictionary](/docs/vocab/popup-dictionary). You can see definitions, pronunciations, and example sentences, and save words to your vocabulary.

Words you've previously saved are highlighted — the first definition appears inline next to the word as a quick reminder.

## Translation

Toggle the **Translation** switch to show or hide translations. When enabled, translations appear inline — on wide screens they sit next to the original text, and on narrow screens they appear below each paragraph. Translations load as you navigate between pages.

**Per-block actions** let you interact with each paragraph individually. Hover over any text block to reveal a `⋮` menu with these options:

- **{$action.copy}** — Copy the text to your clipboard
- **{$action.speak}** — Read the text aloud with text-to-speech
- **{$action.let_ai_explain}** — Get an AI breakdown of the text's grammar and structure
- **{$action.translation}** — See a popup translation for just that block

## Page Navigation

The text is paginated to fit your screen. Use the `←` `→` buttons at the bottom to move between pages, or use your keyboard: `←` and `↑` for previous page, `→`, `↓`, and `Space` for next page.

## See Also

- [Notes Reader](/docs/reading/reader) — Write or paste your own text, save notes, and edit content
- [EPUB Reader](/docs/reading/epub) — Read EPUB books with chapter navigation
- [Popup Dictionary](/docs/vocab/popup-dictionary) — How clicking words works

## Tips

- Wikipedia articles work particularly well — the content extraction is tuned for Wikipedia's layout
- Use the `?url=` parameter to bookmark specific articles in your target language
- The Web Reader doesn't save your text — if you want to annotate or come back later, copy the URL and paste it into the Notes Reader instead
- Long articles benefit from keyboard navigation (`←` `→`) for faster reading