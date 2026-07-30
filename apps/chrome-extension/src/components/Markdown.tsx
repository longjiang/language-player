/**
 * SimpleMarkdown — lightweight markdown-to-HTML renderer for the extension.
 *
 * Handles: bold, italic, code blocks, inline code, headers, lists, tables.
 * Used by both DictionaryCard (word explain) and TranscriptApp (line explain).
 */

import React from 'react';

/** Convert basic markdown to HTML. */
export function renderMarkdown(text: string): string {
  let html = text
    // Escape HTML entities first
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code blocks (``` ... ```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
  // Inline code (`...`)
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Bold (**...**)
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Italic (*...*) — careful not to match **
  html = html.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');
  // Headers
  html = html.replace(/^#### (.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>');
  // Horizontal rule
  html = html.replace(/^---$/gm, '<hr/>');

  // Tables — convert markdown tables to HTML
  html = html.replace(/(?:^\|.+\|$\n?)+/gm, (tableBlock) => {
    const rows = tableBlock.trim().split('\n');
    // Filter out separator rows like |---|---|
    const dataRows = rows.filter(r => !/^\|[\s\-:]+\|[\s\-:|]+\|$/.test(r));
    if (dataRows.length === 0) return tableBlock;
    const cells = dataRows.map(row =>
      '<tr>' + row.split('|').filter(c => c.trim()).map(c =>
        '<td>' + c.trim() + '</td>'
      ).join('') + '</tr>'
    );
    return '<table>' + cells.join('') + '</table>';
  });

  // Unordered list items
  html = html.replace(/^[\-\*] (.+)$/gm, '<li>$1</li>');
  // Wrap consecutive <li> in <ul>
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');
  // Paragraphs (double newline)
  html = html.replace(/\n\n/g, '</p><p>');
  // Single newline → line break
  html = html.replace(/\n/g, '<br/>');

  // Wrap in paragraph if not already wrapped
  if (!/^<(h[2-5]|table|ul|pre|hr|p)/.test(html)) {
    html = '<p>' + html + '</p>';
  }

  return html;
}

export const Markdown: React.FC<{ text: string }> = React.memo(({ text }) => (
  <div
    className="lpv-markdown"
    dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }}
  />
));
Markdown.displayName = 'Markdown';
