// @vitest-environment jsdom
/**
 * Multi-turn context regression tests for the DeepSeek chat card (SPEC-035).
 *
 * "Ask AI loses context" is only ever one of two things: the client did not
 * send the prior conversation with the follow-up, or the server dropped it.
 * These tests pin down the client half by asserting the EXACT body `POST
 * /chatgpt/stream` receives — the transcript is what the model sees, and every
 * follow-up must carry the opening word request (which names the word and its
 * sentence) plus every earlier exchange.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, fireEvent, screen } from '@testing-library/react';

vi.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { id: '1' } } }) }));
vi.mock('@/providers/language-provider', () => ({
  useLanguage: () => ({
    l1: { code: 'zh-Hans', name: 'Chinese' },
    l2: { code: 'ja', name: 'Japanese' },
  }),
}));
vi.mock('@/providers/subscription-provider', () => ({
  useSubscriptionContext: () => ({ isPro: true, loaded: true }),
}));
vi.mock('@/providers/settings-provider', () => ({
  useSettingsContext: () => ({
    getL2: () => ({ display: { translation: false } }),
  }),
}));

// `t` resolves the real zh-Hans messages (nested next-intl JSON) so the prompt
// builders receive their real templates and the assertions can see that the
// word/context actually reached the model. Placeholders are interpolated the
// same way next-intl does it.
const messages = vi.hoisted(() => {
  const data = require('../../../../packages/shared/locales/zh-Hans.json');
  const lookup = (key: string): string => {
    const parts = key.split('.');
    let cursor: any = data;
    for (const part of parts) {
      if (cursor == null || typeof cursor !== 'object') return key;
      cursor = cursor[part];
    }
    return typeof cursor === 'string' ? cursor : key;
  };
  return { lookup };
});

vi.mock('@/hooks/use-t', () => ({
  useT: () => (key: string, values?: Record<string, unknown>) => {
    let out = messages.lookup(key);
    if (!values) return out;
    for (const [name, value] of Object.entries(values)) {
      out = out.split(`{${name}}`).join(String(value));
    }
    return out;
  },
}));

// Markdown rendering pulls in the whole tokenizer pipeline; the transcript is
// what matters here, not its formatting.
vi.mock('@/components/markdown-explanation', () => ({
  MarkdownExplanation: ({ text }: { text: string }) => <div data-testid="reply">{text}</div>,
}));
vi.mock('@/hooks/use-subtitle-translation', () => ({
  useSubtitleTranslation: () => ({ translatedLines: [], loading: false }),
}));
vi.mock('@/components/video/subs-search-row', () => ({ SubsSearchRow: () => null }));
vi.mock('@/components/video/subs-search-playback-modal', () => ({
  SubsSearchPlaybackModal: () => null,
}));

import { AiExplanation } from './ai-explanation';
import { DEFAULT_AI_FOLLOW_UPS } from '@langplayer/utils';
import { createApiClient } from '@langplayer/api-client';

// The streaming hook resolves its URL from the singleton API client, which the
// app initializes at startup (`api-client-provider`).
createApiClient({ baseURL: 'http://127.0.0.1:5001' });

const INITIAL_REPLY =
  '加わる在句中意为“加入、参与”，这里指“几乎不参与日常会话”。发音：くわわる。';

/** Build an SSE body the streaming hook can consume. */
function sse(text: string): string {
  const chunks = text.match(/[\s\S]{1,12}/g) ?? [];
  return (
    chunks.map((chunk) => `data: ${JSON.stringify({ t: chunk })}\n\n`).join('') +
    'data: [DONE]\n\n'
  );
}

interface CapturedRequest {
  url: string;
  body: { prompt: string; messages?: { role: string; content: string }[]; regenerate?: boolean };
}

let requests: CapturedRequest[] = [];

beforeEach(() => {
  requests = [];
  window.localStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      requests.push({ url: String(url), body });
      return new Response(sse(INITIAL_REPLY), {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderCard(props: Partial<React.ComponentProps<typeof AiExplanation>> = {}) {
  return render(
    <AiExplanation
      word="加わる"
      contextText="彼は最近、部活の練習に加わらないようになった。"
      entryFound
      followUpPresets={[]}
      {...props}
    />,
  );
}

/** Open the card and wait for the single-turn initial explanation to land. */
async function openCard() {
  fireEvent.click(screen.getByText('让 DeepSeek 解释'));
  await waitFor(() => expect(requests.length).toBe(1));
  await waitFor(() => expect(screen.getByTestId('reply').textContent).toBe(INITIAL_REPLY));
}

async function sendFollowUp(text: string, expectedCount: number) {
  const input = document.querySelector('form input') as HTMLInputElement | null;
  expect(input, 'free-form follow-up input must render').toBeTruthy();
  fireEvent.change(input!, { target: { value: text } });
  fireEvent.submit(input!.closest('form')!);
  await waitFor(() => expect(requests.length).toBe(expectedCount));
  const sent = requests[expectedCount - 1]!;
  // Let the streamed reply settle so the next turn starts from a quiet state.
  await waitFor(() => expect(input!.disabled).toBe(false));
  return sent;
}

describe('AiExplanation multi-turn context', () => {
  it('sends the opening word request and reply with a free-form follow-up', async () => {
    renderCard();
    await openCard();
    // The initial explanation is single-turn (keeps the md5(prompt) cache path).
    expect(requests[0]!.body.messages).toBeUndefined();

    const followUp = await sendFollowUp('请帮我区分容易混淆的词', 2);

    expect(followUp.body.prompt).toBe('请帮我区分容易混淆的词');
    expect(followUp.body.messages, 'follow-up must carry the prior turns').toBeDefined();
    expect(followUp.body.messages!.map((m) => m.role)).toEqual(['user', 'assistant']);
    // The opening request is what grounds the model in the word being studied.
    expect(followUp.body.messages![0]!.content).toContain('加わる');
    expect(followUp.body.messages![0]!.content).toContain(
      '彼は最近、部活の練習に加わらないようになった',
    );
    expect(followUp.body.messages![1]!.content).toBe(INITIAL_REPLY);
  });

  it('keeps the original word request after several free-form turns', async () => {
    renderCard();
    await openCard();

    const second = await sendFollowUp('请帮我区分容易混淆的词', 2);
    const third = await sendFollowUp('再举一个例子', 3);

    expect(second.body.messages).toHaveLength(2);
    expect(third.body.messages).toHaveLength(4);
    expect(third.body.messages![0]!.content).toContain('加わる');
    expect(third.body.messages!.map((m) => m.role)).toEqual([
      'user',
      'assistant',
      'user',
      'assistant',
    ]);
  });

  it('sends the word context with a preset follow-up', async () => {
    renderCard({ followUpPresets: DEFAULT_AI_FOLLOW_UPS });
    await openCard();

    fireEvent.click(screen.getByText('屈折变化'));
    await waitFor(() => expect(requests.length).toBe(2));

    const presetRequest = requests[1]!;
    expect(presetRequest.body.messages!.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(presetRequest.body.messages![0]!.content).toContain('加わる');
  });
});

describe('AiExplanation restored session (storageKey)', () => {
  // A transcript saved by an earlier visit keeps only role/text/label (SPEC-035
  // storage note: a content-carrying prompt would blow the localStorage quota).
  // The follow-up therefore sends a fabricated user turn — the assistant's own
  // reply — instead of the opening request. This test CHARACTERIZES that known
  // leak; the fix (persist a compact prompt) must flip these expectations.
  it('sends the assistant reply as the user turn when the session was restored', async () => {
    window.localStorage.setItem(
      'lp-ask-ai:test',
      JSON.stringify([
        { role: 'assistant', text: INITIAL_REPLY },
        { role: 'user', text: '请帮我区分容易混淆的词', label: '请帮我区分容易混淆的词' },
        { role: 'assistant', text: '你还没有告诉我具体要区分哪组词。' },
      ]),
    );

    renderCard({ storageKey: 'lp-ask-ai:test', demandMode: true });
    await waitFor(() => expect(screen.getAllByTestId('reply')).toHaveLength(2));

    const input = document.querySelector('form input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '再举一个例子' } });
    fireEvent.submit(input.closest('form')!);
    await waitFor(() => expect(requests.length).toBe(1));

    const sent = requests[0]!.body.messages!;
    expect(sent.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    // The opening turn is the reply itself — the request that produced it is gone.
    expect(sent[0]!.content).toBe(INITIAL_REPLY);
    expect(sent[1]!.content).toBe(INITIAL_REPLY);
  });
});
