import { describe, expect, it } from 'vitest';
import {
  cleanPronunciation,
  entryMatchesSurface,
  entryReading,
  formatPronunciation,
  savedEntryReading,
} from './pronunciation';
import type { DictionaryEntry } from '@langplayer/shared';

function entry(overrides: Partial<DictionaryEntry>): DictionaryEntry {
  return {
    kind: 'dictionary',
    dictionary: { id: 'cc-canto', name: 'CC-Canto', version: '2021' },
    id: 'x',
    match_type: 'exact',
    source: 'cc-canto',
    head: '呢個',
    definitions: ['this'],
    pronunciation: 'ni1 go3',
    ...overrides,
  } as DictionaryEntry;
}

describe('formatPronunciation', () => {
  it('formats Japanese kana, romaji, downstep, and pitch pattern together', () => {
    const e = entry({
      head: '残り',
      pronunciation: 'nokori',
      phonetic_detail: { kana: 'のこり', pitch_accent: [3] },
    });
    expect(formatPronunciation(e, 'ja')).toBe('[のこりꜜ, nokorí]③');
  });

  it('uses Japanese kana without pitch data before romanization', () => {
    const e = entry({
      head: '残り',
      pronunciation: 'nokori',
      phonetic_detail: { kana: 'のこり' },
    });
    expect(formatPronunciation(e, 'ja')).toBe('[のこり, nokori]');
  });

  it('shows kana + romaji for a pitch-less entry (no romaji gating)', () => {
    // EDICT stores the romaji in `pronunciation` and mirrors the kana into
    // phonetic_detail.kana. おべっか has no pitch-accent row; the API
    // serializes that as null even though the schema types it as optional.
    const pd = {
      kana: 'おべっか',
      romaji: 'obekka',
      pitch_accent: null,
    } as unknown as DictionaryEntry['phonetic_detail'];
    const e = entry({ head: 'おべっか', pronunciation: 'obekka', phonetic_detail: pd });
    expect(formatPronunciation(e, 'ja')).toBe('[おべっか, obekka]');
  });

  it('keeps kana + romaji for heiban (pattern 0)', () => {
    const e = entry({
      head: '橋',
      pronunciation: 'hashi',
      phonetic_detail: { kana: 'はし', pitch_accent: [0] },
    });
    expect(formatPronunciation(e, 'ja')).toBe('[はし, hashi]⓪');
  });

  it('reads the romaji from phonetic_detail when pronunciation repeats the head', () => {
    const e = entry({
      head: 'のこり',
      pronunciation: 'のこり',
      phonetic_detail: { kana: 'のこり', romaji: 'nokori', pitch_accent: [3] },
    });
    expect(formatPronunciation(e, 'ja')).toBe('[のこりꜜ, nokorí]③');
  });

  it('never renders an empty romaji slot for kana entries without romaji', () => {
    const noPron = entry({
      head: 'のこり',
      pronunciation: '',
      phonetic_detail: { kana: 'のこり' },
    });
    expect(formatPronunciation(noPron, 'ja')).toBe('[のこり]');

    const pitchNoPron = entry({
      head: 'のこり',
      pronunciation: '',
      phonetic_detail: { kana: 'のこり', pitch_accent: [3] },
    });
    expect(formatPronunciation(pitchNoPron, 'ja')).toBe('[のこりꜜ]③');
  });

  it('falls back to Japanese romanization when kana is unavailable', () => {
    const e = entry({
      head: '残り',
      pronunciation: '',
      phonetic_detail: { romanization: 'nokori' },
    });
    expect(formatPronunciation(e, 'ja')).toBe('[nokori]');
  });

  it('uses jyutping for Cantonese, not Mandarin pinyin', () => {
    const e = entry({
      pronunciation: 'ni1 go3',
      phonetic_detail: { jyutping: 'ni1 go3', pinyin: 'ne5 ge4' },
    });
    expect(formatPronunciation(e, 'yue')).toBe('[ni1 go3]');
  });

  it('keeps tone-marked pinyin for Mandarin', () => {
    const e = entry({
      head: '你好',
      pronunciation: 'nǐ hǎo',
      phonetic_detail: { pinyin: 'nǐ hǎo', pinyin_numeric: 'ni3 hao3' },
    });
    expect(formatPronunciation(e, 'zh')).toBe('[nǐ hǎo]');
  });

  it('falls back to phonetic_detail when the flat field is missing', () => {
    const e = entry({
      pronunciation: '',
      phonetic_detail: { pinyin: 'nǐ hǎo' },
    });
    expect(formatPronunciation(e, 'zh')).toBe('[nǐ hǎo]');
  });

  it('strips wiki.local source labels from displayed pronunciation', () => {
    const e = entry({
      head: 'จาก',
      pronunciation: 't͡ɕaːk̚˨˩, wiki.local',
    });
    expect(formatPronunciation(e, 'th')).toBe('[t͡ɕaːk̚˨˩]');
    expect(cleanPronunciation('t͡ɕon˧, wiki.local')).toBe('t͡ɕon˧');
    expect(cleanPronunciation('pʰim˧')).toBe('pʰim˧');
    expect(cleanPronunciation('')).toBeNull();
  });

  it('prefers Thai Paiboon+ romanization over IPA', () => {
    const e = entry({
      head: 'ประเทศ',
      pronunciation: 'bprà-têet',
      phonetic_detail: {
        ipa: 'pra˨˩.tʰeːt̚˥˩',
        romanization: 'bprà-têet',
      },
    });
    expect(formatPronunciation(e, 'th')).toBe('[bprà-têet]');
  });

  it('uses IPA as the final fallback for other languages', () => {
    const e = entry({
      head: 'bonjour',
      pronunciation: '',
      phonetic_detail: { ipa: 'bɔ̃.ʒuʁ' },
    });
    expect(formatPronunciation(e, 'fr')).toBe('[bɔ̃.ʒuʁ]');
  });

  it('strips Wiktionary grammatical labels from Thai pronunciation', () => {
    const e = entry({
      head: 'ประเทศ',
      pronunciation: 'bound form, pra˨˩.tʰeːt̚˥˩, pra˨˩.tʰeːt̚˥˩.sa˨˩.',
    });
    expect(cleanPronunciation(e.pronunciation)).toBe(
      'pra˨˩.tʰeːt̚˥˩, pra˨˩.tʰeːt̚˥˩.sa˨˩',
    );
    expect(cleanPronunciation('bound form, wiktionary')).toBe('wiktionary');
  });
});

describe('entryReading / entryMatchesSurface / savedEntryReading', () => {
  it('reads Japanese kana (never romaji) for ruby', () => {
    const e = entry({
      head: '食べる',
      pronunciation: 'taberu',
      phonetic_detail: { kana: 'たべる', romaji: 'taberu' },
    });
    expect(entryReading(e, 'ja')).toBe('たべる');
  });

  it('uses a kana-only alternate when phonetic_detail.kana is absent', () => {
    const e = entry({ head: '然るべき', pronunciation: 'shikarubeki', alternate: 'しかるべき' });
    expect(entryReading(e, 'ja')).toBe('しかるべき');
    // Non-kana alternate (the other Chinese script) is never a Japanese reading.
    expect(entryReading(entry({ head: '說', alternate: '说' }), 'ja')).toBeNull();
  });

  it('reads pinyin/jyutping from pronunciation for Chinese', () => {
    const zh = entry({ head: '青豆', pronunciation: 'qīng dòu' });
    expect(entryReading(zh, 'zh')).toBe('qīng dòu');
    const yue = entry({ head: '呢個', pronunciation: 'ni1 go3', phonetic_detail: { jyutping: 'ni1 go3' } });
    expect(entryReading(yue, 'yue')).toBe('ni1 go3');
  });

  it('reads romanization for Korean and Thai', () => {
    expect(entryReading(entry({ head: '학교', phonetic_detail: { romanization: 'hakgyo' } }), 'ko')).toBe('hakgyo');
    expect(entryReading(entry({ head: 'ประเทศ', phonetic_detail: { romanization: 'bprà-têet', ipa: 'x' } }), 'th')).toBe('bprà-têet');
  });

  it('falls back to pronunciation, then romanization/ipa, for other languages', () => {
    expect(entryReading(entry({ head: 'привет', pronunciation: 'privet' }), 'ru')).toBe('privet');
    expect(entryReading(entry({ head: 'bonjour', pronunciation: '', phonetic_detail: { ipa: 'bɔ̃.ʒuʁ' } }), 'fr')).toBe('bɔ̃.ʒuʁ');
    expect(entryReading(null, 'en')).toBeNull();
  });

  it('matches the surface form against head (and both Chinese script forms)', () => {
    const zh = entry({ head: '青豆', han_script: { simplified: '青豆', traditional: '青豆' } });
    expect(entryMatchesSurface(zh, '青豆', 'zh')).toBe(true);
    const trad = entry({ head: '青豆', han_script: { simplified: '青豆', traditional: '靑豆' } });
    expect(entryMatchesSurface(trad, '靑豆', 'zh')).toBe(true);
    // Non-Chinese languages require an exact head match.
    const ko = entry({ head: '학교', han_script: { hangul: '학교', hanja: '學校' } });
    expect(entryMatchesSurface(ko, '학교', 'ko')).toBe(true);
    expect(entryMatchesSurface(ko, '학굔', 'ko')).toBe(false);
  });

  it('overrides the lemmatizer reading only for an exact head match', () => {
    const ko = entry({ head: '학교', phonetic_detail: { romanization: 'hakgyo' } });
    expect(savedEntryReading({ savedEntry: ko, surface: '학교', l2Code: 'ko' })).toBe('hakgyo');
    // Inflected surface: the head word is a different word, so keep the
    // lemmatizer's reading.
    expect(savedEntryReading({ savedEntry: ko, surface: '학교에', l2Code: 'ko' })).toBeNull();
    expect(savedEntryReading({ savedEntry: null, surface: '학교', l2Code: 'ko' })).toBeNull();
  });

  it('returns null when the entry reading equals the surface (no ruby needed)', () => {
    const ja = entry({ head: 'たべる', phonetic_detail: { kana: 'たべる' } });
    expect(savedEntryReading({ savedEntry: ja, surface: 'たべる', l2Code: 'ja' })).toBeNull();
  });
});
