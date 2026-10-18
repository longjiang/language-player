// @vitest-environment jsdom
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';
import { findTask, loadBook, type BookMeta, type Task } from '@langplayer/textbooks';
import { TextbookTaskProvider, TEXTBOOK_STORAGE_PREFIX } from './task-provider';
import { BlankField } from './blank-field';

vi.mock('@/hooks/use-t', () => ({ useT: () => (key: string) => key }));

/**
 * B ➏ shows the six illustrations the student placed in B ➎ — read-only, because ➏
 * asks for the words and a student who changed the pictures here would be answering ➎
 * inside ➏. The pick is read from ➎'s saved state at render (ADR-0044 is device-local),
 * so there is no copy in ➏ to go stale.
 */
beforeEach(() => window.localStorage.clear());

async function taskB6(): Promise<{ book: BookMeta; task: Task }> {
  const book = await loadBook('tblt-hsk4');
  const found = book && findTask(book, 'tblt-hsk4.u06.B.t6');
  if (!found || !book) throw new Error('task B ➏ did not resolve');
  return { book, task: found };
}

/** Seed task 5's saved responses, the way answering it would. */
function seedTask5(responses: Record<string, string>) {
  window.localStorage.setItem(
    TEXTBOOK_STORAGE_PREFIX + 'tblt-hsk4.u06.B.t5',
    JSON.stringify({
      taskId: 'tblt-hsk4.u06.B.t5',
      contentVersion: 3,
      responses,
      attempts: [],
    }),
  );
}

/** b8 is the picture carried from ➎'s 插图一 (blank b1). */
async function renderCarried(blankId = 'b8') {
  const { book, task } = await taskB6();
  render(
    <TextbookTaskProvider task={task} book={book}>
      <BlankField blank={task.blanks![blankId]!} />
    </TextbookTaskProvider>,
  );
  await act(async () => {});
}

const img = () => document.querySelector('img') as HTMLImageElement | null;

describe('a carried illustration slot', () => {
  it('prints the picture task 5 placed, from task 5’s saved state', async () => {
    // ➎'s b1 is the given A, but the student may have re-picked it — so the value has to
    // come from the saved responses, not from the source blank's answer.
    seedTask5({ b1: 'C' });
    await renderCarried('b8');

    expect(img()?.src).toContain('b5-illustration-c.jpg');
    expect(img()?.alt).toBe('乘客信息预填（提前填好信息）');
  });

  it('is display-only: the box is not a control', async () => {
    seedTask5({ b1: 'A' });
    await renderCarried('b8');

    // Tapping it must not arm this task's picture bank or open its dialog.
    expect(document.querySelector('button')).toBeNull();
    expect(document.querySelector('[aria-pressed]')).toBeNull();
  });

  it('stays an empty box when task 5 has no pick — never a prompt to choose here', async () => {
    await renderCarried('b8');

    expect(img()).toBeNull();
    // The "tap to choose" hint belongs to the task that asks for a picture, not this one.
    expect(document.body.textContent).not.toContain('label.pick_illustration');
    expect(document.querySelector('button')).toBeNull();
  });

  it('follows a re-pick rather than remembering the first one', async () => {
    seedTask5({ b1: 'C' });
    await renderCarried('b8');
    expect(img()?.src).toContain('b5-illustration-c.jpg');

    // Remount, the way returning to the task does — nothing cached it in ➏.
    cleanup();
    seedTask5({ b1: 'E' });
    await renderCarried('b8');
    expect(img()?.src).toContain('b5-illustration-e.jpg');
  });
});
