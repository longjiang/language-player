/**
 * Ordering helpers for the drag list (SPEC-095, D ➋).
 *
 * Pure and platform-agnostic: the web and mobile components both use these, so the rule for
 * "where does a row land" and "what order do the stored positions describe" is written once.
 * Positions are 1-based, because that is what the workbook prints and what the blanks hold.
 */

/** The minimum a row needs for ordering: an id, its position blank, and whether it is pinned. */
export interface OrderRow {
  id: string;
  blankId: string;
  locked?: boolean;
}

/**
 * The order the stored positions describe, or the authored order when they do not describe one.
 *
 * A reload restores the student's arrangement from the position blanks; an untouched task has no
 * positions yet and falls back to the authored order. Anything incomplete or duplicated (a
 * mid-write, a hand-edited store) also falls back, so the list can never render two rows in one
 * slot or drop one.
 */
export function orderFromPositions(
  rows: OrderRow[],
  responses: Record<string, string>,
): string[] {
  const authored = rows.map((row) => row.id);
  const positions = new Map<string, number>();
  for (const row of rows) {
    const value = Number(responses[row.blankId]);
    if (!Number.isInteger(value) || value < 1 || value > rows.length) return authored;
    positions.set(row.id, value);
  }
  if (new Set(positions.values()).size !== rows.length) return authored;
  return [...rows]
    .sort((a, b) => positions.get(a.id)! - positions.get(b.id)!)
    .map((row) => row.id);
}

/** True when two orders are the same — used to keep the adopt-stored-order effect settling. */
export function sameOrder(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

/**
 * Move `fromId` onto `toId`'s place, keeping every locked row in its own slot.
 *
 * Only draggable rows take part in the shuffle, then the full list is rebuilt slot by slot:
 * locked rows hold the slots they were authored in, and the reordered draggable rows fill the
 * rest. That is what lets D ➋ pin ① 路线 at the top while the other four move among themselves.
 */
export function moveRow(
  order: string[],
  rows: OrderRow[],
  fromId: string,
  toId: string,
): string[] {
  const locked = new Set(rows.filter((row) => row.locked).map((row) => row.id));
  if (locked.has(fromId) || locked.has(toId)) return order;

  const draggable = order.filter((id) => !locked.has(id));
  const from = draggable.indexOf(fromId);
  const to = draggable.indexOf(toId);
  if (from < 0 || to < 0 || from === to) return order;

  const next = [...draggable];
  next.splice(from, 1);
  next.splice(to, 0, fromId);

  let cursor = 0;
  return order.map((id) => (locked.has(id) ? id : next[cursor++]!));
}

/** Move a draggable row by `delta` places — the keyboard / accessibility path. */
export function moveRowBy(
  order: string[],
  rows: OrderRow[],
  id: string,
  delta: number,
): string[] {
  const locked = new Set(rows.filter((row) => row.locked).map((row) => row.id));
  if (locked.has(id)) return order;
  const draggable = order.filter((current) => !locked.has(current));
  const from = draggable.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= draggable.length) return order;
  return moveRow(order, rows, id, draggable[to]!);
}
