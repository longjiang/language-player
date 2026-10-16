/**
 * Outbox payload parsing (SPEC-053).
 *
 * An outbox row's `payload` is a JSON string written when the mutation was
 * queued. It can be unreadable later — a torn write, or a row written by an
 * older build — and both places that read the queue used to `JSON.parse` it
 * inside a `map`/`Promise.all`:
 *
 * - `pushOutbox` rejected the whole request, so ONE corrupt row stopped every
 *   other queued op from syncing, permanently.
 * - `getOutboxSnapshot` rejected, so the pending markers on notes and the
 *   pending count failed to load.
 *
 * Splitting the rows first keeps the failure local to the row that caused it.
 */

/** The minimum a row must expose to be split. */
export interface OutboxPayloadRow {
  payload: string;
}

/** A usable row: the original row plus its parsed payload. */
export type ParsedOutboxRow<T extends OutboxPayloadRow> = T & {
  parsedPayload: Record<string, unknown>;
};

export interface SplitOutboxRows<T extends OutboxPayloadRow> {
  usable: Array<ParsedOutboxRow<T>>;
  corrupt: T[];
}

/**
 * Split rows into those whose payload parses to a JSON object and those that do
 * not. Never throws.
 *
 * A JSON value that is not an object (an array, a string, `null`) is treated as
 * corrupt: the sync protocol sends `payload` as an object, and passing anything
 * else would be rejected by the server anyway.
 */
export function splitOutboxRows<T extends OutboxPayloadRow>(rows: T[]): SplitOutboxRows<T> {
  const usable: Array<ParsedOutboxRow<T>> = [];
  const corrupt: T[] = [];
  for (const row of rows) {
    let value: unknown;
    try {
      value = JSON.parse(row.payload);
    } catch {
      corrupt.push(row);
      continue;
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      corrupt.push(row);
      continue;
    }
    usable.push({ ...row, parsedPayload: value as Record<string, unknown> });
  }
  return { usable, corrupt };
}
