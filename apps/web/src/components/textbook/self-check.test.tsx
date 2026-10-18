// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { findTask, loadBook, type BookMeta, type Task } from '@langplayer/textbooks';
import { TextbookTaskProvider, TEXTBOOK_STORAGE_PREFIX } from './task-provider';
import { BlankField } from './blank-field';

vi.mock('@/hooks/use-t', () => ({ useT: () => (key: string) => key }));
vi.mock('@/providers/language-provider', () => ({
  useLanguage: () => ({ l1: { code: 'en', name: 'English' }, l2: { code: 'zh', name: 'Chinese' } }),
}));
// The answer is rendered tokenized in the app; this test is about the reveal, so the tokenizer
// is replaced by its text.
vi.mock('@/components/tokenized-text', () => ({
  TokenizedText: ({ text }: { text: string }) => <span data-tokenized="">{text}</span>,
}));

beforeEach(() => window.localStorage.clear());

/**
 * C ➌ is the pilot's check-only task: three comprehension questions whose answers the printed
 * key gives as model sentences, so nothing is typed or graded. Each question reveals its model
 * answer for the student to compare with what they said to themselves (and hides it again so
 * they can re-test); checking all three records the task's completion, because there is no
 * submit button to do it.
 */
async function renderC3(): Promise<{ book: BookMeta; task: Task }> {
  const book = await loadBook('tblt-hsk4');
  const task = book && findTask(book, 'tblt-hsk4.u06.C.t3');
  if (!task || !book) throw new Error('task C ➌ did not resolve');
  render(
    <TextbookTaskProvider task={task} book={book}>
      {['b1', 'b2', 'b3'].map((id) => (
        <BlankField key={id} blank={task.blanks![id]!} />
      ))}
    </TextbookTaskProvider>,
  );
  await act(async () => {});
  return { book, task };
}

const buttons = () => [...document.querySelectorAll('button')] as HTMLButtonElement[];
const saved = () =>
  JSON.parse(
    window.localStorage.getItem(TEXTBOOK_STORAGE_PREFIX + 'tblt-hsk4.u06.C.t3') ?? 'null',
  ) as { attempts: Array<{ voidedAt?: number; result: { complete: boolean } }> } | null;

describe('a self-check question', () => {
  it('offers a Check answer control per question, with no input to fill in', async () => {
    await renderC3();

    expect(buttons().map((b) => b.textContent)).toEqual([
      'action.check_answer',
      'action.check_answer',
      'action.check_answer',
    ]);
    expect(document.querySelectorAll('input, textarea')).toHaveLength(0);
  });

  it('reveals the model answer, then hides it again', async () => {
    await renderC3();
    expect(document.body.textContent).not.toContain('乘客想买今天');

    await act(async () => buttons()[0]!.click());
    expect(document.body.textContent).toContain('乘客想买今天');
    expect(buttons()[0]!.textContent).toBe('action.hide_answer');

    await act(async () => buttons()[0]!.click());
    expect(document.body.textContent).not.toContain('乘客想买今天');
    expect(buttons()[0]!.textContent).toBe('action.check_answer');
  });

  it('stores each reveal, and checking is not itself a completion', async () => {
    await renderC3();

    for (const index of [0, 1, 2]) {
      await act(async () => buttons()[index]!.click());
    }

    // The reveals are responses, so they survive a reload…
    expect(saved()?.attempts).toHaveLength(0);
    const stored = JSON.parse(
      window.localStorage.getItem(TEXTBOOK_STORAGE_PREFIX + 'tblt-hsk4.u06.C.t3') ?? 'null',
    ) as { responses: Record<string, string> };
    expect(stored.responses).toEqual({ b1: '1', b2: '1', b3: '1' });

    // …but completing the task is the explicit Mark as complete button's job, not the last
    // check's: a check-only task has no submit, and checking every answer is not an act the
    // student necessarily means as "done".
    expect(saved()?.attempts).toHaveLength(0);
  });

  it('clears a reveal when it is hidden again', async () => {
    await renderC3();
    await act(async () => buttons()[0]!.click());
    await act(async () => buttons()[0]!.click());

    const stored = JSON.parse(
      window.localStorage.getItem(TEXTBOOK_STORAGE_PREFIX + 'tblt-hsk4.u06.C.t3') ?? 'null',
    ) as { responses: Record<string, string> };
    expect(stored.responses.b1).toBe('');
  });
});
