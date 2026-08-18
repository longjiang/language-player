/**
 * HTML → Markdown converter for React Native (SPEC-083).
 *
 * Ported from apps/mobile/lib/html-to-markdown.ts (which exists because RN
 * has no DOM — the Next.js web reader uses DOMParser + turndown instead).
 * Now shared: mobile's web-reader ingestion and its EPUB ingestion both use
 * this module, feeding the single `parseMarkdownBlocks` pipeline.
 *
 * Extensions over the original:
 * - `opts.resolveImage(src)` — rewrite image `src` (EPUB archive images).
 * - `opts.preserveIds` — emit `<a id="…"></a>` anchors before block-level
 *   elements that carry an element id (own or nearest ancestor), so the
 *   parser can map `#fragment` TOC links onto blocks (SPEC-049 §9.1).
 */

export interface HtmlToMarkdownOptions {
  /** Resolve an image src to a display URI (EPUB archive paths). Return
   *  null/undefined to fall back to baseUrl resolution. */
  resolveImage?: (src: string) => string | null | undefined;
  /** Emit `<a id="…"></a>` anchors for id-bearing blocks (EPUB fragments). */
  preserveIds?: boolean;
}

/** Block-level elements that can anchor a `#fragment`. */
const BLOCK_TAGS = new Set([
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'blockquote', 'li', 'pre', 'table', 'div',
  'figcaption', 'dt', 'dd',
]);

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

/** Extract an attribute value (double or single quoted) from a tag string. */
function attrValue(tagAttrs: string, name: string): string | undefined {
  const re = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i');
  const m = tagAttrs.match(re);
  return m?.[2] ?? m?.[3];
}

/**
 * Insert `<a id="…"></a>` anchors before block-level elements whose own id —
 * or nearest ancestor's id — would make them `#fragment` targets. Sequential
 * tag walk with an ancestor-id stack; the anchors survive the rest of the
 * conversion (see stripHtmlTags) and the parser maps them to `srcElementId`.
 */
function injectIdAnchors(html: string): string {
  let out = '';
  const stack: string[] = [];
  const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
  let scanPos = 0;
  let m: RegExpExecArray | null;

  while ((m = tagRe.exec(html)) !== null) {
    out += html.slice(scanPos, m.index);
    scanPos = tagRe.lastIndex;

    const rawTag = m[0];
    const tag = m[1]!.toLowerCase();
    const attrs = m[2] ?? '';
    const isClosing = rawTag.startsWith('</');
    const id = attrValue(attrs, 'id');

    if (isClosing) {
      stack.pop();
    } else if (VOID_TAGS.has(tag)) {
      // no frame
    } else {
      stack.push(id ?? '');
      if (BLOCK_TAGS.has(tag)) {
        const effId = id ?? nearestAncestorId(stack);
        if (effId) out += `\n<a id="${effId}"></a>\n`;
      }
    }
    out += rawTag;
  }
  out += html.slice(scanPos);
  return out;
}

/** Nearest open ancestor (below the current element) that has an id. */
function nearestAncestorId(stack: string[]): string | null {
  for (let i = stack.length - 2; i >= 0; i--) {
    if (stack[i]) return stack[i]!;
  }
  return null;
}

/**
 * Strip unwanted elements from raw HTML.
 * Mirrors the Next.js web reader's querySelectorAll removal:
 *   script, style, nav, header, footer, aside,
 *   .sidebar, .menu, .navigation, .mw-jump-link,
 *   .mw-editsection, .reference, .noprint,
 *   .thumb, .infobox, .navbox, .metadata
 */
function stripUnwanted(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '')
    // Common class-based removals
    .replace(/<[a-z]+[^>]*class="[^"]*\b(sidebar|menu|navigation|mw-jump-link|mw-editsection|reference|noprint|thumb|infobox|navbox|metadata)\b[^"]*"[^>]*>[\s\S]*?<\/[a-z]+>/gi, '')
    // Self-closing variants
    .replace(/<[a-z]+[^>]*class="[^"]*\b(sidebar|menu|navigation|mw-jump-link|mw-editsection|reference|noprint|thumb|infobox|navbox|metadata)\b[^"]*"[^>]*\/>/gi, '');
}

/** Remove HTML tags while respecting quoted attribute values, which can
 *  contain `>` and newlines (e.g. MediaWiki's `data-mw` JSON attributes).
 *  Preserves `<a id="…"></a>` anchors emitted by injectIdAnchors. */
function stripHtmlTags(html: string): string {
  let out = '';
  let i = 0;
  while (i < html.length) {
    if (html[i] === '<') {
      let j = i + 1;
      let quote: string | null = null;
      let closed = false;
      while (j < html.length) {
        const ch = html[j];
        if (quote) {
          if (ch === quote) quote = null;
        } else if (ch === '"' || ch === "'") {
          quote = ch;
        } else if (ch === '>') {
          closed = true;
          break;
        }
        j++;
      }
      if (closed) {
        const tag = html.slice(i, j + 1);
        // Keep `<a id="…">` / `</a>` anchor markers (EPUB fragments).
        if (/^<a\s+id=["'][^"']+["']\s*>/i.test(tag) || /^<\/a\s*>/i.test(tag)) {
          out += tag;
        }
        i = j + 1;
        continue;
      }
    }
    out += html[i];
    i++;
  }
  return out;
}

/**
 * Extract the main content area from HTML.
 * Looks for #mw-content-text (Wikipedia), <article>, <main>, or falls back to <body>.
 */
/** Find the next HTML tag matching `re`, ignoring tag-like text inside
 *  quoted attribute values (e.g. `</div>` inside a JSON data attribute). */
function indexOfTagOutsideQuotes(html: string, from: number, re: RegExp): number {
  let i = from;
  while (i < html.length) {
    if (html[i] === '<') {
      let j = i + 1;
      let quote: string | null = null;
      while (j < html.length) {
        const ch = html[j];
        if (quote) {
          if (ch === quote) quote = null;
        } else if (ch === '"' || ch === "'") {
          quote = ch;
        } else if (ch === '>') {
          break;
        }
        j++;
      }
      const tag = html.slice(i, Math.min(j + 1, html.length));
      re.lastIndex = 0;
      if (re.test(tag)) return i;
      i = j + 1;
    } else {
      i++;
    }
  }
  return -1;
}

function matchBalanced(
  html: string,
  openRe: RegExp,
  anyOpenRe: RegExp,
  closeRe: RegExp,
): { full: string; inner: string } | null {
  const start = indexOfTagOutsideQuotes(html, 0, openRe);
  if (start === -1) return null;
  const openLen = html.slice(start).match(openRe)![0].length;
  // The matched opening tag is depth 1; nested same-tag elements add to it.
  let depth = 1;
  let pos = start + openLen;
  while (pos < html.length) {
    const nextOpen = indexOfTagOutsideQuotes(html, pos, anyOpenRe);
    const nextClose = indexOfTagOutsideQuotes(html, pos, closeRe);
    if (nextClose === -1) return null;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      pos = nextOpen + html.slice(nextOpen).match(anyOpenRe)![0].length;
    } else {
      depth--;
      const closeLen = html.slice(nextClose).match(closeRe)![0].length;
      pos = nextClose + closeLen;
      if (depth === 0) {
        return {
          full: html.slice(start, pos),
          inner: html.slice(start + openLen, nextClose),
        };
      }
    }
  }
  return null;
}

function extractMainContent(html: string): string {
  // Try Wikipedia-style content (balanced <div> matching, not first-close-tag)
  const mw = matchBalanced(
    html,
    /<div[^>]*id="mw-content-text"[^>]*>/i,
    /<div\b[^>]*>/i,
    /<\/div\s*>/i,
  );
  if (mw) return mw.full;

  // Try <article> and <main> with balanced matching
  const article = matchBalanced(html, /<article[^>]*>/i, /<article\b[^>]*>/i, /<\/article\s*>/i);
  if (article) return article.full;
  const main = matchBalanced(html, /<main[^>]*>/i, /<main\b[^>]*>/i, /<\/main\s*>/i);
  if (main) return main.full;

  // Try <body>
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) return bodyMatch[1]!;

  return html;
}

/**
 * Convert HTML to Markdown.
 * Handles: h1-h6, p, a, strong/b, em/i, ul/ol/li, pre/code, blockquote, img, br, hr.
 */
export function htmlToMarkdown(
  html: string,
  baseUrl: string,
  opts: HtmlToMarkdownOptions = {},
): string {
  let md = html;

  // Remove unwanted elements
  md = stripUnwanted(md);

  // Extract main content
  md = extractMainContent(md);

  // Insert fragment anchors before id-bearing blocks (EPUB)
  if (opts.preserveIds) {
    md = injectIdAnchors(md);
  }

  // Decode common HTML entities
  md = md
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');

  // Remove inline styles and class/data attrs to clean up. (`id` is kept:
  // id-bearing tags are stripped wholesale below; only preserved anchors
  // keep their ids through to the markdown.)
  md = md.replace(/\s+(style|class|data-[a-z-]+)="[^"]*"/gi, '');

  // Resolve absolute-path URLs in href and src
  md = md.replace(/(href|src)="(\/[^"]*)"/gi, (_, attr, path) => {
    try {
      const resolved = new URL(path, baseUrl).href;
      return `${attr}="${resolved}"`;
    } catch {
      return `${attr}="${path}"`;
    }
  });

  // Resolve an image src: opts.resolveImage first, then baseUrl.
  const resolveImgSrc = (src: string): string => {
    if (opts.resolveImage) {
      const resolved = opts.resolveImage(src);
      if (resolved) return resolved;
    }
    try {
      return new URL(src, baseUrl).href;
    } catch {
      return src;
    }
  };

  // Images: <img ... src="..." alt="..." /> → ![alt](src)
  md = md.replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*\/?>/gi, (_m, src: string, alt: string) => `![${alt}](${resolveImgSrc(src)})`);
  md = md.replace(/<img[^>]*alt="([^"]*)"[^>]*src="([^"]*)"[^>]*\/?>/gi, (_m, alt: string, src: string) => `![${alt}](${resolveImgSrc(src)})`);
  md = md.replace(/<img[^>]*src="([^"]*)"[^>]*\/?>/gi, (_m, src: string) => `![](${resolveImgSrc(src)})`);

  // Links: <a ... href="...">text</a> → [text](href)
  md = md.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');

  // Bold + Italic (must be before single bold/italic)
  md = md.replace(/<(strong|b)>[\s]*<(em|i)>([\s\S]*?)<\/(em|i)>[\s]*<\/(strong|b)>/gi, '***$3***');
  md = md.replace(/<(em|i)>[\s]*<(strong|b)>([\s\S]*?)<\/(strong|b)>[\s]*<\/(em|i)>/gi, '***$2***');

  // Bold
  md = md.replace(/<(strong|b)>([\s\S]*?)<\/(strong|b)>/gi, '**$2**');

  // Italic
  md = md.replace(/<(em|i)>([\s\S]*?)<\/(em|i)>/gi, '*$2*');

  // Code blocks: <pre><code>...</code></pre> → ```...```
  md = md.replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '\n```\n$1\n```\n');

  // Inline code: <code>...</code> → `...`
  md = md.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');

  // Blockquotes: <blockquote>...</blockquote>
  md = md.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_match: string, content: string) => {
    return '\n> ' + content.trim().replace(/\n/g, '\n> ') + '\n';
  });

  // Horizontal rules
  md = md.replace(/<hr[^>]*\/?>/gi, '\n---\n');

  // Line breaks
  md = md.replace(/<br[^>]*\/?>/gi, '\n');

  // Headings: <h1>...</h1> through <h6>
  md = md.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_match: string, level: string, content: string) => {
    const hashes = '#'.repeat(parseInt(level, 10));
    return `\n\n${hashes} ${content.trim()}\n\n`;
  });

  // Ordered lists: wrap in <ol>...</ol> for processing
  md = md.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_match: string, items: string) => {
    let counter = 1;
    const processed = items.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_liMatch: string, content: string) => {
      return `\n${counter++}. ${content.trim()}`;
    });
    return `\n${processed}\n`;
  });

  // Unordered lists: wrap in <ul>...</ul> for processing
  md = md.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_match: string, items: string) => {
    const processed = items.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_liMatch: string, content: string) => {
      return `\n- ${content.trim()}`;
    });
    return `\n${processed}\n`;
  });

  // Standalone <li> (not inside ul/ol)
  md = md.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '\n- $1');

  // Paragraphs
  md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n\n$1\n\n');

  // Remove any remaining HTML tags (quote-aware so `data-mw` JSON never
  // leaks), preserving `<a id="…">` anchors.
  md = stripHtmlTags(md);

  // Clean up whitespace
  md = md
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .trim();

  return md;
}

/**
 * Extract a title from HTML.
 * Looks for the first <h1> or <title> tag.
 */
export function extractTitle(html: string): string | null {
  // Try <h1> first
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match) return h1Match[1]!.replace(/<[^>]+>/g, '').trim();

  // Try <title>
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) return titleMatch[1]!.replace(/<[^>]+>/g, '').trim();

  return null;
}
