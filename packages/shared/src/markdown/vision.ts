/**
 * Shared Vision-OCR prompt for the image reader.
 *
 * Sent to the Flask `/vision` endpoint (as the `prompt` field, alongside the
 * downscaled base64 image) by both apps/web and apps/mobile. Kept in one place
 * so the two clients never drift apart.
 *
 * The prompt is hardened so the model:
 *  - emits ONLY the text literally present in the image (no intro, summary,
 *    description, translation, guesses about blurry/cut-off text, page/panel
 *    numbers, panel/sound-effect labels, or a code fence wrapper),
 *  - reflows the text like normal reading while preserving structure: each
 *    logical element (paragraph, sentence, receipt/list/menu row, caption,
 *    speech bubble) is EMITTED AS ONE CONTINUOUS LINE (its wrapped image rows
 *    merged), and distinct elements are separated by blank lines — so a
 *    sentence that runs across several rows in the image reads as one line,
 *    and never fragments on either the web or the mobile renderer,
 *  - extracts a single leading `# <title>` line only when the image has a
 *    clear document title (used by the reader's title bar + saved-word
 *    context; optional, so it never invents one),
 *  - for comic/manga images, reads the dialogue/captions in the natural
 *    reading direction (RTL vs LTR) and emits only their text, one line per
 *    bubble/caption, with no reading-order or panel annotations, and
 *  - preserves meaningful Markdown structure (headings, lists, bold/italic
 *    emphasis, fenced code) only where the source clearly shows it.
 *
 * NOTE ON REFLOW (SPEC-090): the previous prompt emitted soft line breaks
 * (`\n`) inside a block and relied on the reader to collapse them. The web
 * reader does collapse them (HTML `white-space: normal`), but the mobile
 * reader renders `block.text` inside React Native `<Text>`, which PRESERVES
 * `\n` as a hard line break — so sentences fragmented instead of reflowing on
 * mobile. This prompt instead asks for one continuous line per element, which
 * reflows identically on both platforms. (Verified against `/vision`; the
 * model keeps blank-line-separated blocks and does NOT collapse the whole page
 * into one block.)
 */
export const IMAGE_OCR_PROMPT =
  'Transcribe ALL text written in this image into clean Markdown, in the ' +
  'original language. Output ONLY that text, and nothing else. Do not write ' +
  'an intro, a summary, a description, a translation, or guesses about blurry ' +
  'or cut-off text. Do not add page numbers, panel numbers, or labels such as ' +
  '"page 1", "panel 3", or "sound effect". Do not wrap the output in a code ' +
  'fence.\n' +
  '\n' +
  'REFLOW the text like normal reading, but keep the structure:\n' +
  '- Merge the wrapped lines of each element - a paragraph, a sentence, a ' +
  'receipt row, a list or menu item, a table row, a caption, or a speech ' +
  'bubble - into ONE continuous line. Never put a line break inside an ' +
  'element.\n' +
  '- Separate elements with a blank line: one blank line between paragraphs, ' +
  'between rows or items, between captions, and between speech bubbles. Never ' +
  'put a blank line inside an element.\n' +
  '\n' +
  'Preserve meaningful Markdown structure (headings, lists, bold/italic ' +
  'emphasis, fenced code) only where the source clearly shows it. If the ' +
  'image has an obvious document title visible in the image, you may start ' +
  'with a single "# " line giving that title; if there is no title, omit it. ' +
  'If the image is a comic or manga, read the dialogue and captions in the ' +
  'natural reading direction (left-to-right or right-to-left) and output ONLY ' +
  'their text in that order, one line per bubble or caption, with no panel ' +
  'numbers, reading-order notes, sound-effect labels, or annotations.\n' +
  '\n' +
  'Output ONLY the transcribed text as Markdown.';
