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

/**
 * Normalize DeepSeek Vision OCR markdown into paragraph-per-block form.
 *
 * The vision model is asked to "preserve headings, paragraphs …", but often
 * returns the image's paragraphs separated by single newlines (soft breaks)
 * rather than blank lines. CommonMark treats a run of soft-broken lines as
 * ONE paragraph, so the OCR result collapses into a single reader block.
 *
 * This normalizer promotes every non-empty text line to its own paragraph
 * (blank-line separated) so each visual text block becomes its own reader
 * block, while preserving existing blank-line boundaries and fenced code
 * blocks (SPC-089 / image reader block-breaking).
 *
 * Platform-agnostic (pure string transform) — consumed by both apps/web
 * and apps/mobile on the image-reader and PDF page→markdown paths.
 */

export function normalizeVisionMarkdown(md: string): string {
  if (!md) return '';

  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  let inFence = false;

  for (const raw of lines) {
    const line = raw.replace(/\r$/, '');
    const trimmed = line.trim();
    const isFence = /^\s*(```|~~~)/.test(line);

    if (isFence) {
      const opening = !inFence;
      inFence = !inFence;
      // Separate an OPENING fence from the preceding content; a closing fence
      // is followed by a blank via the normal paragraph-break branch below.
      if (opening && out.length && out[out.length - 1] !== '') out.push('');
      out.push(line.trimEnd());
      continue;
    }

    if (trimmed === '') {
      // Collapse runs of blank lines to a single paragraph separator; inside
      // a fenced code block keep the empty line verbatim.
      if (inFence) {
        out.push('');
      } else if (out.length && out[out.length - 1] !== '') {
        out.push('');
      }
      continue;
    }

    if (!inFence && out.length && out[out.length - 1] !== '') {
      // Paragraph break — each non-empty line becomes its own block.
      out.push('');
    }
    out.push(line.trimEnd());
  }

  return out.join('\n');
}
