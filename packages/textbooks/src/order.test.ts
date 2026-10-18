import { describe, expect, it } from 'vitest';
import { moveRow, moveRowBy, orderFromPositions, sameOrder, type OrderRow } from './order';

/**
 * D ➋'s list: ① 路线 is the printed worked example, so it is `locked` in the first slot; the
 * other four move among the remaining slots.
 */
const rows: OrderRow[] = [
  { id: 'route', blankId: 'b1', locked: true },
  { id: 'hours', blankId: 'b3' },
  { id: 'platform', blankId: 'b5' },
  { id: 'tickets', blankId: 'b7' },
  { id: 'other', blankId: 'b9' },
];
const authored = rows.map((row) => row.id);
const responses = (positions: Record<string, number>) =>
  Object.fromEntries(rows.map((row) => [row.blankId, String(positions[row.id])]));

describe('orderFromPositions', () => {
  it('reads the stored order when every row has a unique position', () => {
    const stored = responses({ route: 1, hours: 4, platform: 3, tickets: 2, other: 5 });
    expect(orderFromPositions(rows, stored)).toEqual(['route', 'tickets', 'platform', 'hours', 'other']);
  });

  it('falls back to the authored order while the positions are incomplete', () => {
    expect(orderFromPositions(rows, {})).toEqual(authored);
    expect(
      orderFromPositions(rows, { b1: '1', b3: '2', b5: '3' }),
    ).toEqual(authored);
  });

  it('falls back when two rows claim the same position', () => {
    const duplicate = responses({ route: 1, hours: 2, platform: 2, tickets: 3, other: 4 });
    expect(orderFromPositions(rows, duplicate)).toEqual(authored);
  });

  it('falls back on a position outside the list', () => {
    const outside = responses({ route: 1, hours: 2, platform: 3, tickets: 4, other: 9 });
    expect(orderFromPositions(rows, outside)).toEqual(authored);
  });
});

describe('moveRow', () => {
  it('moves a draggable row onto another draggable row’s place', () => {
    expect(moveRow(authored, rows, 'tickets', 'hours')).toEqual([
      'route',
      'tickets',
      'hours',
      'platform',
      'other',
    ]);
  });

  it('keeps the locked worked example in its slot', () => {
    const moved = moveRow(authored, rows, 'other', 'hours');
    expect(moved[0]).toBe('route');
    expect(moved.filter((id) => id !== 'route')).toHaveLength(4);
    expect(moved[1]).toBe('other');
  });

  it('refuses to move the locked row, or to move anything onto it', () => {
    expect(moveRow(authored, rows, 'route', 'hours')).toEqual(authored);
    expect(moveRow(authored, rows, 'hours', 'route')).toEqual(authored);
  });

  it('is a no-op when the source and target are the same', () => {
    expect(moveRow(authored, rows, 'hours', 'hours')).toEqual(authored);
  });

  it('only reorders the draggable rows, never the locked ones', () => {
    const moved = moveRow(authored, rows, 'hours', 'other');
    expect(moved).toEqual(['route', 'platform', 'tickets', 'other', 'hours']);
  });
});

describe('moveRowBy', () => {
  it('moves one place up or down', () => {
    expect(moveRowBy(authored, rows, 'tickets', -1)).toEqual([
      'route',
      'hours',
      'tickets',
      'platform',
      'other',
    ]);
    expect(moveRowBy(authored, rows, 'hours', 1)).toEqual([
      'route',
      'platform',
      'hours',
      'tickets',
      'other',
    ]);
  });

  it('stays inside the draggable range', () => {
    expect(moveRowBy(authored, rows, 'hours', -1)).toEqual(authored);
    expect(moveRowBy(authored, rows, 'other', 1)).toEqual(authored);
    expect(moveRowBy(authored, rows, 'route', 1)).toEqual(authored);
  });
});

describe('sameOrder', () => {
  it('compares by content', () => {
    expect(sameOrder(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(sameOrder(['a', 'b'], ['b', 'a'])).toBe(false);
    expect(sameOrder(['a'], ['a', 'b'])).toBe(false);
  });
});
