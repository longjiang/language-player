/**
 * Shared Vision-OCR prompts.
 *
 * Both are sent to the Flask `/vision` endpoint (as the `prompt` field,
 * alongside the downscaled base64 image). Kept in one place so the two client
 * apps never drift apart, and so the two OCR use cases share one body style:
 *
 *  - `IMAGE_READER_OCR_PROMPT` — the standalone image reader (web + mobile).
 *    ALWAYS starts with a single generated `# <title>` heading (SPEC-090), then
 *    the transcription. The title is metadata: when the image has no visible
 *    document title the model invents a short descriptive one instead of the
 *    reader falling back to the file name.
 *  - `IMAGE_OCR_PROMPT` — the web PDF reader's page → markdown conversion. The
 *    same body style, title-less, because its result is concatenated into the
 *    book text and an invented heading on every page would show up as content.
 *    Frozen byte-for-byte so existing server-side `/vision` cache entries
 *    (keyed by prompt + image bytes) stay valid.
 *
 * The body rules make the model:
 *  - emit ONLY the text literally present in the image (no intro, summary,
 *    description, translation, guesses about blurry/cut-off text, page/panel
 *    numbers, panel/sound-effect labels, or a code fence wrapper),
 *  - reflow the text like normal reading while preserving structure: each
 *    logical element (paragraph, sentence, receipt/list/menu row, caption,
 *    speech bubble) is EMITTED AS ONE CONTINUOUS LINE (its wrapped image rows
 *    merged), and distinct elements are separated by blank lines — so a
 *    sentence that runs across several rows in the image reads as one line,
 *    and never fragments on either the web or the mobile renderer,
 *  - for comic/manga images, read the dialogue/captions in the natural reading
 *    direction (RTL vs LTR) and emit only their text, one line per
 *    bubble/caption, with no reading-order or panel annotations, and
 *  - preserve meaningful Markdown structure (headings, lists, bold/italic
 *    emphasis, fenced code) only where the source clearly shows it.
 *
 * NOTE ON REFLOW (SPEC-090): the previous prompt emitted soft line breaks
 * (`\n`) inside a block and relied on the reader to collapse them. The web
 * reader does collapse them (HTML `white-space: normal`), but the mobile
 * reader renders `block.text` inside React Native `<Text>`, which PRESERVES
 * `\n` as a hard line break — so sentences fragmented instead of reflowing on
 * mobile. These prompts instead ask for one continuous line per element, which
 * reflows identically on both platforms. (Verified against `/vision`; the
 * model keeps blank-line-separated blocks and does NOT collapse the whole page
 * into one block.)
 */

/** Body-reflow + element-separation rules, shared by both prompts. */
const REFLOW_RULES =
  'REFLOW the text like normal reading, but keep the structure:\n' +
  '- Merge the wrapped lines of each element - a paragraph, a sentence, a ' +
  'receipt row, a list or menu item, a table row, a caption, or a speech ' +
  'bubble - into ONE continuous line. Never put a line break inside an ' +
  'element.\n' +
  '- Separate elements with a blank line: one blank line between paragraphs, ' +
  'between rows or items, between captions, and between speech bubbles. Never ' +
  'put a blank line inside an element.\n' +
  '\n';

/** Markdown-preservation rule, shared by both prompts. */
const STRUCTURE_RULE =
  'Preserve meaningful Markdown structure (headings, lists, bold/italic ' +
  'emphasis, fenced code) only where the source clearly shows it. ';

/** Comic/manga reading-order rule, shared by both prompts. */
const COMIC_RULE =
  'If the image is a comic or manga, read the dialogue and captions in the ' +
  'natural reading direction (left-to-right or right-to-left) and output ONLY ' +
  'their text in that order, one line per bubble or caption, with no panel ' +
  'numbers, reading-order notes, sound-effect labels, or annotations.\n' +
  '\n';

/**
 * Image-reader OCR prompt: a mandatory generated `# <title>` line, then the
 * literal transcription (SPEC-090).
 *
 * The title line is the ONE deliberate exception to "output only the text that
 * is in the image": when the image has no visible document title, the model
 * names the image instead (e.g. "A cafe receipt", "A paragraph about a missed
 * appointment"), in the same language as the image's main text. The reader
 * pulls that first line out (`extractTitle`) and uses it for the title bar, the
 * sidebar, and the saved-word context, so a raw filename is no longer the
 * fallback title. Everything after the title line stays strictly literal.
 */
export const IMAGE_READER_OCR_PROMPT =
  'Transcribe ALL text written in this image into clean Markdown, in the ' +
  'original language.\n' +
  '\n' +
  'START your output with a single "# " line holding a short, human-readable ' +
  "title for this image, in the same language as the image's main text. If " +
  'the image shows an obvious document title (a heading, a receipt or ' +
  'business name, a sign, a book or chapter title, a comic title), use that ' +
  'title. Otherwise write a concise descriptive title of what the image shows ' +
  '(for example "A cafe receipt", "A page of a letter"), at most 8 words. ' +
  'That title line is the ONLY text you may add - it is metadata, not ' +
  'transcription.\n' +
  '\n' +
  'After the title line, output ONLY the text literally present in the image, ' +
  'and nothing else. Do not write an intro, a summary, a description, a ' +
  'translation, or guesses about blurry or cut-off text. Do not add page ' +
  'numbers, panel numbers, or labels such as "page 1", "panel 3", or "sound ' +
  'effect". Do not wrap the output in a code fence.\n' +
  '\n' +
  REFLOW_RULES +
  STRUCTURE_RULE +
  COMIC_RULE +
  'Output the title line first, then the transcribed text as Markdown.';

/**
 * PDF page → markdown OCR prompt (web PDF reader only). Title-less, because
 * its output is concatenated into the book text. Frozen byte-for-byte so the
 * server-side `/vision` cache keyed by prompt + image does not change.
 */
export const IMAGE_OCR_PROMPT =
  'Transcribe ALL text written in this image into clean Markdown, in the ' +
  'original language. Output ONLY that text, and nothing else. Do not write ' +
  'an intro, a summary, a description, a translation, or guesses about blurry ' +
  'or cut-off text. Do not add page numbers, panel numbers, or labels such as ' +
  '"page 1", "panel 3", or "sound effect". Do not wrap the output in a code ' +
  'fence.\n' +
  '\n' +
  REFLOW_RULES +
  STRUCTURE_RULE +
  'If the image has an obvious document title visible in the image, you may ' +
  'start with a single "# " line giving that title; if there is no title, ' +
  'omit it. ' +
  COMIC_RULE +
  'Output ONLY the transcribed text as Markdown.';
