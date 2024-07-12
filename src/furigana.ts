import wanakana from 'wanakana';

// Define types for the segments
export type Segment = {
  type: 'kanji' | 'non-kanji';
  text: string;
  pronunciation: string;
};

// helper function to check if a character is a kanji
function isKanji(char: string): boolean {
  // use Unicode range for kanji characters
  return char >= '\u4e00' && char <= '\u9faf';
}

// helper function to check if a character is a hiragana
function isHiragana(char: string): boolean {
  // use Unicode range for hiragana characters
  return char >= '\u3040' && char <= '\u309f';
}

function segmentKanjisAndNonKanjis(text: string): Segment[] {
  let normalized = convertKatakanaToHiragana(text);
  const regex = /([\u4e00-\u9faf]+|[^\u4e00-\u9faf]+)/g;
  const segments = normalized.match(regex);
  const originalSegments = text.match(regex);
  let parts: Segment[] = [];
  let i = 0;
  while (segments && originalSegments && i < segments.length) {
    if (isKanji(segments[i][0])) {
      parts.push({
        type: 'kanji',
        text: originalSegments[i],
        pronunciation: segments[i]
      });
    } else {
      parts.push({
        type: 'non-kanji',
        text: originalSegments[i],
        pronunciation: segments[i]
      });
    }
    i++;
  }
  return parts;
}

function convertKatakanaToHiragana(katakana: string): string {
  return wanakana.toHiragana(katakana)
}

function sanitizeRegexString(str: string): string {
  // Escape special characters
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function createRegex(segments: Segment[]): RegExp {
  let regexStr = '';
  for (let segment of segments) {
    if (segment.type === 'kanji') regexStr += '(.+)';
    else regexStr += `(${sanitizeRegexString(segment.pronunciation)})`;
  }
  return new RegExp(regexStr);
}

// Pronunciation will be auto-converted to hiragana
export function matchHiragana({ text, pronunciation }: { text: string; pronunciation: string }): { text: string; pronunciation: string }[] {
  if (!isHiragana(pronunciation[0])) pronunciation = convertKatakanaToHiragana(pronunciation);
  let segments = segmentKanjisAndNonKanjis(text);
  let readings = pronunciation.match(createRegex(segments));
  if (readings) {
    readings = readings.slice(1);
    for (let index in segments) {
      let segment = segments[index];
      segment.pronunciation = readings[index];
    }
    return segments
  } else {
    return [{ text, pronunciation }];
  }
}

function test(): void {
  console.log(matchHiragana({ text: '乗り遅れる', pronunciation: 'のりおくれる' })); // [{"pronunciation": "の", "text": "乗"}, {"pronunciation": "り", "text": "り"}, {"pronunciation": "おく", "text": "遅"}, {"pronunciation": "れる", "text": "れる"}]
  console.log(matchHiragana({ text: '朝ご飯', pronunciation: 'あさごはん' })); // [{"pronunciation": "あさ", "text": "朝"}, {"pronunciation": "ご", "text": "ご"}, {"pronunciation": "はん", "text": "飯"}]
  console.log(matchHiragana({ text: '食べ物', pronunciation: 'たべもの' })); // [{"pronunciation": "た", "text": "食"}, {"pronunciation": "べ", "text": "べ"}, {"pronunciation": "もの", "text": "物"}]
  console.log(matchHiragana({ text: 'お金', pronunciation: 'おかね' })); // [{"pronunciation": "お", "text": "お"}, {"pronunciation": "かね", "text": "金"}]
  console.log(matchHiragana({ text: 'お弁当', pronunciation: 'おべんとう' })); // [{"pronunciation": "お", "text": "お"}, {"pronunciation": "べんとう", "text": "弁当"}]
  console.log(matchHiragana({ text: '食パン', pronunciation: 'しょくぱん' })); // [{"pronunciation": "しょく", "text": "食"}, {"pronunciation": "ぱん", "text": "パン"}]
  console.log(matchHiragana({ text: '占める', pronunciation: 'しめる' })); // [{"pronunciation": "し", "text": "占"}, {"pronunciation": "める", "text": "める"}]
}