/**
 * HTML to Markdown converter for React Native.
 *
 * The Next.js web reader uses DOMParser + turndown (browser APIs) to convert
 * fetched HTML articles to Markdown before tokenization. This module provides
 * an equivalent pure-JS converter that works in React Native without DOM APIs.
 */

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
 *  contain `>` and newlines (e.g. MediaWiki's `data-mw` JSON attributes). */
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
export function htmlToMarkdown(html: string, baseUrl: string): string {
  let md = html;

  // Remove unwanted elements
  md = stripUnwanted(md);

  // Extract main content
  md = extractMainContent(md);

  // Decode common HTML entities
  md = md
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');

  // Remove inline styles, class attrs, ids, data-* attrs to clean up
  md = md.replace(/\s+(style|class|id|data-[a-z-]+)="[^"]*"/gi, '');

  // Resolve relative URLs in href and src
  md = md.replace(/(href|src)="(\/[^"]*)"/gi, (_, attr, path) => {
    try {
      const resolved = new URL(path, baseUrl).href;
      return `${attr}="${resolved}"`;
    } catch {
      return `${attr}="${path}"`;
    }
  });

  // Images: <img ... src="..." alt="..." /> → ![alt](src)
  md = md.replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*\/?>/gi, '![$2]($1)');
  md = md.replace(/<img[^>]*alt="([^"]*)"[^>]*src="([^"]*)"[^>]*\/?>/gi, '![$1]($2)');
  md = md.replace(/<img[^>]*src="([^"]*)"[^>]*\/?>/gi, '![]($1)');

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

  // Remove any remaining HTML tags (quote-aware so `data-mw` JSON never leaks)
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
