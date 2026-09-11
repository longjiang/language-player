import { describe, it, expect } from 'vitest';
import type { LemmatizedToken } from '@langplayer/shared';
import {
  AUTO_TITLE_MAX_TOKENS,
  autoNoteTitle,
  autoTitleFromLine,
  isUntitledNoteTitle,
  noteFirstLine,
} from './note-title';

/** Word token (clickable / resolvable). */
const word = (text: string): LemmatizedToken => ({
  text,
  lemmas: [{ lemma: text }],
});

/** Non-word token (space, punctuation) — the lemmatizer returns `lemmas: []`. */
const gap = (text: string): LemmatizedToken => ({ text, lemmas: [] });

/** Tokenize a space-separated line the way the batch lemmatizer does: words
 *  plus the spaces `_recover_spaces` puts back between them. */
function tokenizeWords(line: string): LemmatizedToken[] {
  const parts = line.split(/(\s+)/).filter(s => s !== '');
  return parts.map(part => (/^\s+$/.test(part) ? gap(part) : word(part)));
}

const UNTITLED = 'Untitled';

describe('noteFirstLine', () => {
  it('returns the first non-empty line, trimmed', () => {
    expect(noteFirstLine('\n\n  Hello world  \nsecond line')).toBe('Hello world');
  });

  it('strips Markdown heading and quote markers', () => {
    expect(noteFirstLine('### 読書メモ\n本文')).toBe('読書メモ');
    expect(noteFirstLine('> quoted intro')).toBe('quoted intro');
    expect(noteFirstLine('####### seven hashes')).toBe('####### seven hashes');
  });

  it('is empty for an empty or whitespace-only body', () => {
    expect(noteFirstLine('')).toBe('');
    expect(noteFirstLine('   \n\t\n')).toBe('');
  });
});

describe('isUntitledNoteTitle', () => {
  it('accepts the localized and the English placeholder, case-insensitively', () => {
    expect(isUntitledNoteTitle('Untitled', UNTITLED)).toBe(true);
    expect(isUntitledNoteTitle('untitled', UNTITLED)).toBe(true);
    expect(isUntitledNoteTitle('无标题', '无标题')).toBe(true);
    expect(isUntitledNoteTitle('  Sans titre ', 'Sans titre')).toBe(true);
  });

  it('treats an empty title as untitled', () => {
    expect(isUntitledNoteTitle('', UNTITLED)).toBe(true);
    expect(isUntitledNoteTitle(null, UNTITLED)).toBe(true);
    expect(isUntitledNoteTitle(undefined, UNTITLED)).toBe(true);
  });

  it('leaves a real title alone', () => {
    expect(isUntitledNoteTitle('読書メモ', '無題')).toBe(false);
    expect(isUntitledNoteTitle('Untitled notes', UNTITLED)).toBe(false);
  });
});

describe('autoTitleFromLine', () => {
  it('keeps a line of ten or fewer tokens unchanged', () => {
    const line = 'one two three four five six seven eight nine ten';
    expect(autoTitleFromLine(line, tokenizeWords(line))).toBe(line);
  });

  it('trims to ten word tokens with a trailing ellipsis', () => {
    const line = 'one two three four five six seven eight nine ten eleven twelve';
    expect(autoTitleFromLine(line, tokenizeWords(line)))
      .toBe('one two three four five six seven eight nine ten…');
  });

  it('counts tokens, not whitespace words, for CJK', () => {
    // No spaces — whitespace splitting sees ONE word and would keep all 12.
    const tokens = '一二三四五六七八九十十一十二'.split('').map(word);
    expect(autoTitleFromLine('一二三四五六七八九十十一十二', tokens))
      .toBe('一二三四五六七八九十…');
  });

  it('counts only word tokens, carrying punctuation and spaces along', () => {
    const line = 'Hello, world! This is a test of the auto title rule today';
    const tokens = [
      word('Hello'), gap(','), gap(' '), word('world'), gap('!'), gap(' '),
      word('This'), gap(' '), word('is'), gap(' '), word('a'), gap(' '),
      word('test'), gap(' '), word('of'), gap(' '), word('the'), gap(' '),
      word('auto'), gap(' '), word('title'), gap(' '), word('rule'), gap(' '),
      word('today'),
    ];
    expect(autoTitleFromLine(line, tokens))
      .toBe('Hello, world! This is a test of the auto title…');
  });

  it('falls back to whitespace words when the tokenizer is missing', () => {
    const line = 'one two three four five six seven eight nine ten eleven';
    expect(autoTitleFromLine(line, null))
      .toBe('one two three four five six seven eight nine ten…');
    expect(autoTitleFromLine(line, [])).toBe('one two three four five six seven eight nine ten…');
  });

  it('falls back when the tokens do not reconstruct the line', () => {
    // A token list whose joined text is a different string must not be sliced.
    const line = 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda';
    const tokens = [word('something'), gap(' '), word('else')];
    expect(autoTitleFromLine(line, tokens))
      .toBe('alpha beta gamma delta epsilon zeta eta theta iota kappa…');
  });

  it('never exceeds the token budget', () => {
    const line = '一 二 三 四 五 六 七 八 九 十 十一 十二'
      .split(' ').map(word);
    const title = autoTitleFromLine('一 二 三 四 五 六 七 八 九 十 十一 十二', line);
    expect(title).toBe('一 二 三 四 五 六 七 八 九 十…');
    expect(AUTO_TITLE_MAX_TOKENS).toBe(10);
  });
});

describe('autoNoteTitle', () => {
  it('derives a title from the first line of an untitled note', async () => {
    const title = await autoNoteTitle({
      text: '  \n第一章 故事的开始\n第二章',
      currentTitle: 'Untitled',
      untitledLabel: UNTITLED,
      tokenize: async line => tokenizeWords(line),
    });
    expect(title).toBe('第一章 故事的开始');
  });

  it('derives from the localized placeholder too', async () => {
    const title = await autoNoteTitle({
      text: '読書メモ 2026',
      currentTitle: '無題',
      untitledLabel: '無題',
      tokenize: async line => tokenizeWords(line),
    });
    expect(title).toBe('読書メモ 2026');
  });

  it('never overwrites a title the user typed', async () => {
    const title = await autoNoteTitle({
      text: 'First line of the body',
      currentTitle: 'My own title',
      untitledLabel: UNTITLED,
      tokenize: async line => tokenizeWords(line),
    });
    expect(title).toBeNull();
  });

  it('does nothing for an empty note', async () => {
    const title = await autoNoteTitle({
      text: '   \n\n',
      currentTitle: 'Untitled',
      untitledLabel: UNTITLED,
      tokenize: async line => tokenizeWords(line),
    });
    expect(title).toBeNull();
  });

  it('still renames when the tokenizer throws (whitespace fallback)', async () => {
    const title = await autoNoteTitle({
      text: 'one two three four five six seven eight nine ten eleven',
      currentTitle: '無標題',
      untitledLabel: '無標題',
      tokenize: async () => { throw new Error('offline'); },
    });
    expect(title).toBe('one two three four five six seven eight nine ten…');
  });

  it('skips the write when the derived title equals the current one', async () => {
    const title = await autoNoteTitle({
      text: 'Just a title',
      currentTitle: 'Just a title',
      untitledLabel: UNTITLED,
      tokenize: async line => tokenizeWords(line),
    });
    expect(title).toBeNull();
  });

  it('honours a custom token budget', async () => {
    const title = await autoNoteTitle({
      text: 'one two three four',
      currentTitle: 'Untitled',
      untitledLabel: UNTITLED,
      tokenize: async line => tokenizeWords(line),
      maxTokens: 2,
    });
    expect(title).toBe('one two…');
  });
});
