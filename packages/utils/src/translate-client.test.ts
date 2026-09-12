import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearTranslationCache, translateTexts } from './translate-client';

const BASE = 'http://api.test';

function mockFetch(impl: (url: string, init?: RequestInit) => unknown) {
  const spy = vi.fn(async (url: string, init?: RequestInit) => impl(url, init));
  vi.stubGlobal('fetch', spy);
  return spy;
}

function ok(body: unknown) {
  return { ok: true, json: async () => body };
}

afterEach(() => {
  clearTranslationCache();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('translateTexts', () => {
  it('returns the input untouched for an empty list', async () => {
    expect(await translateTexts({ texts: [], l1: 'en', l2: 'zh', apiBaseUrl: BASE })).toEqual([]);
  });

  it('does not call the backend when the languages match', async () => {
    const spy = mockFetch(() => ok({ translated_texts: [] }));
    const result = await translateTexts({ texts: ['你好'], l1: 'zh', l2: 'zh', apiBaseUrl: BASE });
    expect(result).toEqual(['你好']);
    expect(spy).not.toHaveBeenCalled();
  });

  it('posts to /translate_array and returns translations in order', async () => {
    const spy = mockFetch(() => ok({ translated_texts: ['Listen and choose.', 'Read the table.'] }));
    const result = await translateTexts({
      texts: ['听录音，选择。', '看表格。'],
      l1: 'en',
      l2: 'zh',
      apiBaseUrl: BASE,
    });
    expect(result).toEqual(['Listen and choose.', 'Read the table.']);
    expect(spy).toHaveBeenCalledTimes(1);
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe(`${BASE}/translate_array`);
    expect(JSON.parse(String(init!.body))).toMatchObject({ l1: 'en', l2: 'zh' });
  });

  it('normalises a trailing slash on the base URL', async () => {
    const spy = mockFetch(() => ok({ translated_texts: ['x'] }));
    await translateTexts({ texts: ['一'], l1: 'en', l2: 'zh', apiBaseUrl: `${BASE}/` });
    expect(spy.mock.calls[0]![0]).toBe(`${BASE}/translate_array`);
  });

  it('caches per language pair, so a repeat visit is free', async () => {
    const spy = mockFetch(() => ok({ translated_texts: ['Listen.'] }));
    const args = { texts: ['听。'], l1: 'en', l2: 'zh', apiBaseUrl: BASE };
    await translateTexts(args);
    const second = await translateTexts(args);
    expect(second).toEqual(['Listen.']);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('caches per language pair rather than per text', async () => {
    const spy = mockFetch((_url, init) => {
      const body = JSON.parse(String(init!.body)) as { l1: string };
      return ok({ translated_texts: [`to-${body.l1}`] });
    });
    await translateTexts({ texts: ['听。'], l1: 'en', l2: 'zh', apiBaseUrl: BASE });
    const fr = await translateTexts({ texts: ['听。'], l1: 'fr', l2: 'zh', apiBaseUrl: BASE });
    expect(fr).toEqual(['to-fr']);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('only requests texts it does not already have', async () => {
    const bodies: string[][] = [];
    mockFetch((_url, init) => {
      const body = JSON.parse(String(init!.body)) as { texts: string[] };
      bodies.push(body.texts);
      return ok({ translated_texts: body.texts.map((t) => `t:${t}`) });
    });
    await translateTexts({ texts: ['一'], l1: 'en', l2: 'zh', apiBaseUrl: BASE });
    const result = await translateTexts({ texts: ['一', '二'], l1: 'en', l2: 'zh', apiBaseUrl: BASE });
    expect(bodies).toEqual([['一'], ['二']]);
    expect(result).toEqual(['t:一', 't:二']);
  });

  it('returns null rather than throwing on a non-OK response', async () => {
    mockFetch(() => ({ ok: false, status: 500, json: async () => ({}) }));
    expect(await translateTexts({ texts: ['一'], l1: 'en', l2: 'zh', apiBaseUrl: BASE })).toBeNull();
  });

  it('returns null on a network error, so the L2 instructions still render', async () => {
    mockFetch(() => {
      throw new Error('offline');
    });
    expect(await translateTexts({ texts: ['一'], l1: 'en', l2: 'zh', apiBaseUrl: BASE })).toBeNull();
  });

  it('treats a short response as a failure rather than misaligning', async () => {
    // One translation for two texts would attach the wrong text to a source.
    mockFetch(() => ok({ translated_texts: ['only one'] }));
    expect(
      await translateTexts({ texts: ['一', '二'], l1: 'en', l2: 'zh', apiBaseUrl: BASE }),
    ).toBeNull();
  });

  it('treats a malformed response as a failure', async () => {
    mockFetch(() => ok({ translated_texts: 'nope' }));
    expect(await translateTexts({ texts: ['一'], l1: 'en', l2: 'zh', apiBaseUrl: BASE })).toBeNull();
  });

  it('ignores an empty translation string, falling back to the source', async () => {
    mockFetch(() => ok({ translated_texts: ['   '] }));
    const result = await translateTexts({ texts: ['一'], l1: 'en', l2: 'zh', apiBaseUrl: BASE });
    expect(result).toEqual(['一']);
  });
});
