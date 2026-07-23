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

/**
 * Extract the main content area from HTML.
 * Looks for #mw-content-text (Wikipedia), <article>, <main>, or falls back to <body>.
 */
function extractMainContent(html: string): string {
  // Try Wikipedia-style content
  const mwMatch = html.match(/<[a-z]+[^>]*id="mw-content-text"[^>]*>([\s\S]*?)<\/[a-z]+>/i);
  if (mwMatch) return mwMatch[0];

  // Try <article>
  const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  if (articleMatch) return articleMatch[0];

  // Try <main>
  const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  if (mainMatch) return mainMatch[0];

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

  // Remove any remaining HTML tags
  md = md.replace(/<[^>]+>/g, '');

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
