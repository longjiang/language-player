/**
 * Strips common markdown syntax to plain text for use in search snippets.
 * Handles: headings, bold/italic, links, images, code, blockquotes.
 */
export function stripMarkdown(md: string): string {
  return md
    // Remove images: ![alt](url)
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    // Remove links: [text](url) → text
    .replace(/\[([^\]]*)\]\([^)]+\)/g, '$1')
    // Remove heading markers
    .replace(/^#{1,6}\s+/gm, '')
    // Remove bold/italic markers (**text** → text, *text* → text)
    .replace(/(\*{1,2}|_{1,2})(.*?)\1/g, '$2')
    // Remove inline code backticks
    .replace(/`([^`]*)`/g, '$1')
    // Remove blockquote markers
    .replace(/^>\s?/gm, '')
    // Remove horizontal rules
    .replace(/^(-{3,}|\*{3,}|_{3,})\s*$/gm, '')
    // Remove HTML tags
    .replace(/<[^>]*>/g, '')
    // Collapse whitespace
    .replace(/\n{2,}/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
