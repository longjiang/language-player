// @/src/furigana.ts

interface FuriganaInput {
  text: string;
  pronunciation: string;
}

export interface FuriganaSegment {
  text: string;
  pronunciation: string;
}

const isKanji = (char: string): boolean => char >= '\u4e00' && char <= '\u9faf';
const isKatakana = (char: string): boolean => char >= '\u30A0' && char <= '\u30FF';

function convertKatakanaToHiragana(text: string): string {
  return text.replace(/[\u30A0-\u30FF]/g, char => 
    String.fromCharCode(char.charCodeAt(0) - 0x60)
  );
}

function segmentText(text: string): FuriganaSegment[] {
  const segments: FuriganaSegment[] = [];
  let currentSegment: FuriganaSegment | null = null;

  for (const char of text) {
    const isKanjiChar = isKanji(char);

    if (!currentSegment || isKanji(currentSegment.text[0]) !== isKanjiChar) {
      if (currentSegment) segments.push(currentSegment);
      currentSegment = { text: char, pronunciation: '' };
    } else {
      currentSegment.text += char;
    }
  }

  if (currentSegment) segments.push(currentSegment);
  return segments;
}

export function addFurigana({ text, pronunciation }: FuriganaInput): FuriganaSegment[] {
  const segments = segmentText(text);
  const hiraganaReading = convertKatakanaToHiragana(pronunciation);
  let readingIndex = 0;

  for (const segment of segments) {
    if (!isKanji(segment.text[0])) {
      segment.pronunciation = segment.text;
      readingIndex += segment.text.length;
    } else {
      const remainingReading = hiraganaReading.slice(readingIndex);
      const match = remainingReading.match(new RegExp(`^${segment.text.length === 1 ? '.' : '.+'}`));
      if (match) {
        segment.pronunciation = match[0];
        readingIndex += segment.pronunciation.length;
      }
    }
  }

  return segments;
}

// Example usage
function test(): void {
  const testCases: FuriganaInput[] = [
    { text: '乗り遅れる', pronunciation: 'のりおくれる' },
    { text: '朝ご飯', pronunciation: 'あさごはん' },
    { text: '食べ物', pronunciation: 'たべもの' },
    { text: 'お金', pronunciation: 'おかね' },
    { text: 'お弁当', pronunciation: 'おべんとう' },
    { text: '食パン', pronunciation: 'しょくぱん' },
    { text: '占める', pronunciation: 'しめる' }
  ];

  testCases.forEach(input => {
    console.log(`${input.text} (${input.pronunciation}):`, addFurigana(input));
  });
}