/**
 * Mobile shim for the shared HTML→Markdown converter (SPEC-083).
 *
 * Keeps the `@/lib/html-to-markdown` alias working for the web reader; the
 * implementation lives in packages/shared so EPUB ingestion and the web
 * reader share the exact same converter.
 */

export {
  htmlToMarkdown,
  extractTitle,
  decodeHtmlEntities,
  type HtmlToMarkdownOptions,
} from '@langplayer/shared';
