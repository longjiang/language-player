import { describe, it, expect, vi, afterEach } from 'vitest';
import { md5 } from '@langplayer/utils';
import { translateTextsKeyed } from './translate';

const TEXTS = ['Hello world', '你好世界', 'third block'];

function stubFetch(body: unknown, ok = true) {
  const fetchMock = vi.fn(async () => ({
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  }) as unknown as Response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function requestBodyOf(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toContain('/translate_array');
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('translateTextsKeyed', () => {
  it('pairs positional responses back to texts by md5 key (current backend contract)', async () => {
    stubFetch({
      translated_texts: ['Bonjour le monde', '你好世界', 'troisième bloc'],
    });

    const res = await translateTextsKeyed(TEXTS, 'en', 'fr');

    expect(res.keys).toEqual(TEXTS.map(md5));
    expect(res.byKey[md5('Hello world')]).toBe('Bonjour le monde');
    expect(res.byKey[md5('你好世界')]).toBe('你好世界');
    expect(res.byKey[md5('third block')]).toBe('troisième bloc');
  });

  it('sends md5 keys alongside the texts in the request', async () => {
    const fetchMock = stubFetch({
      translated_texts: ['Bonjour le monde', '你好世界', 'troisième bloc'],
    });

    await translateTextsKeyed(TEXTS, 'en', 'fr');

    const body = requestBodyOf(fetchMock);
    expect(body.texts).toEqual(TEXTS);
    expect(body.keys).toEqual(TEXTS.map(md5));
    expect(body.l1).toBe('en');
    expect(body.l2).toBe('fr');
  });

  it('rejects a response with the wrong number of translations', async () => {
    stubFetch({ translated_texts: ['only one'] });

    await expect(translateTextsKeyed(TEXTS, 'en', 'fr')).rejects.toThrow('length mismatch');
  });

  it('pairs by echoed keys regardless of response order', async () => {
    const keys = TEXTS.map(md5);
    stubFetch({
      keys: [keys[2], keys[0], keys[1]],
      translated_texts: ['troisième bloc', 'Bonjour le monde', '你好世界'],
    });

    const res = await translateTextsKeyed(TEXTS, 'en', 'fr');

    expect(res.byKey[md5('Hello world')]).toBe('Bonjour le monde');
    expect(res.byKey[md5('你好世界')]).toBe('你好世界');
    expect(res.byKey[md5('third block')]).toBe('troisième bloc');
  });

  it('rejects echoed keys that were not in the request', async () => {
    const keys = TEXTS.map(md5);
    stubFetch({
      keys: [keys[0], 'deadbeefdeadbeefdeadbeefdeadbeef', keys[2]],
      translated_texts: ['un', 'deux', 'trois'],
    });

    await expect(translateTextsKeyed(TEXTS, 'en', 'fr')).rejects.toThrow('unknown key');
  });

  it('drops duplicate texts whose translations conflict', async () => {
    stubFetch({
      translated_texts: ['première version', 'AUTRE version', 'x'],
    });

    const res = await translateTextsKeyed(['same text', 'same text', 'other'], 'en', 'fr');

    expect(res.byKey[md5('same text')]).toBeUndefined();
    expect(res.byKey[md5('other')]).toBe('x');
  });

  it('skips the request when l1 equals l2 or texts are empty', async () => {
    const fetchMock = stubFetch({ translated_texts: ['nope'] });

    const sameLang = await translateTextsKeyed(['x'], 'en', 'en');
    const empty = await translateTextsKeyed([], 'en', 'fr');

    expect(sameLang.byKey).toEqual({});
    expect(empty.byKey).toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects non-ok HTTP responses and missing translated_texts', async () => {
    stubFetch({}, false);
    await expect(translateTextsKeyed(TEXTS, 'en', 'fr')).rejects.toThrow('HTTP 500');

    vi.unstubAllGlobals();
    stubFetch({ keys: [] });
    await expect(translateTextsKeyed(TEXTS, 'en', 'fr')).rejects.toThrow(
      'missing translated_texts',
    );
  });
});
