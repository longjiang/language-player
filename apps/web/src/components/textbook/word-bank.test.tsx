// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { findTask, loadBook, type BookMeta, type Task } from '@langplayer/textbooks';
import { TextbookTaskProvider, useTextbookTask } from './task-provider';
import { TaskAudioProvider } from './task-audio';
import { TaskStimulus } from './task-shell';
import { BlankChoiceProvider } from './blank-choice';

vi.mock('@/hooks/use-t', () => ({ useT: () => (key: string) => key }));
vi.mock('@/providers/language-provider', () => ({
  useLanguage: () => ({ l1: { code: 'en', name: 'English' }, l2: { code: 'zh', name: 'Chinese' } }),
}));
vi.mock('@/providers/settings-provider', () => ({
  useSettingsContext: () => ({ getL2: () => ({ display: { translation: false } }) }),
}));
// The pools are text, so the assertion is on the tokenized element rather than on a string:
// a reference pool that renders as one blob would pass a text assertion and still be wrong.
// jsdom has no media stack; the player pauses its element on unmount.
HTMLMediaElement.prototype.pause = vi.fn();
HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve()) as unknown as HTMLMediaElement['play'];

vi.mock('@/components/tokenized-text', () => ({
  TokenizedText: ({ text }: { text: string }) => <span data-tokenized="">{text}</span>,
}));

async function taskA4(): Promise<{ book: BookMeta; task: Task }> {
  const book = await loadBook('tblt-hsk4');
  const found = book && findTask(book, 'tblt-hsk4.u06.A.t4');
  if (!found || !book) throw new Error('task A ➍ did not resolve');
  return { book, task: found };
}

async function renderStimulus(t: Task, book: BookMeta) {
  const view = render(
    <TextbookTaskProvider task={t} book={book}>
      <TaskAudioProvider task={t}>
        <BlankChoiceProvider>
          <TaskStimulus />
        </BlankChoiceProvider>
      </TaskAudioProvider>
    </TextbookTaskProvider>,
  );
  await act(async () => {});
  return view;
}

/**
 * Each pool is a flex row of options, as `WordBank` renders them.
 *
 * Deduplicated by row: every option holds a tokenized span, so scanning the tokenized
 * elements finds each row once per option.
 */
const pools = () => [
  ...new Set(
    [...document.querySelectorAll('[data-tokenized]')]
      .map((span) => span.closest('div.flex-wrap'))
      .filter((node): node is HTMLElement => node !== null),
  ),
].map((row) => [...row.children]);

describe('A ➍’s option pools', () => {
  it('prints each summary’s own three words at the end of that summary', async () => {
    const { book, task: t } = await taskA4();
    await renderStimulus(t, book);

    const rows = pools();
    expect(rows.map((row) => row.length)).toEqual([3, 3, 3, 3, 3]);
    expect(rows.map((row) => row.map((node) => node.textContent))).toEqual([
      ['舒服', '随处', '坡路'],
      ['不管', '还是', '趟'],
      ['虽然', '但是', '一般'],
      ['趟', '摇', '快'],
      ['确实', '安心', '差不多'],
    ]);
  });

  it('prints them inside the passage they belong to, not in one list at the bottom', async () => {
    const { book, task: t } = await taskA4();
    await renderStimulus(t, book);

    // Five pools, and each one follows the summary whose blanks it answers: the words are
    // read in the same block as the blanks they fill.
    const passages = [...document.querySelectorAll('div.text-lg')];
    expect(passages).toHaveLength(5);
    for (const [index, passage] of passages.entries()) {
      const pool = pools()[index]!;
      const block = passage.parentElement!;
      expect(block.contains(pool[0]!)).toBe(true);
    }
  });

  it('renders them as text to type from, not as buttons to pick', async () => {
    const { book, task: t } = await taskA4();
    await renderStimulus(t, book);

    // A ➍'s blanks are typed, so the pool is a reference list. Buttons would both invite
    // picking and swallow the words' taps, which are the dictionary's here.
    for (const row of pools()) {
      for (const option of row) {
        expect(option.tagName).toBe('DIV');
        expect(option.querySelector('button')).toBeNull();
      }
    }
    // …and the words themselves are tokenized, which is what makes them look-up-able.
    expect(pools()[0]![0]!.querySelector('[data-tokenized]')?.textContent).toBe('舒服');
  });
});

/**
 * Striking out a used word.
 *
 * The strike means "you have placed this", so it is not suppressed by `allowReuse` — A ➍ (4)
 * uses 摇 twice and its pool has three words, which is exactly where a student needs to see
 * what they have already used. What must not count is a `given` blank: A ➍ (1) is the printed
 * worked example, pre-filled in the store, so counting its answers would strike its whole pool
 * before the student had done anything.
 */
function Writer({ blankId, value }: { blankId: string; value: string }) {
  const ctx = useTextbookTask()!;
  return (
    <button type="button" aria-label="write" onClick={() => ctx.store.setValue(blankId, value)}>
      write
    </button>
  );
}

const chipFor = (word: string) =>
  pools()
    .flat()
    .find((option) => option.textContent?.startsWith(word))!;

describe('a used option', () => {
  it('is struck out even where allowReuse is true', async () => {
    const { book, task: t } = await taskA4();
    // (4)'s pool is 趟、摇、快 with reuse allowed (摇 answers two blanks).
    expect(t.banks!.find((b) => b.id === 'a4-4')!.allowReuse).toBe(true);
    render(
      <TextbookTaskProvider task={t} book={book}>
        <TaskAudioProvider task={t}>
          <BlankChoiceProvider>
            <TaskStimulus />
            <Writer blankId="b11" value="趟" />
          </BlankChoiceProvider>
        </TaskAudioProvider>
      </TextbookTaskProvider>,
    );
    await act(async () => {});

    expect(chipFor('趟').className).not.toContain('line-through');

    await act(async () => {
      document.querySelector('button[aria-label="write"]')!.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });

    expect(chipFor('趟').className).toContain('line-through');
    // Still there and still usable — reuse is allowed, the strike is information.
    expect(chipFor('趟').textContent).toContain('趟');
  });

  it('does not count the workbook’s own worked-example answers', async () => {
    const { book, task: t } = await taskA4();
    // (1)'s four blanks are all `given`, so the store holds 随处、坡路、舒服 from the start.
    render(
      <TextbookTaskProvider task={t} book={book}>
        <TaskAudioProvider task={t}>
          <BlankChoiceProvider>
            <TaskStimulus />
          </BlankChoiceProvider>
        </TaskAudioProvider>
      </TextbookTaskProvider>,
    );
    await act(async () => {});

    for (const word of ['舒服', '随处', '坡路']) {
      expect(chipFor(word).className).not.toContain('line-through');
    }
  });
});
