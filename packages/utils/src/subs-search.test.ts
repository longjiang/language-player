import { describe, expect, it } from 'vitest';
import type { SubsSearchVideo } from '@langplayer/shared';
import {
  CONTEXT_GROUP_PLACEHOLDER,
  applyFilterAndSort,
  contextChar,
  durationToSeconds,
} from './subs-search';

function video(id: number, line: string, extra: Partial<SubsSearchVideo> = {}): SubsSearchVideo {
  return {
    id,
    title: `video ${id}`,
    youtube_id: `y${id}`,
    subs_l2: [{ starttime: 0, line }],
    matchLineIndex: 0,
    ...extra,
  };
}

describe('durationToSeconds', () => {
  it('parses ISO 8601 durations', () => {
    expect(durationToSeconds('PT6M52S')).toBe(412);
    expect(durationToSeconds('PT1H30M')).toBe(5400);
    expect(durationToSeconds('P1DT2H3M4S')).toBe(93784);
    expect(durationToSeconds('PT0S')).toBe(0);
  });

  it('passes plain numbers and numeric strings through', () => {
    expect(durationToSeconds(412)).toBe(412);
    expect(durationToSeconds('123')).toBe(123);
  });

  it('returns undefined for unparseable values', () => {
    expect(durationToSeconds('PT6M52')).toBeUndefined();
    expect(durationToSeconds('banana')).toBeUndefined();
    expect(durationToSeconds(null)).toBeUndefined();
    expect(durationToSeconds(undefined)).toBeUndefined();
    expect(durationToSeconds(Number.NaN)).toBeUndefined();
  });
});

describe('contextChar', () => {
  const v = video(1, 'これっぽっちも無い');

  it('returns the char before the first term occurrence', () => {
    expect(contextChar(v, 'っぽっち', 'left')).toBe('れ');
  });

  it('returns the char after the term', () => {
    expect(contextChar(v, 'っぽっち', 'right')).toBe('も');
  });

  it('handles comma-separated inflected forms, picking the earliest match', () => {
    const v2 = video(2, '彼は歩いた。歩くのは楽しい。');
    // 歩いた (earliest form) sits at index 2 → left char is は, right is 。.
    expect(contextChar(v2, '歩く,歩いた', 'left')).toBe('は');
    expect(contextChar(v2, '歩く,歩いた', 'right')).toBe('。');
  });

  it('returns empty at the line edge', () => {
    expect(contextChar(video(3, 'っぽっちです'), 'っぽっち', 'left')).toBe('');
    expect(contextChar(video(3, 'っぽっちです'), 'っぽっち', 'right')).toBe('で');
  });

  it('returns empty when the term never appears', () => {
    expect(contextChar(v, 'ないもの', 'left')).toBe('');
  });
});

describe('applyFilterAndSort', () => {
  const list = [
    video(1, 'short', { views: 100, date: '2026-01-01', duration: 10 }),
    video(2, 'a much longer matched line here', { views: 300, date: '2026-03-01', duration: 20 }),
    video(3, 'mid length line', { views: 200, date: '2026-02-01', duration: 30 }),
  ];

  it('sorts by views descending by default', () => {
    expect(applyFilterAndSort(list, '', 'views', 'line').map((v) => v.id)).toEqual([2, 3, 1]);
  });

  it('sorts by date descending', () => {
    expect(applyFilterAndSort(list, '', 'date', 'line').map((v) => v.id)).toEqual([2, 3, 1]);
  });

  it('sorts by matched-line length ascending', () => {
    expect(applyFilterAndSort(list, '', 'length', 'line').map((v) => v.id)).toEqual([1, 3, 2]);
  });

  it('filters by title or line text', () => {
    const filtered = applyFilterAndSort(list, 'longer', 'views', 'line');
    expect(filtered.map((v) => v.id)).toEqual([2]);
  });

  it('keeps input order for ai sort', () => {
    expect(applyFilterAndSort(list, '', 'ai', 'line').map((v) => v.id)).toEqual([1, 2, 3]);
  });

  it('orders left-context groups largest-first, then boundary char', () => {
    const rows = [
      video(1, 'xとっぽっちa', { views: 1 }),
      video(2, 'yっぽっちb', { views: 2 }),
      video(3, 'zっぽっちc', { views: 3 }),
      video(4, 'wっぽっちd', { views: 4 }),
      video(5, 'vっぽっちe', { views: 5 }),
      video(6, 'uっぽっちf', { views: 6 }),
    ];
    const sorted = applyFilterAndSort(rows, '', 'leftContext', 'っぽっち');
    const keys = sorted.map((v) => contextChar(v, 'っぽっち', 'left') || CONTEXT_GROUP_PLACEHOLDER);
    // Each boundary char appears exactly once here, so alphabetical order.
    expect(keys).toEqual([...keys].sort((a, b) => a.localeCompare(b)));
  });
});
