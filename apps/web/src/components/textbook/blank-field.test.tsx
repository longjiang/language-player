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
  it('sizes itself in ems, so a two-character answer fits', async () => {
    const { book, task: t } = await taskA4();
    // b8's answer is 虽然 (2 characters). Measured in `ch` — half an em each — this blank was
    // 3ch ≈ 1.5em and the input cut the second character in half, which is the bug: a width
    // computed per *character* has to be computed per *em*.
    await renderBlank(t, book, 'b8');
    expect(input().style.width).toBe('calc(2em + 1.25rem)');

    await act(async () => {
      fireEvent.change(input(), { target: { value: '一般' } });
    });

    expect(input().style.width).toBe('calc(2em + 1.25rem)');
    expect(input().value).toBe('一般');
  });

  it('grows with what is typed, because a wrong answer is longer than the right one', async () => {
    const { book, task: t } = await taskA4();
    await renderBlank(t, book, 'b15');
    expect(input().style.width).toBe('calc(3em + 1.25rem)');

    await act(async () => {
      fireEvent.change(input(), { target: { value: '差不多吧' } });
    });

    expect(input().style.width).toBe('calc(4em + 1.25rem)');
  });

  it('never shrinks below the printed width', async () => {
    const { book, task: t } = await taskA4();
    // b11's answer is 趟 (one character), so the blank keeps the printed two-character floor —
    // shrinking below it would move the sentence as the student types.
    await renderBlank(t, book, 'b11');
    expect(input().style.width).toBe('calc(2em + 1.25rem)');
    await act(async () => {
      fireEvent.change(input(), { target: { value: '趟' } });
    });
    expect(input().style.width).toBe('calc(2em + 1.25rem)');
  });
});
