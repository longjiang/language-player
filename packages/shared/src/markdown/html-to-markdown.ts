/**
 * HTML → Markdown converter (SPEC-083).
 *
 * The single, cross-platform HTML→Markdown converter for BOTH apps. It is
 * string-based (React Native has no DOM, so this must not rely on DOMParser /
 * turndown). The web reader used to run DOMParser + turndown inline; this
 * module is the unification target so web and mobile ingest a fetched page
 * through the exact same code path (SPEC-087 §2 "one shared pipeline").
 *
 * Extensions over the original mobile-only converter:
 * - `opts.resolveImage(src)` — rewrite image `src` (EPUB archive images).
 * - `opts.preserveIds` — emit `<a id="…"></a>` anchors before block-level
 *   elements that carry an element id (own or nearest ancestor), so the
 *   parser can map `#fragment` TOC links onto blocks (SPEC-049 §9.1).
 * - Balanced site-chrome stripping (nested `.infobox`/`.navbox`/`.thumb`
 *   tables are removed as whole elements, not just up to the first close tag).
 * - Attribute-tolerant `<b>/<strong>/<em>/<i>` conversion (Wikipedia leads
 *   use `<b class="…">`), lazy-image `data-src` promotion, and web-matching
 *   title extraction (`<title>` → `og:title` → `<h1>`).
 */

export interface HtmlToMarkdownOptions {
  /** Resolve an image src to a display URI (EPUB archive paths). Return
   *  null/undefined to fall back to baseUrl resolution. */
  resolveImage?: (src: string) => string | null | undefined;
  /** Emit `<a id="…"></a>` anchors for id-bearing blocks (EPUB fragments). */
  preserveIds?: boolean;
}

/** Decode common HTML entities (named + numeric) — EPUB fidelity (ported
 *  from the legacy mobile EPUB parser's decodeEntities). */
export function decodeHtmlEntities(text: string): string {
  const named: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    mdash: '—', ndash: '–', hellip: '…', lsquo: '\u2018', rsquo: '\u2019',
    ldquo: '\u201C', rdquo: '\u201D', middot: '·', bull: '•', eacute: 'é',
    egrave: 'è', ecirc: 'ê', agrave: 'à', uuml: 'ü', ouml: 'ö', auml: 'ä',
    szlig: 'ß', deg: '°', times: '×', copy: '©', reg: '®',
  };
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex: string) => {
      const cp = parseInt(hex, 16);
      return Number.isNaN(cp) ? _m : String.fromCodePoint(cp);
    })
    .replace(/&#(\d+);/g, (_m, dec: string) => {
      const cp = parseInt(dec, 10);
      return Number.isNaN(cp) ? _m : String.fromCodePoint(cp);
    })
    .replace(/&([a-zA-Z]+);/g, (_m, name: string) => named[name] ?? _m);
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

/** Return the index just past the closing tag for the same-named element that
 *  opens at `openIdx`, balancing nested elements. `-1` if unbalanced. */
function findTagEnd(html: string, openIdx: number, tag: string): number {
  const openRe = new RegExp(`<${tag}\\b[^>]*>`, 'i');
  const closeRe = new RegExp(`</${tag}\\s*>`, 'i');
  const first = html.slice(openIdx).match(openRe);
  if (!first) return -1;
  let depth = 1;
  let pos = openIdx + first[0].length;
  while (pos < html.length) {
    const nextOpen = indexOfTagOutsideQuotes(html, pos, openRe);
    const nextClose = indexOfTagOutsideQuotes(html, pos, closeRe);
    if (nextClose === -1) return -1;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      pos = nextOpen + html.slice(nextOpen).match(openRe)![0].length;
    } else {
      depth--;
      pos = nextClose + html.slice(nextClose).match(closeRe)![0].length;
      if (depth === 0) return pos;
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

/** Tags stripped as site chrome (their whole element, balanced). */
const STRIP_TAGS = ['script', 'style', 'nav', 'header', 'footer', 'aside'];

/** Classes used by site chrome/boxes to strip as whole balanced elements.
 *  Matches the Next.js reader's querySelectorAll removal list. */
const STRIP_CLASSES = [
  'sidebar', 'menu', 'navigation', 'mw-jump-link', 'mw-editsection',
  'reference', 'noprint', 'thumb', 'infobox', 'navbox', 'metadata',
];

/** Remove whole elements (including all nested content) for a set of tags,
 *  balancing nested same-name elements so an `<aside>` containing a table is
 *  removed entirely rather than just its first row. */
function removeElementsByTag(html: string): string {
  let out = html;
  for (const tag of STRIP_TAGS) {
    const openRe = new RegExp(`<${tag}[\\s>]`, 'i');
    while (true) {
      const open = indexOfTagOutsideQuotes(out, 0, openRe);
      if (open === -1) break;
      const end = findTagEnd(out, open, tag);
      if (end === -1) {
        // Unbalanced: drop just the opening tag so we don't eat the article.
        out = out.slice(0, open) + out.slice(open).replace(new RegExp(`<${tag}[\\s>]`, 'i'), '');
        continue;
      }
      out = out.slice(0, open) + out.slice(end);
    }
  }
  return out;
}

/** Remove whole elements whose `class` attribute contains any target class
 *  token, balancing nested same-name elements. This is what actually strips a
 *  Wikipedia `.infobox` table (which nests other tables) instead of leaking
 *  its rows/images into the article. */
function removeElementsByClass(html: string): string {
  let out = html;
  for (const cls of STRIP_CLASSES) {
    const openRe = new RegExp(
      `<([a-z][a-z0-9]*)\\b[^>]*\\bclass=(["'])[^"']*\\b${cls}\\b[^"']*\\2[^>]*>`,
      'i',
    );
    while (true) {
      const m = openRe.exec(out);
      if (!m) break;
      const tag = m[1]!;
      const end = findTagEnd(out, m.index, tag);
      if (end === -1) break; // unbalanced — leave it rather than destroy content
      out = out.slice(0, m.index) + out.slice(end);
    }
  }
  return out;
}

/** Promote lazy-loaded image sources (`data-src`/`data-original`/
 *  `data-lazy-src`) into `src` so the real image renders instead of a 1×1
 *  placeholder. Mirrors the Next.js reader's `getAttribute(real)` promote. */
function promoteLazyImages(html: string): string {
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    const real = attrValue(tag, 'data-src')
      || attrValue(tag, 'data-original')
      || attrValue(tag, 'data-lazy-src');
    if (!real) return tag;
    let cleaned = tag.replace(/\ssrc\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
    const escaped = real.replace(/"/g, '&quot;');
    cleaned = cleaned.replace(/^<img/i, `<img src="${escaped}"`);
    return cleaned;
  });
}

/**
 * Strip ruby annotations from raw HTML (EPUB/Japanese books): keep the base
 * text and drop the reading (`rt`), the annotation container (`rtc`) and the
 * fallback parens (`rp`). The readers render their own phonetics, so publisher
 * ruby would otherwise duplicate the reading inline ("漢字かんじ").
 */
function stripRuby(html: string): string {
  return html
    // <ruby>base<rt>reading</rt></ruby> → base (rp fallback parens dropped).
    .replace(/<ruby\b[^>]*>([\s\S]*?)<\/ruby>/gi, (_m, inner: string) =>
      inner
        .replace(/<rtc\b[^>]*>[\s\S]*?<\/rtc>/gi, '')
        .replace(/<rt\b[^>]*>[\s\S]*?<\/rt>/gi, '')
        .replace(/<rp\b[^>]*>[\s\S]*?<\/rp>/gi, ''),
    )
    // Bare rt/rtc/rp outside a <ruby> element.
    .replace(/<(?:rt|rtc|rp)\b[^>]*>[\s\S]*?<\/(?:rt|rtc|rp)>/gi, '');
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

  // Document-level chrome: doctype, XML decl, comments, <head>.
  md = md
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<\?xml[^>]*\?>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '');

  // Extract the main content area (Wikipedia #mw-content-text, <article>,
  // <main>, or <body>) before stripping chrome so we only touch the body.
  md = extractMainContent(md);

  // Strip site chrome (whole balanced elements): nav/header/footer/aside,
  // then class-based boxes (.infobox/.navbox/.thumb/.metadata/…).
  md = removeElementsByTag(md);
  md = removeElementsByClass(md);

  // Promote lazy-loaded images before class/data attrs are stripped below.
  md = promoteLazyImages(md);

  // Insert fragment anchors before id-bearing blocks (EPUB)
  if (opts.preserveIds) {
    md = injectIdAnchors(md);
  }

  // Decode common HTML entities (named + numeric)
  md = decodeHtmlEntities(md);

  // Strip ruby annotations (EPUB): keep base text, drop readings/fallbacks.
  md = stripRuby(md);

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

  // Links: <a ... href="...">text</a> (with optional title) → [text](href)
  md = md.replace(/<a\s[^>]*?href="([^"]*)"[^>]*?title="([^"]*)"[^>]*?>([\s\S]*?)<\/a>/gi, (_m, href: string, title: string, text: string) => {
    const escapedTitle = String(title).replace(/"/g, '\\"');
    return `[${text}](${href} "${escapedTitle}")`;
  });
  md = md.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');

  // Bold + Italic (must be before single bold/italic)
  md = md.replace(/<(strong|b)\b[^>]*>[\s]*<(em|i)\b[^>]*>([\s\S]*?)<\/(em|i)>[\s]*<\/(strong|b)>/gi, '***$3***');
  md = md.replace(/<(em|i)\b[^>]*>[\s]*<(strong|b)\b[^>]*>([\s\S]*?)<\/(strong|b)>[\s]*<\/(em|i)>/gi, '***$2***');

  // Bold
  md = md.replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/(strong|b)>/gi, '**$2**');

  // Italic
  md = md.replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/(em|i)>/gi, '*$2*');

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

/** Extract a meta tag's `content` for a given `property` (og:title), handling
 *  either attribute order. */
function metaContent(html: string, property: string): string | null {
  const propQuoted = property.replace(/"/g, '\\"');
  const a = new RegExp(`<meta\\b[^>]*property=["']${propQuoted}["'][^>]*content=["']([^"']*)["']`, 'i');
  const b = new RegExp(`<meta\\b[^>]*content=["']([^"']*)["'][^>]*property=["']${propQuoted}["']`, 'i');
  const m = html.match(a) || html.match(b);
  return m?.[1]?.trim() || null;
}

/**
 * Extract a title from HTML, matching the web reader's order:
 * `<title>` → `og:title` → first `<h1>`.
 */
export function extractTitle(html: string): string | null {
  const stripTags = (s: string) => s.replace(/<[^>]+>/g, '').trim();

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    const t = stripTags(titleMatch[1]!);
    if (t) return t;
  }

  const og = metaContent(html, 'og:title');
  if (og) return og;

  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match) {
    const t = stripTags(h1Match[1]!);
    if (t) return t;
  }

  return null;
}
