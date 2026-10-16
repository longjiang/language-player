import { describe, it, expect } from 'vitest';
import { splitOutboxRows } from './outbox-payload';

/**
 * One unreadable outbox payload must not stop the rest of the queue from
 * syncing (SPEC-053).
 *
 * `pushOutbox` used to `JSON.parse` every row inside the `Promise.all` that
 * built the request body, so a single corrupt row rejected the whole push — no
 * op synced, ever again — and `getOutboxSnapshot` rejected, hiding every other
 * pending op from the notes list and the pending count.
 */

const row = (id: string, payload: string) => ({
  id,
  entity: 'note',
  entity_id: `n${id}`,
  op: 'upsert',
  payload,
  attempts: 0,
});

describe('splitOutboxRows', () => {
  it('keeps the readable rows and isolates the corrupt one', () => {
    const { usable, corrupt } = splitOutboxRows([
      row('1', '{"text":"hello"}'),
      row('2', '{not json'),
      row('3', '{"text":"world"}'),
    ]);

    expect(usable.map((r) => r.id)).toEqual(['1', '3']);
    expect(usable[0]!.parsedPayload).toEqual({ text: 'hello' });
    expect(corrupt.map((r) => r.id)).toEqual(['2']);
  });

  it('treats a non-object JSON value as corrupt', () => {
    const { usable, corrupt } = splitOutboxRows([
      row('1', '["array"]'),
      row('2', '"string"'),
      row('3', 'null'),
      row('4', '42'),
      row('5', '{}'),
    ]);

    expect(usable.map((r) => r.id)).toEqual(['5']);
    expect(corrupt.map((r) => r.id)).toEqual(['1', '2', '3', '4']);
  });

  it('never throws, even for an empty queue', () => {
    expect(splitOutboxRows([])).toEqual({ usable: [], corrupt: [] });
  });
});
