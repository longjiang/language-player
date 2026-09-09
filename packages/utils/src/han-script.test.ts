import { describe, expect, it } from 'vitest';
import type { DictionaryEntry } from '@langplayer/shared';
import { normalizeByeonggi, rawByeonggi, resolveByeonggi } from './han-script';

function entry(overrides: Partial<DictionaryEntry>): DictionaryEntry {
  return {
    kind: 'dictionary',
    dictionary: { id: 'kengdic', name: 'kengdic', version: '2011' },
    id: 'x',
    match_type: 'exact',
    source: 'kengdic',
    head: '가',
    definitions: ['a dwelling'],
    ...overrides,
  } as DictionaryEntry;
}

const ko = (head: string, hanja: string | null, id = `${head}-${hanja}`) =>
  entry({ id, head, han_script: { hangul: head, hanja } });

describe('rawByeonggi', () => {
  it('reads the per-language field: ko → hanja, vi → han (hantu fallback)', () => {
    const koEntry = entry({ han_script: { hangul: '학교', hanja: '學校', han: '學校' } });
    expect(rawByeonggi(koEntry, 'ko')).toBe('學校');
    const viEntry = entry({ han_script: { han: '字', hantu: '字' } });
    expect(rawByeonggi(viEntry, 'vi')).toBe('字');
    const viHantuOnly = entry({ han_script: { hantu: '國' } });
    expect(rawByeonggi(viHantuOnly, 'vi')).toBe('國');
  });

  it('returns null for languages without a byeonggi field', () => {
    const ja = entry({ han_script: { kanji: '食' } });
    expect(rawByeonggi(ja, 'ja')).toBeNull();
    expect(rawByeonggi(ja, 'zh')).toBeNull();
  });

  it('does not read alternate (kana for ja, other script for zh)', () => {
    const e = entry({ head: '食べる', alternate: 'たべる', han_script: { kanji: '食べる' } });
    expect(rawByeonggi(e, 'ja')).toBeNull();
  });
});

describe('normalizeByeonggi', () => {
  it('keeps plain hanja', () => {
    expect(normalizeByeonggi('長斫', 'ko')).toBe('長斫');
    expect(normalizeByeonggi('學校', 'ko')).toBe('學校');
  });

  it('suppresses kengdic comma-separated homograph lists', () => {
    expect(normalizeByeonggi('時事,示唆,試寫,詩史', 'ko')).toBeNull();
    expect(normalizeByeonggi('滯在,體裁', 'ko')).toBeNull();
  });

  it('suppresses values that are not han script', () => {
    expect(normalizeByeonggi('아이', 'ko')).toBeNull(); // hangul synonym
    expect(normalizeByeonggi('bus', 'ko')).toBeNull(); // romanization
    expect(normalizeByeonggi('XXX', 'ko')).toBeNull();
    expect(normalizeByeonggi('食前술', 'ko')).toBeNull(); // mixed hangul + hanja
    expect(normalizeByeonggi('집~', 'ko')).toBeNull();
    expect(normalizeByeonggi('', 'ko')).toBeNull();
    expect(normalizeByeonggi(null, 'ko')).toBeNull();
  });

  it('keeps hyphen placeholders and CJK punctuation', () => {
    expect(normalizeByeonggi('當座-預金', 'ko')).toBe('當座-預金');
    expect(normalizeByeonggi('-瞳子', 'ko')).toBe('-瞳子');
  });

  it('applies the comma rule to Korean only — Vietnamese phrases may use full-width commas', () => {
    expect(normalizeByeonggi('病從口入，禍從口出', 'vi')).toBe('病從口入，禍從口出');
    expect(normalizeByeonggi('字', 'vi')).toBe('字');
    expect(normalizeByeonggi('abc', 'vi')).toBeNull();
  });
});

describe('resolveByeonggi', () => {
  it('returns the single hanja of a unique exact match', () => {
    expect(resolveByeonggi({ base: 'ko', entries: [ko('장작', '長斫')] })).toBe('長斫');
    expect(resolveByeonggi({ base: 'ko', entries: [ko('대신', '代身')] })).toBe('代身');
  });

  it('suppresses hanja when exact matches disagree (incl. a match with none)', () => {
    // 가 → 家 on one row, no hanja on two others.
    expect(
      resolveByeonggi({
        base: 'ko',
        entries: [ko('가', null, 'a'), ko('가', null, 'b'), ko('가', '家', 'c')],
      }),
    ).toBeNull();
    // 고 → 犒 on two rows, no hanja on the third.
    expect(
      resolveByeonggi({
        base: 'ko',
        entries: [ko('고', '犒', 'a'), ko('고', '犒', 'b'), ko('고', null, 'c')],
      }),
    ).toBeNull();
  });

  it('keeps the hanja when every exact match carries the same value', () => {
    expect(
      resolveByeonggi({ base: 'ko', entries: [ko('학교', '學校', 'a'), ko('학교', '學校', 'b')] }),
    ).toBe('學校');
  });

  it('suppresses the kengdic comma list even for a single match', () => {
    expect(resolveByeonggi({ base: 'ko', entries: [ko('시사', '時事,示唆,試寫,詩史')] })).toBeNull();
  });

  it('uses the saved entry over disagreeing matches', () => {
    const saved = ko('가', '家', 'saved');
    expect(
      resolveByeonggi({
        base: 'ko',
        entries: [ko('가', null, 'a'), ko('가', null, 'b'), saved],
        savedEntry: saved,
      }),
    ).toBe('家');
  });

  it('lets the comma rule override the saved entry', () => {
    const saved = ko('시사', '時事,示唆,試寫,詩史', 'saved');
    expect(resolveByeonggi({ base: 'ko', entries: [saved], savedEntry: saved })).toBeNull();
  });

  it('shows nothing when the saved entry has no usable hanja', () => {
    const saved = ko('애', '아이', 'saved');
    expect(resolveByeonggi({ base: 'ko', entries: [saved], savedEntry: saved })).toBeNull();
  });

  it('falls back to non-exact entries when no match is marked exact', () => {
    const fuzzy = ko('장작', '長斫', 'fuzzy');
    fuzzy.match_type = 'fuzzy';
    expect(resolveByeonggi({ base: 'ko', entries: [fuzzy] })).toBe('長斫');
  });

  it('ignores non-exact matches once an exact match exists', () => {
    const fuzzy = ko('장작', '長斫', 'fuzzy');
    fuzzy.match_type = 'fuzzy';
    const exact = ko('장작', '長斫', 'exact');
    expect(resolveByeonggi({ base: 'ko', entries: [fuzzy, exact] })).toBe('長斫');
    const exactDifferent = ko('장작', '長磔', 'exact2');
    expect(resolveByeonggi({ base: 'ko', entries: [fuzzy, exact, exactDifferent] })).toBeNull();
  });

  it('is a no-op for languages other than ko/vi', () => {
    expect(resolveByeonggi({ base: 'zh', entries: [ko('장작', '長斫')] })).toBeNull();
    expect(resolveByeonggi({ base: 'ja', entries: [ko('장작', '長斫')] })).toBeNull();
  });

  it('resolves Vietnamese hán tự from han_script.han', () => {
    const vi = entry({ head: 'chữ', han_script: { han: '字', hantu: '字' } });
    expect(resolveByeonggi({ base: 'vi', entries: [vi] })).toBe('字');
  });
});
