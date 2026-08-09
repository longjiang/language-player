import { describe, expect, it } from 'vitest';
import { romanize, ROMANIZABLE_LANGS } from './romanize';

describe('romanize', () => {
  it('romanizes Korean with koroman (RR + pronunciation rules)', () => {
    // Corpus mirrors zerotohero-python-server/test_romanize.py — the npm
    // koroman package is the same codebase as the PyPI package the server
    // uses, so these must stay byte-identical to the online API.
    const cases: Record<string, string> = {
      '안녕하세요': 'annyeonghaseyo',
      '사랑해요': 'saranghaeyo',
      '좋아합니다': 'joahamnida',
      '한국어': 'hangugeo',
      '읽다': 'ikda',
      '없다': 'eopda',
      '밟다': 'bapda',
      '국물': 'gungmul',
      '닭고기': 'dakgogi',
      '맛있다': 'masitda',
      '없어요': 'eopseoyo',
      '꽃이': 'kkochi',
      '곧이': 'goji',
      '같이': 'gachi',
      '꽃잎': 'kkonnip',
      '좋아요': 'joayo',
    };
    for (const [text, expected] of Object.entries(cases)) {
      expect(romanize(text, 'ko')).toBe(expected);
    }
  });

  it('passes non-Hangul through in Korean', () => {
    expect(romanize('안녕하세요, 반갑습니다! 123 ABC', 'ko')).toBe(
      'annyeonghaseyo, bangapseumnida! 123 abc',
    );
  });

  it('matches the server Cyrillic char maps', () => {
    expect(romanize('Привет, как дела?', 'ru')).toBe('Privet, kak dela?');
    expect(romanize('Щъркелът лети в небето', 'bg')).toBe('Shtarkelat leti v nebeto');
    expect(romanize('Привіт, як справи? Їжте її ґанок', 'uk')).toBe(
      'Privit, yak spravi? Yizhte yiyi ganok',
    );
  });

  it('matches the server Greek/Armenian/Georgian char maps', () => {
    expect(romanize('Καλημέρα, πώς είσαι; Ελληνική', 'el')).toBe(
      'Kalimera, pos eisai; Elliniki',
    );
    expect(romanize('Բարև ձեզ։ Հայերեն լեզու', 'hy')).toBe(
      'Barev jez։ Hayeren lezow',
    );
    expect(romanize('გამარჯობა, როგორ ხარ? ქართული', 'ka')).toBe(
      "gamarjoba, rogor khar? k'artuli",
    );
  });

  it('transliterates Arabic to the server SAMPA scheme', () => {
    expect(romanize('مرحبًا', 'ar')).toBe('mrxbana:');
    expect(romanize('الإنسان', 'ar')).toBe('a:l?nsa:n');
    expect(romanize('أنا', 'ar')).toBe('?na:');
    expect(romanize('صديقي', 'ar')).toBe("s'djqj");
    expect(romanize('لحظة', 'ar')).toBe("lxD'h");
  });

  it('handles registry aliases and unsupported languages', () => {
    expect(ROMANIZABLE_LANGS.has('ko')).toBe(true);
    expect(ROMANIZABLE_LANGS.has('kor')).toBe(true);
    expect(ROMANIZABLE_LANGS.has('rus')).toBe(true);
    expect(romanize('안녕', 'kor')).toBe('annyeong');
    expect(romanize('你好', 'zh')).toBeUndefined();
    expect(romanize('hello', 'en')).toBeUndefined();
  });
});
