import type { SavedLexicalItemRecord } from '@langplayer/shared';

/**
 * Pending-op queue for the SPEC-034 saved-words row API (shared web/mobile).
 *
 * Local saves/deletes are enqueued and replayed against Flask PUT/DELETE.
 * The queue is keyed by (l2, wordId): a newer op replaces an older one for the
 * same word, so a retry can never clobber a newer user action.
 */

export interface PendingSavedWordOp {
  type: 'put' | 'delete';
  l2: string;
  wordId: string;
  word?: SavedLexicalItemRecord;
  updatedAt: number;
}

export interface SavedWordRowApi {
  putSavedWord: (l2: string, word: SavedLexicalItemRecord) => Promise<unknown>;
  deleteSavedWord: (l2: string, wordId: string) => Promise<unknown>;
}

export function pendingOpKey(op: PendingSavedWordOp): string {
  return `${op.l2}\u0000${op.wordId}`;
}

/** Add an op, replacing any older op for the same (l2, wordId). */
export function enqueuePendingOp(queue: PendingSavedWordOp[], op: PendingSavedWordOp): PendingSavedWordOp[] {
  const key = pendingOpKey(op);
  return [...queue.filter(q => pendingOpKey(q) !== key), op];
}

/** Keep only the newest op per (l2, wordId), in timestamp order. */
export function reducePendingOps(queue: PendingSavedWordOp[]): PendingSavedWordOp[] {
  const latest = new Map<string, PendingSavedWordOp>();
  for (const op of queue) latest.set(pendingOpKey(op), op);
  return [...latest.values()].sort((a, b) => a.updatedAt - b.updatedAt);
}

/**
 * Replay ops in order; stop at the first failure. Returns the ops that still
 * need to be retried (the failed one plus everything after it).
 */
export async function flushPendingOps(
  queue: PendingSavedWordOp[],
  api: SavedWordRowApi,
): Promise<PendingSavedWordOp[]> {
  const ops = reducePendingOps(queue);
  const remaining: PendingSavedWordOp[] = [];
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]!;
    try {
      if (op.type === 'put' && op.word) {
        await api.putSavedWord(op.l2, op.word);
      } else {
        await api.deleteSavedWord(op.l2, op.wordId);
      }
    } catch {
      remaining.push(...ops.slice(i));
      break;
    }
  }
  return remaining;
}
