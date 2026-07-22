// @/src/furigana.ts
//
// Re-exported from @langplayer/utils for cross-platform consistency.
// The shared implementations are based on this file's original logic
// plus Classic's map-kana.js, with improved chōonpu (long vowel) handling.

export { katakanaToHiragana, buildRuby } from '@langplayer/utils';
export type { FuriganaSegment as Segment, RubySegment } from '@langplayer/utils';

import { matchHiragana as sharedMatchHiragana, FuriganaSegment } from '@langplayer/utils';

/**
 * Match a Japanese word's kanji/kana surface form against its reading.
 * GO-compatible wrapper — accepts `pronunciation` instead of `reading`.
 */
export function matchHiragana({
  text,
  pronunciation,
}: {
  text: string;
  pronunciation: string;
}): FuriganaSegment[] {
  return sharedMatchHiragana({ text, reading: pronunciation });
}