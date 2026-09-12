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

/** The task store, so a test can see what a selection wrote and what All Done! graded. */
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

const panel = () => document.querySelector('[role="dialog"]');
const header = () => panel()?.textContent ?? '';
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

/** Selecting in the app: the host is told what is ticked, and writes it into the blank. */
function select(goalId: string, picks: string[]) {
  fromApp('selection', { goalId, picks });
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

describe('the panel', () => {
  it('puts the close button alone on top, and the task above the controls', async () => {
    const { book, task, stimulus } = await b4();
    await open(book, task, stimulus);

    const close = named('action.close')!;
    const frame = document.querySelector('iframe')!;
    const title = panel()!.querySelector('h2')!;

    // Document order is the layout: close, then the app, then the task and its controls.
    expect(close.compareDocumentPosition(frame) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(frame.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The top bar has no rule under it any more — it separates nothing.
    expect((panel()!.firstElementChild as HTMLElement).className).not.toContain('border-b');
    expect(header()).toContain(PROMPTS[0]);
    expect(header()).toContain('1 / 6');
  });
});

/**
 * Selecting is the interaction: a tap selects, another unselects, and the selection *is*
 * the answer — the host writes it into the blank and the content grades it on Submit.
 */
describe('submitting one task', () => {
  it('says Incorrect when nothing is selected, and stays on Submit', async () => {
    const { book, task, stimulus } = await b4();
    await open(book, task, stimulus);

    await click(button('review.submit')!);

    expect(header()).toContain('review.answer_incorrect');
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(button('review.submit')).toBeTruthy();
    expect(button('action.next')).toBeUndefined();
  });

  it('says Incorrect for a selection the task does not name', async () => {
    const { book, task, stimulus } = await b4();
    await open(book, task, stimulus);

    // D17 is a real train and a real selection — just not the fastest one.
    select('fastest', ['D17']);
    await click(button('review.submit')!);

    expect(header()).toContain('review.answer_incorrect');
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('writes the selection into the blank, and clears it on unselect', async () => {
    const { book, task, stimulus } = await b4();
    await open(book, task, stimulus);

    select('fastest', ['G49', 'D17']);
    expect(store.getValue('b1')).toBe('G49'); // ① is `given`: pre-filled and not writable

    // ② is a real blank, so a selection and its removal are both visible there.
    select('cheapest', ['K1275', 'D11']);
    expect(store.getValue('b2')).toBe('K1275、D11');
    select('cheapest', ['D11']);
    expect(store.getValue('b2')).toBe('D11');
    select('cheapest', []);
    expect(store.getValue('b2')).toBe('');
  });

  it('toasts Correct once the selection is the expected answer, and offers Next', async () => {
    const { book, task, stimulus } = await b4();
    await open(book, task, stimulus);

    select('fastest', ['G49']);
    await click(button('review.submit')!);

    expect(toastSuccess).toHaveBeenCalledWith('review.answer_correct');
    expect(header()).not.toContain('review.answer_incorrect');
    expect(button('action.next')).toBeTruthy();
    expect((named('action.next') as HTMLButtonElement).disabled).toBe(false);
  });

  it('takes a set task only as a whole set', async () => {
    const { book, task, stimulus } = await b4();
    await open(book, task, stimulus);

    // Onto task ③, which asks for every 复兴号.
    select('fastest', ['G49']);
    await click(button('review.submit')!);
    await click(button('action.next')!);
    select('cheapest', ['K1275']);
    await click(button('review.submit')!);
    await click(button('action.next')!);
    expect(header()).toContain(PROMPTS[2]);

    select('fuxing', ['G875', 'G49']);
    await click(button('review.submit')!);
    expect(header()).toContain('review.answer_incorrect');

    select('fuxing', ['G875', 'G49', 'D17', 'D11']);
    await click(button('review.submit')!);
    expect(header()).not.toContain('review.answer_incorrect');
    expect(button('action.next')).toBeTruthy();
  });
});

describe('telling the app which task it is on', () => {
  /** The host's own messages to the frame, which is where `focus` goes. */
  function captureFocus() {
    const el = document.querySelector('iframe')!;
    const sent: any[] = [];
    (el.contentWindow as unknown as { postMessage: (m: unknown) => void }).postMessage = (m) =>
      sent.push(m);
    return sent;
  }

  it('carries the task and its stored picks, so a task comes back as it was answered', async () => {
    const { book, task, stimulus } = await b4();
    await open(book, task, stimulus);

    select('fastest', ['G49']);
    await click(button('review.submit')!);
    await click(button('action.next')!);
    select('cheapest', ['K1275']);

    const sent = captureFocus();
    await click(named('action.previous')!);
    const focus = sent.filter((m) => m && m.type === 'focus');

    expect(focus.length).toBeGreaterThan(0);
    // ① is a `given` worked example: its answer is pre-filled for the final grade, but it is
    // not the student's selection, so nothing is restored and they still do the example.
    expect(focus.at(-1).payload).toEqual({ goalId: 'fastest', picks: [] });
  });

  it('hands back what was answered for a task the student returns to', async () => {
    const { book, task, stimulus } = await b4();
    await open(book, task, stimulus);

    select('fastest', ['G49']);
    await click(button('review.submit')!);
    await click(button('action.next')!);
    select('cheapest', ['K1275']);
    await click(button('review.submit')!);
    await click(button('action.next')!);

    const sent = captureFocus();
    await click(named('action.previous')!);
    const focus = sent.filter((m) => m && m.type === 'focus');

    expect(focus.at(-1).payload).toEqual({ goalId: 'cheapest', picks: ['K1275'] });
  });
});

describe('the paginator', () => {
  it('moves forward a task at a time, and back again', async () => {
    const { book, task, stimulus } = await b4();
    await open(book, task, stimulus);

    select('fastest', ['G49']);
    await click(button('review.submit')!);
    await click(button('action.next')!);

    expect(header()).toContain(PROMPTS[1]);
    expect(header()).toContain('2 / 6');
    expect(button('review.submit')).toBeTruthy();

    await click(named('action.previous')!);
    expect(header()).toContain(PROMPTS[0]);
    expect(button('action.next')).toBeTruthy();
  });

  it('skips a task that is already correct', async () => {
    const { book, task, stimulus } = await b4();
    await open(book, task, stimulus);

    select('fastest', ['G49']);
    await click(button('review.submit')!);
    await click(button('action.next')!);
    select('cheapest', ['K1275']);
    await click(button('review.submit')!);
    // Back to 1, then forward: 2 is done, so Next must land on 3.
    await click(named('action.previous')!);
    await click(button('action.next')!);

    expect(header()).toContain(PROMPTS[2]);
  });
});

describe('the last task', () => {
  const firstFive: [string, string[]][] = [
    ['fastest', ['G49']],
    ['cheapest', ['K1275']],
    ['fuxing', ['G875', 'G49', 'D17', 'D11']],
    ['sold-out', ['Z281']],
    ['business', ['G871', 'G875']],
  ];

  it('turns Submit into All Done!, which grades the task and closes the panel', async () => {
    const { book, task, stimulus } = await b4();
    await open(book, task, stimulus);

    for (const [goalId, picks] of firstFive) {
      select(goalId, picks);
      await click(button('review.submit')!);
      await click(button('action.next')!);
    }
    expect(header()).toContain(PROMPTS[5]);
    expect(button('review.submit')).toBeTruthy();

    select('sleeper', ['D17', 'D11']);
    await click(button('review.submit')!);
    expect(button('msg.all_done')).toBeTruthy();

    await click(button('msg.all_done')!);

    // The whole task is graded and the attempt recorded: that is what marks it complete.
    expect(store.isSubmitted()).toBe(true);
    expect(store.getResult()?.complete).toBe(true);
    expect(store.getResult()?.correctCount).toBe(5);
    expect(header()).toBe('');
  });

  it('does not offer All Done! on an earlier task', async () => {
    const { book, task, stimulus } = await b4();
    await open(book, task, stimulus);

    select('fastest', ['G49']);
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
      const el = panel()!;
      expect(el.className).toContain('bottom-0');
      expect(el.className).not.toContain('-translate-y-1/2');
    } finally {
      wide = true;
    }
  });

  it('keeps the student where they were when it is reopened', async () => {
    const { book, task, stimulus } = await b4();
    await open(book, task, stimulus);

    select('fastest', ['G49']);
    await click(button('review.submit')!);
    await click(button('action.next')!);
    expect(header()).toContain(PROMPTS[1]);

    await click(named('action.close')!);
    await click(button('action.launch_mini_app')!);

    expect(header()).toContain(PROMPTS[1]);
    // The reopened task arrives holding what was answered for it.
    expect(store.getValue('b1')).toBe('G49');
  });
});
