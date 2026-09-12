// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, act, fireEvent } from '@testing-library/react';
import { findTask, loadBook, type BookMeta, type Task } from '@langplayer/textbooks';
import { TextbookTaskProvider } from './task-provider';
import { BlankField } from './blank-field';

vi.mock('@/hooks/use-t', () => ({ useT: () => (key: string) => key }));
vi.mock('@/providers/language-provider', () => ({
  useLanguage: () => ({ l1: { code: 'en', name: 'English' }, l2: { code: 'zh', name: 'Chinese' } }),
}));

async function taskA4(): Promise<{ book: BookMeta; task: Task }> {
  const book = await loadBook('tblt-hsk4');
  const found = book && findTask(book, 'tblt-hsk4.u06.A.t4');
  if (!found || !book) throw new Error('task A ➍ did not resolve');
  return { book, task: found };
}

function renderBlank(t: Task, book: BookMeta, blankId: string) {
  return render(
    <TextbookTaskProvider task={t} book={book}>
      <BlankField blank={t.blanks![blankId]!} />
    </TextbookTaskProvider>,
  );
}

const input = () => document.querySelector('input') as HTMLInputElement;

describe('a typed blank', () => {
  it('is as wide as the printed answer, and grows with what is typed', async () => {
    const { book, task: t } = await taskA4();
    // b15's answer is 差不多 (3 characters), so the blank starts at 4ch.
    await renderBlank(t, book, 'b15');
    expect(input().style.width).toBe('4ch');

    await act(async () => {
      fireEvent.change(input(), { target: { value: '差不多吧' } });
    });

    // A wrong answer is often longer than the right one; a fixed width clipped it
    // mid-word and the student could not read back what they had written.
    expect(input().style.width).toBe('5ch');
    expect(input().value).toBe('差不多吧');
  });

  it('keeps the printed width when the answer is shorter than it', async () => {
    const { book, task: t } = await taskA4();
    // b11's answer is 趟 (1 character), but the blank still starts at the printed 2ch+1 —
    // shrinking below the printed box would move the sentence as the student types.
    await renderBlank(t, book, 'b11');
    expect(input().style.width).toBe('3ch');
    await act(async () => {
      fireEvent.change(input(), { target: { value: '趟' } });
    });
    expect(input().style.width).toBe('3ch');
  });
});
