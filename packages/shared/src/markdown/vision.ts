/**
 * Shared Vision-OCR prompt for the image reader.
 *
 * Sent to the Flask `/vision` endpoint (as the `prompt` field, alongside the
 * downscaled base64 image) by both apps/web and apps/mobile. Kept in one place
 * so the two clients never drift apart.
 *
 * The prompt is hardened so the model:
 *  - extracts the text in the image's ORIGINAL language (no translation),
 *  - preserves structure/formatting (headings, lists, emphasis, code blocks),
 *  - REFLOWS wrapped lines into flowing prose (no hard breaks inside a paragraph),
 *  - detects comic/manga reading direction (RTL vs LTR) and orders speech
 *    bubbles/panels accordingly, and
 *  - emits ONLY the transcribed Markdown — no commentary, notes, or invented text.
 */
export const IMAGE_OCR_PROMPT =
  'Transcribe all text in this image into clean Markdown, in the original ' +
  'language — do not translate. ' +
  'Reflow the text: read it in natural reading order, join wrapped lines into ' +
  'flowing prose, and place no hard line breaks inside a paragraph. ' +
  'Preserve the document structure and formatting as Markdown — headings, ' +
  'paragraphs, lists, bold/italic emphasis, and fenced code blocks. ' +
  'If the image is a comic or manga, detect the reading direction ' +
  '(left-to-right or right-to-left) and read the speech bubbles and panels ' +
  'in that order so the dialogue flows correctly. ' +
  'Output only the transcribed text as Markdown — no commentary, notes, or ' +
  'any other text.';
