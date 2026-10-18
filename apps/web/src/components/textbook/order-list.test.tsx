// @vitest-environment jsdom
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, act, fireEvent } from '@testing-library/react';
import { findTask, loadBook, type BookMeta, type OrderListStimulus, type Task } from '@langplayer/textbooks';
import { TextbookTaskProvider, TEXTBOOK_STORAGE_PREFIX, useTextbookTask } from './task-provider';
import { OrderList } from './order-list';

vi.mock('@/hooks/use-t', () => ({ useT: () => (key: string) => key }));
vi.mock('@/providers/language-provider', () => ({
  useLanguage: () => ({ l1: { code: 'en', name: 'English' }, l2: { code: 'zh', name: 'Chinese' } }),
}));
vi.mock('@/components/tokenized-text', () => ({
  TokenizedText: ({ text }: { text: string }) => <span>{text}</span>,
}));

/**
 * D ➋ is the drag list: five topic rows, the first (路线) pinned as the printed worked example,
 * each with a description picker. A drop writes the row's 1-based position into its own blank, so
 * grading is the existing per-blank machinery — and the green/red row after submit is just that
 * blank's result.
 */
beforeEach(() => window.localStorage.clear());

async function renderD2(): Promise<{ book: BookMeta; task: Task; stimulus: OrderListStimulus }> {
  const book = await loadBook('tblt-hsk4');
  const task = book && findTask(book, 'tblt-hsk4.u06.D.t2');
  if (!task || !book) throw new Error('task D ➋ did not resolve');
  const stimulus = task.body.find((entry) => entry.kind === 'orderList');
  if (!stimulus || stimulus.kind !== 'orderList') throw new Error('D ➋ has no orderList');
  render(
    <TextbookTaskProvider task={task} book={book}>
      <OrderList stimulus={stimulus} />
      <Probe />
    </TextbookTaskProvider>,
  );
  await act(async () => {});
  return { book, task, stimulus };
}

let ctx: ReturnType<typeof useTextbookTask> = null;
function Probe() {
  ctx = useTextbookTask();
  return null;
}

const order = () =>
  [...document.querySelectorAll('[data-order-row]')].map((row) => row.getAttribute('data-order-row'));
const handle = (id: string) =>
  document.querySelector(
    `[data-order-row="${id}"] button[aria-label="label.drag_to_reorder"]`,
  ) as HTMLButtonElement | null;
const stored = (task: Task) =>
  JSON.parse(window.localStorage.getItem(TEXTBOOK_STORAGE_PREFIX + task.id) ?? 'null') as {
    responses: Record<string, string>;
  } | null;

describe('the drag list', () => {
  it('renders rows, not a table, and has no header', async () => {
    await renderD2();

    expect(document.querySelectorAll('[data-order-row]')).toHaveLength(5);
    expect(document.body.textContent).not.toContain('顺序');
    expect(document.body.textContent).not.toContain('话题');
    expect(document.body.textContent).not.toContain('描述');
    // The order blanks are internal now: only the five description pickers are blank widgets.
    expect(document.querySelectorAll('button[aria-label]')).toHaveLength(9); // 5 descriptions + 4 handles
    expect(document.querySelector('button[aria-label^="①"]')).toBeNull();
    expect(document.querySelector('button[aria-label^="③"]')).toBeNull();
  });

  it('pins the worked example, which has no drag handle', async () => {
    await renderD2();
    expect(handle('route')).toBeNull();
    expect([...document.querySelectorAll('button[aria-label="label.drag_to_reorder"]')]).toHaveLength(4);
  });

  it('records the starting arrangement as the answer before anything moves', async () => {
    const { task } = await renderD2();
    // Authored order: route(1) · hours(2) · platform(3) · tickets(4) · other(5).
    expect(stored(task)?.responses).toMatchObject({ b1: '1', b3: '2', b5: '3', b7: '4', b9: '5' });
  });

  it('reorders on a drop and rewrites the positions', async () => {
    const { task } = await renderD2();
    const dataTransfer = {
      data: '',
      effectAllowed: '',
      setData(_type: string, value: string) {
        this.data = value;
      },
      getData() {
        return this.data;
      },
    };

    await act(async () => {
      fireEvent.dragStart(handle('tickets')!, { dataTransfer });
      fireEvent.dragOver(document.querySelector('[data-order-row="hours"]')!, { dataTransfer });
      fireEvent.drop(document.querySelector('[data-order-row="hours"]')!, { dataTransfer });
    });

    expect(order()).toEqual(['route', 'tickets', 'hours', 'platform', 'other']);
    expect(stored(task)?.responses).toMatchObject({ b1: '1', b7: '2', b3: '3', b5: '4', b9: '5' });
  });

  it('reorders from the keyboard, so the handle is not drag-only', async () => {
    const { task } = await renderD2();
    await act(async () => {
      fireEvent.keyDown(handle('platform')!, { key: 'ArrowUp' });
    });
    expect(order()).toEqual(['route', 'platform', 'hours', 'tickets', 'other']);
    expect(stored(task)?.responses).toMatchObject({ b5: '2', b3: '3' });
  });

  it('marks each row green or red by whether it sits in the right slot', async () => {
    await renderD2();
    // Authored order answers: hours=4, platform=3, tickets=2, other=5.
    await act(async () => {
      ctx!.store.submit();
    });

    const verdict = (id: string) =>
      document.querySelector(`[data-order-row="${id}"]`)!.getAttribute('data-verdict');
    expect(verdict('route')).toBe('correct'); // the given worked example
    expect(verdict('hours')).toBe('incorrect');
    expect(verdict('platform')).toBe('correct');
    expect(verdict('tickets')).toBe('incorrect');
    expect(verdict('other')).toBe('correct');
  });
});
