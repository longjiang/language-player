// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { findTask, loadBook, type Task } from '@langplayer/textbooks';
import { DataTable } from './data-table';
import { TextbookTaskProvider } from './task-provider';

vi.mock('@/hooks/use-t', () => ({ useT: () => (key: string) => key }));
vi.mock('@/providers/language-provider', () => ({
  useLanguage: () => ({ l1: { code: 'en', name: 'English' }, l2: { code: 'zh', name: 'Chinese' } }),
}));
vi.mock('@/components/tokenized-text', () => ({
  TokenizedText: ({ text }: { text: string }) => <span data-tokenized="">{text}</span>,
}));

async function taskB1(): Promise<Task> {
  const book = await loadBook('tblt-hsk4');
  const found = book && findTask(book, 'tblt-hsk4.u06.B.t1');
  if (!found) throw new Error('task B ➊ did not resolve');
  return found;
}

/**
 * A row's emoji is decoration, and has to stay out of the tokenized cell.
 *
 * A cell is L2 vocabulary: its words are tokens the student can look up. Put the emoji in that
 * text and it becomes a token of its own — the lemmatizer returns it with no lemmas and its own
 * glyph as the pronunciation, so it draws no reading, but tapping it opens the dictionary on
 * 🚄. Keeping it outside also means the tokenizer never sees it.
 */
describe('a table row with an icon', () => {
  it('draws the glyph beside the cell rather than inside its text', async () => {
    const book = await loadBook('tblt-hsk4');
    const t = await taskB1();
    const table = t.body.find((s) => s.kind === 'dataTable')!;

    render(
      <TextbookTaskProvider task={t} book={book!}>
        <DataTable table={table} />
      </TextbookTaskProvider>,
    );

    const glyphs = [...document.querySelectorAll('[aria-hidden]')].filter((n) =>
      /[\u{1F300}-\u{1FAFF}]/u.test(n.textContent ?? ''),
    );
    expect(glyphs.map((n) => n.textContent)).toEqual(['🚄', '🚅', '🚅', '🚈', '🚃', '🚃']);
    for (const glyph of glyphs) expect(glyph.closest('[data-tokenized]')).toBeNull();

    // …and the row's own text is unchanged, letter first, as the instructions point at.
    const tokenized = [...document.querySelectorAll('[data-tokenized]')].map((n) => n.textContent);
    expect(tokenized[0]).toBe('G815 “高815”');
  });
});
