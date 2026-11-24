// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { findTask, loadBook, type BookMeta, type Task } from '@langplayer/textbooks';
import { TextbookTaskProvider, TEXTBOOK_STORAGE_PREFIX } from './task-provider';
import { TaskShell } from './task-shell';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

vi.mock('@/hooks/use-t', () => ({ useT: () => (key: string) => key }));
vi.mock('@/providers/language-provider', () => ({
  useLanguage: () => ({ l1: { code: 'en', name: 'English' }, l2: { code: 'zh', name: 'Chinese' } }),
}));
vi.mock('@/providers/settings-provider', () => ({
  useSettingsContext: () => ({ getL2: () => ({ display: { translation: false } }) }),
}));
// The instructions are tokenized in the app; this test is about the control group, so the
// tokenizer is replaced by its text.
vi.mock('@/components/tokenized-text', () => ({
  TokenizedText: ({ text }: { text: string }) => <span data-tokenized="">{text}</span>,
}));
// jsdom has no media stack; D ➍ carries a recording, and the player pauses it on unmount.
HTMLMediaElement.prototype.pause = vi.fn();
HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve()) as unknown as HTMLMediaElement['play'];

beforeEach(() => {
  window.localStorage.clear();
  push.mockClear();
});

const buttons = () => [...document.querySelectorAll('button')] as HTMLButtonElement[];
/**
 * The labelled buttons, in DOM order. The audio pill's play / transcript / replay controls are
 * icon-only (their names are accessible labels, not text), so they carry no text and are left
 * out — this test is about the control group's labels.
 */
const labels = () => buttons().map((b) => b.textContent ?? '').filter(Boolean);
const button = (label: string) => buttons().find((b) => b.textContent === label);

/** The attempts the task's own save slot holds, in order. */
const savedAttempts = (taskId: string) =>
  (JSON.parse(window.localStorage.getItem(TEXTBOOK_STORAGE_PREFIX + taskId) ?? 'null') as
    | { attempts: Array<{ voidedAt?: number; result: { complete: boolean } }> }
    | null)?.attempts ?? [];

async function renderTask(taskId: string): Promise<{ book: BookMeta; task: Task }> {
  const book = await loadBook('tblt-hsk4');
  const task = book && findTask(book, taskId);
  if (!book || !task) throw new Error(`task ${taskId} did not resolve`);
  render(
    <TextbookTaskProvider task={task} book={book}>
      <TaskShell />
    </TextbookTaskProvider>,
  );
  await act(async () => {});
  return { book, task };
}

/**
 * D ➍ is the pilot's read-only task: a read-along shadowing exercise — a recording, its
 * transcript, and no blanks at all. Nothing can be submitted or checked, so the student records
 * the completion themselves with Mark as complete (as on C ➌), and Next waits for it.
 */
describe('a read-only task’s controls', () => {
  it('offers Mark as complete instead of Submit, with Next waiting for it', async () => {
    await renderTask('tblt-hsk4.u06.D.t4');

    expect(labels()).toEqual(['action.mark_complete', 'action.next']);
    expect(button('action.next')!.disabled).toBe(true);
    expect(savedAttempts('tblt-hsk4.u06.D.t4')).toHaveLength(0);
  });

  it('records one complete attempt, turns the button into Completed, and enables Next', async () => {
    await renderTask('tblt-hsk4.u06.D.t4');

    await act(async () => {
      button('action.mark_complete')!.click();
    });

    expect(button('label.completed')).toBeTruthy();
    expect(button('label.completed')!.disabled).toBe(true);
    expect(button('action.next')!.disabled).toBe(false);

    const attempts = savedAttempts('tblt-hsk4.u06.D.t4');
    expect(attempts.filter((a) => !a.voidedAt)).toHaveLength(1);
    expect(attempts.filter((a) => !a.voidedAt)[0]!.result.complete).toBe(true);
    // Nothing was submitted, so the task reports no result banner — there is no score.
    expect(document.querySelector('[role="status"]')).toBeNull();
  });

  it('does not append a second attempt when the button is pressed again', async () => {
    await renderTask('tblt-hsk4.u06.D.t4');

    await act(async () => {
      button('action.mark_complete')!.click();
    });
    await act(async () => {
      button('label.completed')!.click();
    });

    expect(savedAttempts('tblt-hsk4.u06.D.t4').filter((a) => !a.voidedAt)).toHaveLength(1);
  });

  it('moves to the next task once completed', async () => {
    await renderTask('tblt-hsk4.u06.D.t4');

    await act(async () => {
      button('action.mark_complete')!.click();
    });
    await act(async () => {
      button('action.next')!.click();
    });

    expect(push).toHaveBeenCalledWith('/en/zh/tasks/tblt-hsk4/u06/D/t5');
  });

  it('gives the book’s other read-only task the same controls', async () => {
    // E ➌ is the model social-media post: a recording and a passage, again no blanks.
    await renderTask('tblt-hsk4.u06.E.t3');

    expect(labels()).toEqual(['action.mark_complete', 'action.next']);
    await act(async () => {
      button('action.mark_complete')!.click();
    });
    expect(button('label.completed')).toBeTruthy();
    expect(button('action.next')!.disabled).toBe(false);
  });
});

/** A graded task is untouched: its own Submit / Try again pair, and Mark as complete is absent. */
describe('a graded task’s controls', () => {
  it('keeps Submit and Try again, with no Mark as complete', async () => {
    await renderTask('tblt-hsk4.u06.C.t4');

    expect(labels()).toEqual(['review.submit', 'action.try_again', 'action.next']);
    expect(button('action.next')!.disabled).toBe(true);
  });
});
