// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { findTask, loadBook, type BookMeta, type Task } from '@langplayer/textbooks';
import { TextbookTaskProvider } from './task-provider';
import { BlankChoiceProvider } from './blank-choice';
import { BlankField } from './blank-field';

/**
 * A bank the content offers in the dialog (`Bank.choicesInDialog`).
 *
 * B ➌ is the case: four seat classes with photographs, asked about at a blank inside a sentence.
 * Tapping the blank opens the classes; a single answer is confirmed by the tap, and an answer
 * that is a *set* — K1275's two sleeping berths — takes several picks and a Confirm button, since
 * there is otherwise no way to say "done".
 */
vi.mock('@/hooks/use-t', () => ({ useT: () => (key: string) => key }));
vi.mock('@/providers/language-provider', () => ({
  useLanguage: () => ({ l1: { code: 'en', name: 'English' }, l2: { code: 'zh', name: 'Chinese' } }),
}));
vi.mock('@/components/tokenized-text', () => ({
  TokenizedText: ({ text }: { text: string }) => <span data-tokenized="">{text}</span>,
}));

async function taskB3(): Promise<{ book: BookMeta; task: Task }> {
  const book = await loadBook('tblt-hsk4');
  const found = book && findTask(book, 'tblt-hsk4.u06.B.t3');
  if (!found || !book) throw new Error('task B ➌ did not resolve');
  return { book, task: found };
}

async function renderBlanks() {
  const { book, task: t } = await taskB3();
  render(
    <TextbookTaskProvider task={t} book={book}>
      <BlankChoiceProvider>
        {/* ② is a single answer (商务座), ③ takes two (硬卧、软卧). */}
        <BlankField blank={t.blanks!.b2!} />
        <BlankField blank={t.blanks!.b3!} />
      </BlankChoiceProvider>
    </TextbookTaskProvider>,
  );
  await act(async () => {});
  return t;
}

const blankButton = (numeral: string) =>
  [...document.querySelectorAll('button[aria-label]')].find((b) =>
    b.getAttribute('aria-label')?.startsWith(numeral),
  ) as HTMLButtonElement;

const dialog = () => document.querySelector('[role="dialog"]');
const tile = (name: string) =>
  [...(dialog()?.querySelectorAll('button[aria-label]') ?? [])].find(
    (b) => b.getAttribute('aria-label') === name,
  ) as HTMLButtonElement;
// The mocked `t()` returns its key, so the button's text is the key itself.
const confirm = () =>
  [...(dialog()?.querySelectorAll('button') ?? [])].find((b) =>
    /action\.confirm/.test(b.textContent ?? ''),
  );

beforeEach(() => window.localStorage.clear());

describe('a blank answered from a dialog bank', () => {
  it('opens the bank’s classes when the blank is tapped', async () => {
    await renderBlanks();
    expect(dialog()).toBeNull();

    await act(async () => blankButton('②').click());

    // The class *is* the answer, so the tiles are keyed by it; 无座 carries the workbook's
    // （站着） as its label.
    expect(
      [...dialog()!.querySelectorAll('button[aria-label]')].map((b) => b.getAttribute('aria-label')),
    ).toEqual(['无座. （站着）', '二等座', '一等座', '商务座', 'action.close']);
  });

  it('fills a single answer on the tap, with no Confirm button to press', async () => {
    await renderBlanks();
    await act(async () => blankButton('②').click());
    await act(async () => tile('商务座').click());

    expect(dialog()).toBeNull();
    expect(blankButton('②').textContent).toBe('商务座');
    expect(blankButton('②').getAttribute('aria-label')).toBe('② 商务座');
  });

  it('takes several picks, keeps the dialog open, and confirms with a button', async () => {
    const t = await renderBlanks();
    expect(t.blanks!.b3!.multiple).toBe(true);

    await act(async () => blankButton('③').click());
    // The button is there from the moment the dialog opens: the student can see what they are
    // picking towards, and it is what closes the dialog once they are done.
    expect(confirm()).toBeDefined();
    await act(async () => tile('硬卧').click());
    await act(async () => tile('软卧').click());

    // Both picks are written as they are made, and the dialog stays open so more can be added.
    expect(dialog()).not.toBeNull();
    expect(blankButton('③').textContent).toBe('硬卧、软卧');

    const button = confirm();
    expect(button).toBeDefined();
    await act(async () => button!.click());

    expect(dialog()).toBeNull();
    expect(blankButton('③').textContent).toBe('硬卧、软卧');
  });

  it('offers no Confirm button on a single answer', async () => {
    await renderBlanks();
    await act(async () => blankButton('②').click());
    // The tap is the confirmation; a second button that does the same thing would be noise.
    expect(confirm()).toBeUndefined();
  });
});

/**
 * A multi-answer blank stores its picks in one string, so "is this option chosen?" cannot be a
 * comparison of that string with an option: `硬卧、软卧` equals neither. With one pick the equality
 * happened to hold, which is why the bug only appeared from the second pick onwards — the tiles
 * then showed nothing chosen while the blank read both.
 */
describe('highlighting a multi-answer dialog blank', () => {
  it('marks every pick, not just the first', async () => {
    await renderBlanks();
    await act(async () => blankButton('③').click());

    const pressed = () =>
      [...dialog()!.querySelectorAll('button[aria-label]')]
        .filter((b) => b.getAttribute('aria-pressed') === 'true')
        .map((b) => b.getAttribute('aria-label'));

    expect(pressed()).toEqual([]);

    await act(async () => tile('硬卧').click());
    expect(pressed()).toEqual(['硬卧']);

    await act(async () => tile('软卧').click());
    expect(pressed()).toEqual(['硬卧', '软卧']);
    expect(blankButton('③').textContent).toBe('硬卧、软卧');
  });

  it('un-marks a pick when it is tapped again', async () => {
    await renderBlanks();
    await act(async () => blankButton('③').click());
    await act(async () => tile('硬卧').click());
    await act(async () => tile('软卧').click());
    await act(async () => tile('硬卧').click());

    expect(blankButton('③').textContent).toBe('软卧');
    const pressed = [...dialog()!.querySelectorAll('button[aria-pressed="true"]')].map((b) =>
      b.getAttribute('aria-label'),
    );
    expect(pressed).toEqual(['软卧']);
  });
});
