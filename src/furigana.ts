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
  let converted = '';
  for (let char of katakana) {
    if (wanakana.isKatakana(char)) converted += wanakana.toHiragana(char);
    else converted += char;
  }
  return converted;
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

export function addFurigana({ text, pronunciation }: { text: string; pronunciation: string }): { text: string; pronunciation: string }[] {
  let segments = segmentKanjisAndNonKanjis(text);
  let readings = pronunciation.match(createRegex(segments));
  if (readings) {
    readings = readings.slice(1);
    for (let index in segments) {
      let segment = segments[index];
      segment.pronunciation = readings[index];
    }
    return segments.map(segment => ({ text: segment.text, pronunciation: convertKatakanaToHiragana(segment.pronunciation) }));
  } else {
    return [{ text, pronunciation }];
  }
}

function test(): void {
  console.log(addFurigana({ text: '乗り遅れる', pronunciation: 'のりおくれる' }));
  console.log(addFurigana({ text: '朝ご飯', pronunciation: 'あさごはん' }));
  console.log(addFurigana({ text: '食べ物', pronunciation: 'たべもの' }));
  console.log(addFurigana({ text: 'お金', pronunciation: 'おかね' }));
  console.log(addFurigana({ text: 'お弁当', pronunciation: 'おべんとう' }));
  console.log(addFurigana({ text: '食パン', pronunciation: 'しょくぱん' }));
  console.log(addFurigana({ text: '占める', pronunciation: 'しめる' }));
}