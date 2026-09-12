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
// The prompts are L2 text and go through the same tokenizer as everything else;
// its own tests cover the tokenizing, so this asserts the questions are there.
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

const questions = () =>
  [...document.querySelectorAll('ol > li')].map((li) => ({
    text: li.textContent,
    struck: li.querySelector('.line-through') !== null,
    checked: li.querySelector('svg') !== null,
  }));

const PROMPTS = [
  '①哪次列车最快？',
  '②哪次列车最便宜？',
  '③哪些列车是“复兴号”？',
  '④哪次列车的票已经卖完了（售罄）？',
  '⑤哪些列车有商务座（不包括候补）？',
  '⑥哪次列车有卧铺票（一等卧、二等卧、硬卧、软卧等，但不包括候补）？',
];

/**
 * B ➍'s six questions.
 *
 * The app renders a 12306 screen and nothing else, so the questions have to come
 * from the host. They did not: `goal.prompt` was rendered only inside the
 * `status === 'failed'` branch, so a working app showed the student a screen, a
 * `1 / 6` counter and no questions at all.
 */
describe('B ➍’s six questions', () => {
  it('are all printed while the app is still loading', async () => {
    const { book, task, stimulus } = await b4();
    render(tree(book, task, stimulus));
    await act(async () => {});

    expect(questions().map((q) => q.text)).toEqual(PROMPTS);
  });

  it('are printed in the server HTML, where the frame is not', async () => {
    const { book, task, stimulus } = await b4();
    const html = renderToString(tree(book, task, stimulus));

    expect(html).toContain('哪次列车最快？');
    // The frame must not be in the server HTML: rendered there it starts loading
    // while the client bundle is still arriving and can finish its whole
    // handshake before this component has a listener — measured at 111ms in the
    // real page. Rendering it after mount is what closes that window.
    expect(html).not.toContain('<iframe');
  });

  it('render one question per content goal, numbered as the app numbers them', async () => {
    const { book, task, stimulus } = await b4();
    render(tree(book, task, stimulus));
    await act(async () => {});

    expect(questions()).toHaveLength(stimulus.goals.length);
    expect(questions().some((q) => q.struck)).toBe(false);
  });
});

describe('a goal the app reports', () => {
  it('is struck out, and only the one that was reported', async () => {
    const { book, task, stimulus } = await b4();
    render(tree(book, task, stimulus));
    await act(async () => {});

    fromApp('progress', { done: ['fastest'], total: 6 });
    expect(questions()[0]).toMatchObject({ struck: true, checked: true });
    expect(questions()[1]).toMatchObject({ struck: false, checked: false });

    fromApp('progress', { done: ['fastest', 'fuxing'], total: 6 });
    expect(questions()[0]).toMatchObject({ struck: true, checked: true });
    expect(questions()[2]).toMatchObject({ struck: true, checked: true });
    expect(questions()[1]).toMatchObject({ struck: false, checked: false });
  });

  it('leaves the questions visible when the app also reports its answer', async () => {
    const { book, task, stimulus } = await b4();
    render(tree(book, task, stimulus));
    await act(async () => {});

    fromApp('ready', { app: 'railway-12306', version: '1', goals: stimulus.goals });
    fromApp('complete', { goalId: 'fastest', answer: 'G49' });

    expect(questions()).toHaveLength(6);
    expect(questions()[0]).toMatchObject({ struck: true, checked: true });
  });
});
