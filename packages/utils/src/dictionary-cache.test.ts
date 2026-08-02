import { describe, it, expect, vi, afterEach } from 'vitest';
import type { DictionaryEntry } from '@langplayer/shared';
import {
  bulkLookupWords,
  enqueueLookupWords,
  getCachedEntries,
} from './dictionary-cache';

const API = 'http://dict-test';

function entryFor(word: string): DictionaryEntry {
  return { id: `id-${word}`, definitions: [`def-${word}`] } as unknown as DictionaryEntry;
}

/** Parses the words array out of a /dictionary/lookup-batch request body. */
function bodyWords(init?: RequestInit): string[] {
  const body = JSON.parse(String(init?.body ?? '{}'));
  return (body.words ?? []).map((w: { text: string }) => w.text);
}

function batchResponse(words: string[]) {
  return {
    ok: true,
    json: async () => ({
      results: Object.fromEntries(words.map((w) => [w, [entryFor(w)]])),
    }),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('bulkLookupWords', () => {
  it('dedupes identical in-flight batches into one request', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const words = bodyWords(init);
      await new Promise((r) => setTimeout(r, 20));
      return batchResponse(words);
    });
    vi.stubGlobal('fetch', fetchMock);

    const words = [
      { text: 'dedup-a', l2Code: 'ja' },
      { text: 'dedup-b', l2Code: 'ja' },
    ];
    const p1 = bulkLookupWords(words, API);
    const p2 = bulkLookupWords(words, API);
    await Promise.all([p1, p2]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getCachedEntries('ja', 'dedup-a')).toBeDefined();
  });

  it('does not drop a second batch with the same size and language but different words', async () => {
    let releaseFirst!: () => void;
    let calls = 0;
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      calls += 1;
      const words = bodyWords(init);
      return new Promise((resolve) => {
        const respond = () => resolve(batchResponse(words));
        if (calls === 1) releaseFirst = respond;
        else respond();
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const p1 = bulkLookupWords(
      [
        { text: 'collide-a', l2Code: 'ja' },
        { text: 'collide-b', l2Code: 'ja' },
        { text: 'collide-c', l2Code: 'ja' },
      ],
      API,
    );
    const p2 = bulkLookupWords(
      [
        { text: 'collide-d', l2Code: 'ja' },
        { text: 'collide-e', l2Code: 'ja' },
        { text: 'collide-f', l2Code: 'ja' },
      ],
      API,
    );
    releaseFirst();
    await Promise.all([p1, p2]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(getCachedEntries('ja', 'collide-f')).toBeDefined();
  });

  it('groups mixed-language batches into per-language requests', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const words = bodyWords(init);
      return batchResponse(words);
    });
    vi.stubGlobal('fetch', fetchMock);

    await bulkLookupWords(
      [
        { text: 'mixed-ja', l2Code: 'ja' },
        { text: 'mixed-zh', l2Code: 'zh' },
      ],
      API,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const l2s = fetchMock.mock.calls
      .map((c) => JSON.parse(String((c[1] as RequestInit | undefined)?.body ?? '{}')))
      .map((b) => b.words[0].l2)
      .sort();
    expect(l2s).toEqual(['ja', 'zh']);
    expect(getCachedEntries('ja', 'mixed-ja')).toBeDefined();
    expect(getCachedEntries('zh', 'mixed-zh')).toBeDefined();
  });

  it('skips words already in the cache', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const words = bodyWords(init);
      return batchResponse(words);
    });
    vi.stubGlobal('fetch', fetchMock);

    await bulkLookupWords([{ text: 'cached-x', l2Code: 'ja' }], API);
    fetchMock.mockClear();

    await bulkLookupWords(
      [
        { text: 'cached-x', l2Code: 'ja' },
        { text: 'fresh-y', l2Code: 'ja' },
      ],
      API,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(bodyWords(fetchMock.mock.calls[0]![1] as RequestInit)).toEqual(['fresh-y']);
  });

  it('falls back to per-word requests when the batch request fails', async () => {
    let batchFailed = false;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const words = bodyWords(init);
      if (!batchFailed && words.length > 1) {
        batchFailed = true;
        return { ok: false, status: 500, json: async () => ({}) };
      }
      return batchResponse(words);
    });
    vi.stubGlobal('fetch', fetchMock);

    await bulkLookupWords(
      [
        { text: 'fb-a', l2Code: 'ja' },
        { text: 'fb-b', l2Code: 'ja' },
      ],
      API,
    );

    expect(fetchMock).toHaveBeenCalledTimes(3); // 1 batch + 2 per-word
    expect(getCachedEntries('ja', 'fb-a')).toBeDefined();
    expect(getCachedEntries('ja', 'fb-b')).toBeDefined();
  });
});

describe('enqueueLookupWords', () => {
  it('drains more than LOOKUP_BATCH_MAX words in one flush', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const words = bodyWords(init);
      return batchResponse(words);
    });
    vi.stubGlobal('fetch', fetchMock);

    const words = Array.from({ length: 35 }, (_, i) => ({
      text: `overflow-${i}`,
      l2Code: 'ja',
    }));
    const done = enqueueLookupWords(words, API);
    await new Promise((r) => setTimeout(r, 300));
    await done;

    // 30-word cap → two requests: 30 + 5. The overflow must not strand.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(getCachedEntries('ja', 'overflow-0')).toBeDefined();
    expect(getCachedEntries('ja', 'overflow-34')).toBeDefined();
  });
});
