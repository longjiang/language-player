import { describe, expect, it } from 'vitest';
import { anchoredTracks, trackForAnyBlank, trackForBlank, unanchoredTracks } from './audio';
import type { AudioTrack } from './types';

const TRACKS: AudioTrack[] = [
  // A ➊ style: no anchor, belongs to the task as a whole.
  { key: 'a.mp3', label: '上海' },
  { key: 'b.mp3', label: '北京' },
  // A ➌ style: anchored to the first blank of a row.
  { key: 'c.mp3', label: '李婷婷', blankId: 'b1' },
  { key: 'd.mp3', label: '金敏俊', blankId: 'b3' },
];

describe('track placement helpers', () => {
  it('separates the task-level row from the item-bound tracks', () => {
    expect(unanchoredTracks(TRACKS).map((t) => t.key)).toEqual(['a.mp3', 'b.mp3']);
    expect(anchoredTracks(TRACKS).map((t) => t.key)).toEqual(['c.mp3', 'd.mp3']);
  });

  it('finds a track by its anchor', () => {
    expect(trackForBlank(TRACKS, 'b1')?.key).toBe('c.mp3');
    expect(trackForBlank(TRACKS, 'b3')?.key).toBe('d.mp3');
  });

  it('returns nothing for a blank with no track, so a widget can render unconditionally', () => {
    expect(trackForBlank(TRACKS, 'b2')).toBeUndefined();
    expect(trackForBlank(TRACKS, undefined)).toBeUndefined();
  });

  it('finds the track for an item that spans several blanks', () => {
    // A ➌ anchors to the row's first blank; the row also owns b2/b4.
    expect(trackForAnyBlank(TRACKS, ['b2', 'b1'])?.key).toBe('c.mp3');
    expect(trackForAnyBlank(TRACKS, ['b2', 'b4'])).toBeUndefined();
  });

  it('treats missing audio as empty rather than throwing', () => {
    expect(unanchoredTracks(undefined)).toEqual([]);
    expect(anchoredTracks(undefined)).toEqual([]);
    expect(trackForBlank(undefined, 'b1')).toBeUndefined();
    expect(trackForAnyBlank(undefined, ['b1'])).toBeUndefined();
  });

  it('does not mutate its input', () => {
    const before = JSON.stringify(TRACKS);
    unanchoredTracks(TRACKS);
    anchoredTracks(TRACKS);
    expect(JSON.stringify(TRACKS)).toBe(before);
  });
});
