/**
 * Textbook task-state ops through the durable outbox (SPEC-111, mobile).
 *
 * The store writes locally first; this turns a change between two snapshots into
 * the same ops the web bridge queues (`collectTaskOps` is shared, so the two
 * platforms cannot disagree about what changed). `enqueueSyncOp` writes the
 * outbox row and schedules a flush, which is the whole reason this is not a
 * direct fetch: a task answered offline must reach the server later.
 */

import { collectTaskOps, type PersistedTaskState } from '@langplayer/textbooks';
import { log } from '@/lib/logger';
import { enqueueSyncOp } from './sync-engine';

export async function enqueueTaskChanges(
  taskId: string,
  contentVersion: number,
  prev: PersistedTaskState,
  next: PersistedTaskState,
): Promise<number> {
  const drafts = collectTaskOps(taskId, contentVersion, prev, next);
  for (const draft of drafts) {
    await enqueueSyncOp({
      entity: draft.entity,
      entityId: draft.entity_id,
      op: 'upsert',
      payload: draft.payload,
      updatedAt: draft.updated_at,
    });
  }
  if (drafts.length > 0) {
    log(`[LP Mobile] Task sync: queued ${drafts.length} op(s) for ${taskId}`);
  }
  return drafts.length;
}
