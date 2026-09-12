// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import {
  findTask,
  loadBook,
  type BookMeta,
  type MockAppStimulus,
  type Task,
} from '@langplayer/textbooks';
import { TextbookTaskProvider } from './task-provider';
import { MockAppFrame } from './mock-app-frame';

vi.mock('@/hooks/use-t', () => ({ useT: () => (key: string) => key }));
vi.mock('@/providers/language-provider', () => ({
  useLanguage: () => ({ l1: { code: 'en', name: 'English' }, l2: { code: 'zh', name: 'Chinese' } }),
}));
// jsdom has no matchMedia; every case here is the wide container unless it says so.
let wide = true;
vi.mock('@/hooks/use-media-query', () => ({ useMediaQuery: () => wide }));
// The prompts are L2 text and go through the same tokenizer as everything else;
// its own tests cover the tokenizing, so this asserts the tasks are there.
vi.mock('@/components/tokenized-text', () => ({
  TokenizedText: ({ text }: { text: string }) => <span data-tokenized="">{text}</span>,
}));

async function b4(): Promise<{ book: BookMeta; task: Task; stimulus: MockAppStimulus }> {
  const book = await loadBook('tblt-hsk4');
  const found = book && findTask(book, 'tblt-hsk4.u06.B.t4');
  if (!book || !found) throw new Error('task B ➍ did not resolve');
  const stimulus = found.body.find((s): s is MockAppStimulus => s.kind === 'mockApp')!;
  return { book, task: found, stimulus };
}

function tree(book: BookMeta, task: Task, stimulus: MockAppStimulus) {
  return (
    <TextbookTaskProvider task={task} book={book}>
      <MockAppFrame stimulus={stimulus} />
    </TextbookTaskProvider>
  );
}

async function open(book: BookMeta, task: Task, stimulus: MockAppStimulus) {
  const view = render(tree(book, task, stimulus));
  await act(async () => {});
  const launch = [...document.querySelectorAll('button')].find((b) =>
    (b.textContent || '').includes('action.launch_mini_app'),
  )!;
  await act(async () => {
    launch.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
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

const header = () => document.querySelector('[role="dialog"]')?.textContent ?? '';
const button = (label: string) =>
  [...document.querySelectorAll('button')].find((b) => (b.textContent || '').includes(label));

const PROMPTS = [
  '①例：选择最快的车次。',
  '②选择最便宜的车次。',
  '③选择所有“复兴号”车次。（提示：注意“复兴号”标志）',
  '④选择票已经卖完了（售罄）的车次。',
  '⑤选择所有有商务座票的车次（不包括候补）。',
  '⑥选择所有现在有卧铺票的车次（一等卧、二等卧、硬卧、软卧等，不包括候补）。',
];

/**
 * The app is behind a launch button, and the six tasks are asked one at a time in the
 * panel's header. Before this the app was embedded in the page and the header showed
 * nothing, so a working app gave the student a train list and no idea what to do.
 */
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
    // A frame in the server HTML starts loading while the client bundle is still
    // arriving and can finish its whole handshake before this component has a
    // listener — measured at 111ms in the real page.
    expect(html).not.toContain('<iframe');
  });
});

describe('the panel', () => {
  it('opens on the first task, with the app in it', async () => {
    const { book, task, stimulus } = await b4();
    await open(book, task, stimulus);

    expect(header()).toContain(PROMPTS[0]);
    expect(document.querySelector('iframe')).toBeTruthy();
  });

  it('shows one task at a time, and offers Next only once it is done', async () => {
    const { book, task, stimulus } = await b4();
    await open(book, task, stimulus);

    expect(button('action.next')).toBeUndefined();
    expect(header()).not.toContain(PROMPTS[1]);

    fromApp('complete', { goalId: 'fastest', answer: 'G49' });
    expect(button('action.next')).toBeTruthy();

    // It stays on the finished task until Next is pressed — that is the point of the
    // button: the student decides when to move on.
    expect(header()).toContain(PROMPTS[0]);

    await act(async () => {
      button('action.next')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(header()).toContain(PROMPTS[1]);
    expect(button('action.next')).toBeUndefined();
  });

  it('skips a task that is already done when Next is pressed', async () => {
    const { book, task, stimulus } = await b4();
    await open(book, task, stimulus);

    // ① and ② answered, but the header is still on ①: Next must land on ③.
    fromApp('complete', { goalId: 'fastest', answer: 'G49' });
    fromApp('complete', { goalId: 'cheapest', answer: 'K1275' });
    await act(async () => {
      button('action.next')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(header()).toContain(PROMPTS[2]);
  });

  it('says All Done! when every task is answered, and closes the panel', async () => {
    const { book, task, stimulus } = await b4();
    await open(book, task, stimulus);

    for (const goal of stimulus.goals) {
      fromApp('complete', { goalId: goal.id, answer: 'x' });
    }
    expect(button('msg.all_done')).toBeTruthy();

    await act(async () => {
      button('msg.all_done')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(header()).toBe('');
  });

  it('carries help mode and hint in its toolbar, each with an icon', async () => {
    const { book, task, stimulus } = await b4();
    await open(book, task, stimulus);

    for (const label of ['label.enable_popup_dictionary', 'action.hint']) {
      const control = button(label)!;
      expect(control).toBeTruthy();
      expect(control.querySelector('svg')).toBeTruthy();
    }
    // The launch button names itself with an icon too.
    expect(button('action.launch_mini_app')!.querySelector('svg')).toBeTruthy();
  });

  it('is a bottom sheet on a narrow screen', async () => {
    const { book, task, stimulus } = await b4();
    wide = false;
    try {
      await open(book, task, stimulus);
      const panel = document.querySelector('[role="dialog"]')!;
      // SPEC-052's sheet positions itself against the bottom edge; the centered modal
      // is translated to the middle of the viewport.
      expect(panel.className).toContain('bottom-0');
      expect(panel.className).not.toContain('-translate-y-1/2');
    } finally {
      wide = true;
    }
  });
});

describe('a reopened panel', () => {
  it('does not take the student back to the first task', async () => {
    const { book, task, stimulus } = await b4();
    await open(book, task, stimulus);

    fromApp('complete', { goalId: 'fastest', answer: 'G49' });
    fromApp('complete', { goalId: 'cheapest', answer: 'K1275' });
    await act(async () => {
      button('action.next')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(header()).toContain(PROMPTS[2]);

    // Closing unmounts the frame; reopening mounts a fresh one, which reports
    // `done: []` before its own state exists again.
    await act(async () => {
      // The close control is icon-only, so it is named by its label.
      document
        .querySelector('button[aria-label="action.close"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      button('action.launch_mini_app')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    fromApp('progress', { done: [], total: 6 });

    expect(header()).toContain(PROMPTS[2]);
    expect(button('msg.all_done')).toBeUndefined();
  });
});
