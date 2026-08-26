import { describe, expect, it, vi } from 'vitest';
import { SrsTestManager, type SrsTestCacheStorage, type SrsTestGenerationInput, type SrsTestTransport } from './srs-test-manager';
import type { SrsTestQuestion, TestQuestionKind } from './srs-test-mode';

const sleep = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));

function makeResponse(kind: TestQuestionKind): string {
  return JSON.stringify({
    kind,
    question: kind === 'definition' ? 'What does this word mean?' : 'How is this word pronounced?',
    correct_answer: 'answer',
    confounders: ['one', 'two', 'three'],
  });
}

function input(kind: TestQuestionKind, wordForm = 'word'): SrsTestGenerationInput {
  return { kind, wordForm, context: 'context sentence', l1Code: 'en', l2Code: 'es' };
}

/** Pronunciation input needs a ground-truth reading (the app owns the correct answer). */
function pronunciationInput(wordForm = 'word'): SrsTestGenerationInput {
  return { kind: 'pronunciation', wordForm, context: 'context sentence', l1Code: 'en', l2Code: 'ja', pronunciation: 'おしきる' };
}

/** Transport whose calls are held open until each is resolved in order. */
function deferredTransport() {
  const calls: Array<{ prompt: string; resolve: (value: string) => void }> = [];
  return {
    calls,
    async generate(prompt: string) {
      return new Promise<string>((resolve) => {
        calls.push({ prompt, resolve });
      });
    },
  };
}

function recordingTransport(handler?: (prompt: string) => Promise<string>) {
  const calls: string[] = [];
  const transport: SrsTestTransport = {
    async generate(prompt: string) {
      calls.push(prompt);
      if (handler) return handler(prompt);
      const kind: TestQuestionKind = prompt.includes('tests the pronunciation of')
        ? 'pronunciation'
        : 'definition';
      return makeResponse(kind);
    },
  };
  return { transport, calls };
}

describe('SrsTestManager cache', () => {
  it('returns a cached question without calling the transport again', async () => {
    const { transport, calls } = recordingTransport();
    const manager = new SrsTestManager(transport);
    const first = await manager.requestTest({ cardKey: 'k', priority: 'current', input: input('definition') });
    expect(first).toMatchObject({ ok: true, fromCache: false });
    expect(calls).toHaveLength(1);

    const second = await manager.requestTest({ cardKey: 'k', priority: 'current', input: input('definition') });
    expect(second).toMatchObject({ ok: true, fromCache: true });
    expect(calls).toHaveLength(1);
  });

  it('distinguishes test kinds within one card', async () => {
    const { transport, calls } = recordingTransport();
    const manager = new SrsTestManager(transport);
    await manager.requestTest({ cardKey: 'k', priority: 'current', input: input('definition') });
    await manager.requestTest({ cardKey: 'k', priority: 'current', input: pronunciationInput() });
    expect(calls).toHaveLength(2);
  });

  it('pronunciation: keeps the app-supplied reading as the correct answer, distractor-only', async () => {
    const { transport } = recordingTransport();
    const manager = new SrsTestManager(transport);
    const res = await manager.requestTest({
      cardKey: 'k',
      priority: 'current',
      input: pronunciationInput('反る'),
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // The correct answer is the ground-truth reading, never the model's guess.
    expect(res.question.correctAnswer).toBe('おしきる');
    // The question text is deterministic (app-owned), not an LLM string.
    expect(res.question.prompt).toBe('How is "反る" pronounced?');
    // The 4 choices include the correct answer plus the 3 LLM confounders.
    expect(res.question.choices).toContain('おしきる');
    expect(res.question.choices).toHaveLength(4);
  });

  it('pronunciation: model supplies the correct answer when no kana ground truth exists', async () => {
    const { transport } = recordingTransport(async () => JSON.stringify({
      kind: 'pronunciation',
      correct_answer: 'はがいじめ',
      confounders: ['はねまじりじめ', 'はねこういしめ', 'はがいたい'],
    }));
    const manager = new SrsTestManager(transport);
    const res = await manager.requestTest({
      cardKey: 'k',
      priority: 'current',
      input: { kind: 'pronunciation', wordForm: '羽交い締め', context: '後ろから羽交い締めにされ…', l1Code: 'en', l2Code: 'ja' },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // Without a ground-truth kana reading, the model's own correct_answer is used
    // so the word still gets a pronunciation question.
    expect(res.question.correctAnswer).toBe('はがいじめ');
    expect(res.question.prompt).toBe('How is "羽交い締め" pronounced?');
    expect(res.question.choices).toHaveLength(4);
  });

  it('regenerate bypasses the cache', async () => {
    const { transport, calls } = recordingTransport();
    const manager = new SrsTestManager(transport);
    await manager.requestTest({ cardKey: 'k', priority: 'current', input: input('definition') });
    const second = await manager.requestTest({
      cardKey: 'k',
      priority: 'user',
      input: { ...input('definition'), regenerate: true },
    });
    expect(second).toMatchObject({ ok: true, fromCache: false });
    expect(calls).toHaveLength(2);
  });

  it('hydrates persisted entries from storage and saves new ones', async () => {
    const cachedQuestion: SrsTestQuestion = {
      kind: 'definition',
      prompt: 'cached question?',
      choices: ['a', 'b', 'c', 'd'],
      correctAnswer: 'a',
    };
    // Cache key format: `${cardKey}:${kind}:${md5(wordForm|context).slice(0,8)}`.
    const seededKey = 'k:definition:fe5b5455';
    const saved: Record<string, SrsTestQuestion> = { [seededKey]: cachedQuestion };
    const storage: SrsTestCacheStorage = {
      load: () => saved,
      save: vi.fn((entries: Record<string, SrsTestQuestion>) => {
        Object.assign(saved, entries);
      }),
    };
    const { transport, calls } = recordingTransport();
    const manager = new SrsTestManager(transport, { storage });

    const hit = await manager.requestTest({ cardKey: 'k', priority: 'current', input: input('definition') });
    expect(hit).toMatchObject({ ok: true, fromCache: true });
    expect((hit as { question: SrsTestQuestion }).question.prompt).toBe('cached question?');
    expect(calls).toHaveLength(0);

    await manager.requestTest({ cardKey: 'k2', priority: 'current', input: input('definition') });
    await sleep(350); // cache persistence is debounced
    expect(storage.save).toHaveBeenCalled();
    expect(saved['k2:definition:fe5b5455']).toBeDefined();
  });
});

describe('SrsTestManager queue', () => {
  it('never calls the transport concurrently', async () => {
    let active = 0;
    let maxActive = 0;
    const transport: SrsTestTransport = {
      async generate() {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await sleep(10);
        active -= 1;
        return makeResponse('definition');
      },
    };
    const manager = new SrsTestManager(transport);
    const requests = ['a', 'b', 'c'].map((cardKey) =>
      manager.requestTest({ cardKey, priority: 'current', input: input('definition') }),
    );
    const results = await Promise.all(requests);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(maxActive).toBe(1);
  });

  it('dedupes identical queued requests into one transport call', async () => {
    const t = deferredTransport();
    const manager = new SrsTestManager(t);
    const p1 = manager.requestTest({ cardKey: 'k', priority: 'current', input: input('definition') });
    const p2 = manager.requestTest({ cardKey: 'k', priority: 'current', input: input('definition') });
    await sleep();
    expect(t.calls).toHaveLength(1);
    t.calls[0]!.resolve(makeResponse('definition'));
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toMatchObject({ ok: true });
    expect(r2).toMatchObject({ ok: true });
    expect(t.calls).toHaveLength(1);
  });

  it('runs user > current > prefetch once the queue is stable', async () => {
    const t = deferredTransport();
    const manager = new SrsTestManager(t);
    const order: string[] = [];
    const wordOf = (prompt: string) => prompt.match(/Word: (\w+)/)?.[1] ?? '?';

    const p1 = manager.requestTest({ cardKey: 'k1', priority: 'prefetch', input: input('definition', 'A') });
    await sleep();
    // A is now in flight; everything else queues behind it.
    const p2 = manager.requestTest({ cardKey: 'k2', priority: 'prefetch', input: input('definition', 'B') });
    const p3 = manager.requestTest({ cardKey: 'k3', priority: 'current', input: input('definition', 'C') });
    const p4 = manager.requestTest({ cardKey: 'k4', priority: 'user', input: input('definition', 'D') });
    await sleep();

    // Release A — the queue should then run D (user), C (current), B (prefetch).
    t.calls[0]!.resolve(makeResponse('definition'));
    await p1;
    await sleep();
    order.push(wordOf(t.calls[1]!.prompt));
    t.calls[1]!.resolve(makeResponse('definition'));
    await p4;
    await sleep();
    order.push(wordOf(t.calls[2]!.prompt));
    t.calls[2]!.resolve(makeResponse('definition'));
    await p3;
    await sleep();
    order.push(wordOf(t.calls[3]!.prompt));
    t.calls[3]!.resolve(makeResponse('definition'));
    await p2;

    expect(order).toEqual(['D', 'C', 'B']);
  });

  it('reuses a queued prefetch when the current card requests the same test', async () => {
    const t = deferredTransport();
    const manager = new SrsTestManager(t);
    const prefetch = manager.requestTest({ cardKey: 'k', priority: 'prefetch', input: input('definition') });
    await sleep();
    const current = manager.requestTest({ cardKey: 'k', priority: 'current', input: input('definition') });
    await sleep();
    expect(t.calls).toHaveLength(1);
    t.calls[0]!.resolve(makeResponse('definition'));
    const [pr, cr] = await Promise.all([prefetch, current]);
    expect(pr).toMatchObject({ ok: true });
    expect(cr).toMatchObject({ ok: true });
    expect(t.calls).toHaveLength(1);
  });

  it('cancels queued prefetches that are no longer needed', async () => {
    const t = deferredTransport();
    const manager = new SrsTestManager(t);
    const keep = manager.requestTest({ cardKey: 'keep', priority: 'prefetch', input: input('definition') });
    const stale = manager.requestTest({ cardKey: 'stale', priority: 'prefetch', input: input('definition') });
    await sleep();
    expect(t.calls).toHaveLength(1); // keep is in flight

    manager.cancelPrefetchesExcept(new Set(['keep']));
    await sleep();
    const staleResult = await stale;
    expect(staleResult).toMatchObject({ ok: false });
    if (!staleResult.ok) expect(staleResult.diagnostic.error).toBe('Cancelled');
    expect(t.calls).toHaveLength(1); // the stale request never reached the transport

    t.calls[0]!.resolve(makeResponse('definition'));
    await keep;
  });
});

describe('SrsTestManager retry + diagnostics', () => {
  it('auto-retries exactly once and reports the retry', async () => {
    let calls = 0;
    const transport: SrsTestTransport = {
      async generate() {
        calls += 1;
        if (calls === 1) throw new Error('boom');
        return makeResponse('definition');
      },
    };
    const manager = new SrsTestManager(transport);
    let retries = 0;
    const result = await manager.requestTest({
      cardKey: 'k',
      priority: 'current',
      input: input('definition'),
      onRetry: () => { retries += 1; },
    });
    expect(result).toMatchObject({ ok: true });
    expect(calls).toBe(2);
    expect(retries).toBe(1);
  });

  it('stops after one retry and returns a diagnostic with prompt/response/error', async () => {
    const calls: string[] = [];
    const transport: SrsTestTransport = {
      async generate(prompt: string) {
        calls.push(prompt);
        throw new Error('boom');
      },
    };
    const manager = new SrsTestManager(transport);
    const result = await manager.requestTest({
      cardKey: 'k',
      priority: 'current',
      input: input('definition'),
    });
    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(2); // one fresh attempt + one retry, no more
    if (!result.ok) {
      expect(result.diagnostic.error).toBe('boom');
      expect(result.diagnostic.response).toBeNull();
      expect(result.diagnostic.prompt).toContain('Word: word');
      expect(result.diagnostic.prompt).toContain('attempt 2'); // retry hint
      expect(result.diagnostic.kind).toBe('definition');
    }
  });

  it('captures the raw response in the diagnostic when parsing fails', async () => {
    const transport: SrsTestTransport = {
      async generate() {
        return 'not json at all';
      },
    };
    const manager = new SrsTestManager(transport);
    const result = await manager.requestTest({
      cardKey: 'k',
      priority: 'current',
      input: input('definition'),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostic.response).toBe('not json at all');
      expect(result.diagnostic.error).toMatch(/JSON|Unexpected|parse/i);
    }
  });

  it('a regenerated request supersedes a queued generation of the same test', async () => {
    const t = deferredTransport();
    const manager = new SrsTestManager(t);
    const first = manager.requestTest({ cardKey: 'k', priority: 'prefetch', input: input('definition') });
    await sleep();
    expect(t.calls).toHaveLength(1); // first is in flight
    const queued = manager.requestTest({ cardKey: 'k2', priority: 'prefetch', input: input('definition') });
    await sleep();
    // k2 is queued; a user regeneration supersedes it.
    const regen = manager.requestTest({
      cardKey: 'k2',
      priority: 'user',
      input: { ...input('definition'), regenerate: true },
    });
    await sleep();
    const queuedResult = await queued;
    expect(queuedResult).toMatchObject({ ok: false });
    if (!queuedResult.ok) expect(queuedResult.diagnostic.error).toMatch(/Superseded/);

    // Release the in-flight call, then the regeneration runs.
    t.calls[0]!.resolve(makeResponse('definition'));
    await first;
    await sleep();
    expect(t.calls).toHaveLength(2);
    t.calls[1]!.resolve(makeResponse('definition'));
    const regenResult = await regen;
    expect(regenResult).toMatchObject({ ok: true });
  });
});
