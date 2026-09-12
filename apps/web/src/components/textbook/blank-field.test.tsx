// @vitest-environment jsdom
import React, { useSyncExternalStore } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act, fireEvent } from '@testing-library/react';
import { findTask, loadBook, type BookMeta, type Task } from '@langplayer/textbooks';
import { TextbookTaskProvider, useTextbookTask } from './task-provider';
import { BlankField } from './blank-field';
import { WordBank } from './word-bank';

vi.mock('@/hooks/use-t', () => ({ useT: () => (key: string) => key }));
vi.mock('@/providers/language-provider', () => ({
  useLanguage: () => ({ l1: { code: 'en', name: 'English' }, l2: { code: 'zh', name: 'Chinese' } }),
}));
// The pool renders its words through the tokenized path; this test is about the blank and the
// selection, so the tokenizer is replaced by its text.
vi.mock('@/components/tokenized-text', () => ({
  TokenizedText: ({ text }: { text: string }) => <span data-tokenized="">{text}</span>,
}));

// Responses persist to localStorage on every change, so a test that fills a blank would
// otherwise hand its answer to the next one.
beforeEach(() => window.localStorage.clear());

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

/** The task's current selection, so a tap's effect on it can be asserted. */
function SelectionProbe() {
  const ctx = useTextbookTask()!;
  const selected = useSyncExternalStore(
    ctx.selection.subscribe,
    () => ctx.selection.get(),
    () => ctx.selection.get(),
  );
  return <span data-selection={selected ?? ''} />;
}

const selection = () => document.querySelector('[data-selection]')!.getAttribute('data-selection');
const blankButton = () => document.querySelector('input, button[aria-label]') as HTMLElement;
const bankOption = (index = 0) =>
  [...document.querySelectorAll('button[aria-pressed]')][index] as HTMLElement;

async function taskC4(): Promise<{ book: BookMeta; task: Task }> {
  const book = await loadBook('tblt-hsk4');
  const found = book && findTask(book, 'tblt-hsk4.u06.C.t4');
  if (!found || !book) throw new Error('task C ➍ did not resolve');
  return { book, task: found };
}

/** One bank blank (C ➍ ②, answered from bank w1) with its pool and a selection readout. */
async function renderBankBlank() {
  const { book, task: t } = await taskC4();
  render(
    <TextbookTaskProvider task={t} book={book}>
      <BlankField blank={t.blanks!.b2!} />
      <WordBank bank={t.banks!.find((b) => b.id === 'w1')!} />
      <SelectionProbe />
    </TextbookTaskProvider>,
  );
  await act(async () => {});
  return t;
}

/**
 * Tapping a bank blank selects it — that is the whole gesture. It used to clear a filled blank
 * and toggle off an empty one, which made a stray second tap disarm the blank silently: the
 * next option tap then went nowhere, with nothing on screen to say why.
 */
describe('tapping a bank blank', () => {
  it('selects it, and a second tap keeps it selected', async () => {
    const t = await renderBankBlank();
    expect(selection()).toBe('');

    await act(async () => blankButton().click());
    expect(selection()).toBe('b2');
    expect(t.blanks!.b2!.kind).toBe('choose');

    await act(async () => blankButton().click());
    expect(selection()).toBe('b2');
  });

  it('does not clear a blank that already holds an answer', async () => {
    await renderBankBlank();
    await act(async () => blankButton().click());
    await act(async () => bankOption(0).click());

    const filled = (document.querySelector('button[aria-label]') as HTMLElement).textContent;
    expect(filled).toBeTruthy();

    await act(async () => blankButton().click());
    expect((document.querySelector('button[aria-label]') as HTMLElement).textContent).toBe(filled);
    expect(selection()).toBe('b2');
  });

  it('leaves the selection where it is after the pool fills it', async () => {
    await renderBankBlank();
    await act(async () => blankButton().click());
    await act(async () => bankOption(0).click());

    // Filling used to advance to the next empty blank, which moved a student who was
    // correcting an answer away from the blank they were on.
    expect(selection()).toBe('b2');
  });

  it('renders nothing inside an empty blank, and stays tappable', async () => {
    await renderBankBlank();
    const button = document.querySelector('button[aria-label]') as HTMLElement;
    // The blank's own bottom border is the line to write on; the placeholder underscore that
    // used to sit inside it drew a second line just above the first.
    expect(button.textContent).toBe('');

    // …and empty has to stay tappable. An empty `inline-flex` box has no content height, so the
    // whole target was the 2px border — measured 48×2 in the browser, against 48×24 now. The
    // classes are asserted rather than a rect because jsdom does no layout.
    expect(button.className).toContain('min-h-6');
    expect(button.className).toContain('min-w-[3em]');
  });
});
