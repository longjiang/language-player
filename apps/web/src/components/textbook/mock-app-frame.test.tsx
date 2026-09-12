// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import {
  findTask,
  loadBook,
  type BookMeta,
  type MockAppStimulus,
  type Task,
} from '@langplayer/textbooks';
import { TextbookTaskProvider, useTextbookTask } from './task-provider';
import { MockAppFrame } from './mock-app-frame';

vi.mock('@/hooks/use-t', () => ({ useT: () => (key: string) => key }));
vi.mock('@/providers/language-provider', () => ({
  useLanguage: () => ({ l1: { code: 'en', name: 'English' }, l2: { code: 'zh', name: 'Chinese' } }),
}));
// jsdom has no matchMedia; every case here is the wide container unless it says so.
let wide = true;
vi.mock('@/hooks/use-media-query', () => ({ useMediaQuery: () => wide }));
// The prompts are L2 text and go through the same tokenizer as everything else.
vi.mock('@/components/tokenized-text', () => ({
  TokenizedText: ({ text }: { text: string }) => <span data-tokenized="">{text}</span>,
}));
const toastSuccess = vi.fn();
vi.mock('sonner', () => ({ toast: { success: (m: string) => toastSuccess(m) } }));

/** The task store, so a test can see what Submit and All Done! actually did. */
let store: any;
function StoreProbe() {
  store = useTextbookTask()!.store;
  return null;
}

async function b4(): Promise<{ book: BookMeta; task: Task; stimulus: MockAppStimulus }> {
  const book = await loadBook('tblt-hsk4');
  const found = book && findTask(book, 'tblt-hsk4.u06.B.t4');
  if (!book || !found) throw new Error('task B did not resolve');
  const stimulus = found.body.find((s): s is MockAppStimulus => s.kind === 'mockApp')!;
  return { book, task: found, stimulus };
}

function tree(book: BookMeta, task: Task, stimulus: MockAppStimulus) {
  return (
    <TextbookTaskProvider task={task} book={book}>
      <StoreProbe />
      <MockAppFrame stimulus={stimulus} />
    </TextbookTaskProvider>
  );
}

async function click(el: Element) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

const header = () => document.querySelector('[role="dialog"]')?.textContent ?? '';
const button = (label: string) =>
  [...document.querySelectorAll('button')].find((b) => (b.textContent || '').includes(label));
const named = (label: string) => document.querySelector(`button[aria-label="${label}"]`);

async function open(book: BookMeta, task: Task, stimulus: MockAppStimulus) {
  const view = render(tree(book, task, stimulus));
  await act(async () => {});
  await click(button('action.launch_mini_app')!);
  return view;
}

/** The app's own message, as the frame posts it. */
function fromApp(type: string, payload: Record<string, unknown> = {}) {
  const el = document.querySelector('iframe')!;
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { v: 1, type, payload },
        source: el.contentWindow as unknown as Window,
      }),
    );
  });
}

/** Do a task in the app, the way the real one reports it. */
function doTask(goalId: string, answer: string) {
  fromApp('complete', { goalId, answer });
}

const PROMPTS = [
  '例：选择最快的车次。',
  '选择最便宜的车次。',
  '选择所有“复兴号”车次。（提示：注意“复兴号”标志）',
  '选择票已经卖完了（售罄）的车次。',
  '选择所有有商务座票的车次（不包括候补）。',
  '选择所有现在有卧铺票的车次（一等卧、二等卧、硬卧、软卧等，不包括候补）。',
];

beforeEach(() => {
  toastSuccess.mockClear();
});

describe('the launch button', () => {
  it('is what the task page shows, in place of the app', async () => {
    const { book, task, stimulus } = await b4();
    render(tree(book, task, stimulus));
    await act(async () => {});

    expect(button('action.launch_mini_app')).toBeTruthy();
    expect(document.querySelector('iframe')).toBeNull();
    expect(document.body.textContent).not.toContain('选择最便宜的车次');
  });

  it('is in the server HTML without the frame, which cannot be', async () => {
    const { book, task, stimulus } = await b4();
    const html = renderToString(tree(book, task, stimulus));

    expect(html).toContain('action.launch_mini_app');
    expect(html).not.toContain('<iframe');
  });
});

/**
 * The panel asks one task at a time and resolves one at a time: the student does the task
 * in the app, presses Submit, and is told whether that task is done.
 */
describe('submitting one task', () => {
  it('opens on the first task, with the app in it and a paginator', async () => {
    const { book, task, stimulus } = await b4();
    await open(book, task, stimulus);

    expect(header()).toContain(PROMPTS[0]);
    expect(header()).toContain('1 / 6');
    expect(document.querySelector('iframe')).toBeTruthy();
    expect(button('review.submit')).toBeTruthy();
    // Back has nowhere to go yet; forward waits for a correct Submit.
    expect((named('action.previous') as HTMLButtonElement).disabled).toBe(true);
    expect((named('action.next') as HTMLButtonElement).disabled).toBe(true);
  });

  it('says Incorrect when the task has not been done, and stays on Submit', async () => {
    const { book, task, stimulus } = await b4();
    await open(book, task, stimulus);

    await click(button('review.submit')!);

    expect(header()).toContain('review.answer_incorrect');
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(button('review.submit')).toBeTruthy();
    expect(button('action.next')).toBeUndefined();
  });

  it('is still Incorrect when the stored answer is not the expected one', async () => {
    const { book, task, stimulus } = await b4();
    await open(book, task, stimulus);

    // The app reporting a goal is not enough on its own: the content judges the answer.
    store.setValue('b2', 'G871');
    doTask('cheapest', 'G871');
    await click(button('review.submit')!);

    expect(header()).toContain('review.answer_incorrect');
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('toasts Correct once the app reports the task, and offers Next', async () => {
    const { book, task, stimulus } = await b4();
    await open(book, task, stimulus);

    doTask('fastest', 'G49');
    expect((named('action.next') as HTMLButtonElement).disabled).toBe(true);

    await click(button('review.submit')!);

    expect(toastSuccess).toHaveBeenCalledWith('review.answer_correct');
    expect(header()).not.toContain('review.answer_incorrect');
    expect(button('action.next')).toBeTruthy();
    expect((named('action.next') as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('the paginator', () => {
  it('moves forward a task at a time, and back again', async () => {
    const { book, task, stimulus } = await b4();
    await open(book, task, stimulus);

    doTask('fastest', 'G49');
    await click(button('review.submit')!);
    await click(button('action.next')!);

    expect(header()).toContain(PROMPTS[1]);
    expect(header()).toContain('2 / 6');
    // A fresh task starts unanswered.
    expect(button('review.submit')).toBeTruthy();

    await click(named('action.previous')!);
    expect(header()).toContain(PROMPTS[0]);
    // and a task already answered offers Next, not Submit.
    expect(button('action.next')).toBeTruthy();
  });

  it('skips a task that is already correct', async () => {
    const { book, task, stimulus } = await b4();
    await open(book, task, stimulus);

    doTask('fastest', 'G49');
    await click(button('review.submit')!);
    await click(button('action.next')!);
    doTask('cheapest', 'K1275');
    await click(button('review.submit')!);
    // Back to 1, then forward: 2 is done, so Next must land on 3.
    await click(named('action.previous')!);
    await click(button('action.next')!);

    expect(header()).toContain(PROMPTS[2]);
  });
});

describe('the last task', () => {
  it('turns Submit into All Done!, which grades the task and closes the panel', async () => {
    const { book, task, stimulus } = await b4();
    await open(book, task, stimulus);

    const firstFive: [string, string][] = [
      ['fastest', 'G49'],
      ['cheapest', 'K1275'],
      ['fuxing', 'G875、G49、D17、D11'],
      ['sold-out', 'Z281'],
      ['business', 'G871、G875'],
    ];
    for (const [goalId, answer] of firstFive) {
      doTask(goalId, answer);
      await click(button('review.submit')!);
      await click(button('action.next')!);
    }
    expect(header()).toContain(PROMPTS[5]);
    expect(button('review.submit')).toBeTruthy();

    doTask('sleeper', 'D17、D11');
    await click(button('review.submit')!);
    expect(button('msg.all_done')).toBeTruthy();

    await click(button('msg.all_done')!);

    // The whole task is graded and the attempt recorded: that is what marks it complete.
    expect(store.isSubmitted()).toBe(true);
    expect(store.getResult()?.complete).toBe(true);
    expect(store.getResult()?.correctCount).toBe(5);
    // and the panel is out of the way so the result banner can be read.
    expect(header()).toBe('');
  });

  it('does not offer All Done! on an earlier task', async () => {
    const { book, task, stimulus } = await b4();
    await open(book, task, stimulus);

    doTask('fastest', 'G49');
    await click(button('review.submit')!);

    expect(button('action.next')).toBeTruthy();
    expect(button('msg.all_done')).toBeUndefined();
  });
});

describe('the toolbar', () => {
  it('names the icon-only dictionary toggle, and labels Hint', async () => {
    const { book, task, stimulus } = await b4();
    await open(book, task, stimulus);

    const dictionary = named('label.enable_popup_dictionary')!;
    expect(dictionary.querySelector('svg')).toBeTruthy();
    // Icon-only: the label lives in the accessible name, not in the row.
    expect(dictionary.textContent).toBe('');

    const hint = button('action.hint')!;
    expect(hint.querySelector('svg')).toBeTruthy();
    expect(hint.textContent).toBe('action.hint');
  });
});

describe('the container', () => {
  it('is a bottom sheet on a narrow screen', async () => {
    const { book, task, stimulus } = await b4();
    wide = false;
    try {
      await open(book, task, stimulus);
      const panel = document.querySelector('[role="dialog"]')!;
      expect(panel.className).toContain('bottom-0');
      expect(panel.className).not.toContain('-translate-y-1/2');
    } finally {
      wide = true;
    }
  });

  it('keeps the student where they were when it is reopened', async () => {
    const { book, task, stimulus } = await b4();
    await open(book, task, stimulus);

    doTask('fastest', 'G49');
    await click(button('review.submit')!);
    await click(button('action.next')!);
    expect(header()).toContain(PROMPTS[1]);

    await click(named('action.close')!);
    await click(button('action.launch_mini_app')!);
    // The app restarts and reports done: [], which must not undo the progress.
    fromApp('progress', { done: [], total: 6 });

    expect(header()).toContain(PROMPTS[1]);
  });
});
