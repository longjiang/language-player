/**
 * Tests for the TokenCache class and MD5 hashing.
 * Verifies cache loading, lookup, and server hash compatibility.
 */
import { describe, it, expect } from 'vitest';
import { TokenCache } from './token-cache';
import { md5 } from './md5';

describe('md5', () => {
  it('produces the same hash as Python hashlib.md5', () => {
    // Verified against: python3.10 -c "import hashlib; print(hashlib.md5(b'test').hexdigest())"
    expect(md5('Hello world')).toBe('3e25960a79dbc69b674cd4ec67a72c62');
    expect(md5('你好世界')).toBe('65396ee4aad0b4f17aacd1c6112ee364');
    expect(md5('안녕하세요')).toBe('209bebae3eb7363d9b080a66f9e306ef');
    expect(md5('日本語')).toBe('00110af8b4393ef3f72c50be5b332bec');
  });

  it('is deterministic and collision-resistant for similar strings', () => {
    expect(md5('hello')).not.toBe(md5('Hello'));
    expect(md5('a')).not.toBe(md5('b'));
    expect(md5('')).toBe('d41d8cd98f00b204e9800998ecf8427e');
  });
});

describe('TokenCache', () => {
  it('loads and retrieves tokens by original text', () => {
    const cache = new TokenCache();

    cache.load({
      [md5('Hello')]: { tokens: [{ text: 'Hello', lemmas: [{ lemma: 'hello' }] }] },
    });

    expect(cache.size).toBe(1);
    expect(cache.get('Hello')).toEqual([
      { text: 'Hello', lemmas: [{ lemma: 'hello' }] },
    ]);
  });

  it('returns undefined for missing entries', () => {
    const cache = new TokenCache();
    expect(cache.get('missing')).toBeUndefined();
  });

  it('skips entries with empty tokens', () => {
    const cache = new TokenCache();
    cache.load({
      abc: { tokens: [] },
      [md5('hi')]: { tokens: [{ text: 'hi', lemmas: [] }] },
    });
    expect(cache.size).toBe(1); // only the non-empty one
  });

  it('clears all entries', () => {
    const cache = new TokenCache();
    cache.load({ [md5('x')]: { tokens: [{ text: 'x', lemmas: [] }] } });
    expect(cache.size).toBe(1);
    cache.clear();
    expect(cache.size).toBe(0);
  });
});
