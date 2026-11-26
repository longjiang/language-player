/**
 * Pure helpers for task-state sync (SPEC-111).
 *
 * Shared by both apps: the web bridge and the mobile bridge must agree on what a
 * server row means and what changed locally, or the same answers merge
 * differently on the two platforms.
 *
 * Kept out of the React bridge so the two decisions that matter — what a server
 * row means for this device, and what changed locally since the last snapshot —
 * are testable without a session, a fetch or a renderer.
 */

import type { AttemptRecord, PersistedTaskState, RemoteTaskState } from './store';

export interface TaskStateRow {
  taskId: string;
  blankId?: string;
  contentVersion: number;
  value?: string;
  updatedAt?: number;
  responses?: Record<string, string>;
  result?: unknown;
  submittedAt?: number;
  [key: string]: unknown;
}

export interface TaskStateResponse {
  responses: Array<{ taskId: string; blankId: string; contentVersion: number; value: string; updatedAt: number }>;
  attempts: Array<{
    taskId: string;
    contentVersion: number;
    responses: Record<string, string>;
    result: AttemptRecord['result'] | null;
    submittedAt: number;
  }>;
  files: Array<{
    fileId: string;
    kind: string;
    ownerType: string;
    ownerId: string;
    slot: string;
    mime: string;
    byteSize: number;
    durationMs: number | null;
    createdAt: number;
  }>;
}

const EMPTY: TaskStateResponse = { responses: [], attempts: [], files: [] };

export function emptyTaskState(): TaskStateResponse {
  return { ...EMPTY, responses: [], attempts: [], files: [] };
}

/**
 * The rows that apply to one task, filtered by content version.
 *
 * A row written against another content version is stale (the task was
 * re-authored): it is ignored rather than deleted, so a content revert restores it.
 */
export function remoteStateForTask(
  taskId: string,
  state: TaskStateResponse | null,
  contentVersion: number,
): RemoteTaskState {
  if (!state) return {};
  const responses: NonNullable<RemoteTaskState['responses']> = {};
  for (const row of state.responses ?? []) {
    if (row.taskId !== taskId || row.contentVersion !== contentVersion) continue;
    responses[row.blankId] = { value: row.value, updatedAt: row.updatedAt };
  }
  const attemptRow = (state.attempts ?? []).find(
    (row) => row.taskId === taskId && row.contentVersion === contentVersion,
  );
  const attempt: AttemptRecord | null = attemptRow
    ? {
        taskId,
        contentVersion: attemptRow.contentVersion,
        responses: attemptRow.responses ?? {},
        result: attemptRow.result ?? null,
        submittedAt: attemptRow.submittedAt,
      }
    : null;
  return { responses, attempt };
}

/** Live recording slots per task, from the file metadata `/tasks/state` returns. */
export function liveRecordingSlotsByTask(
  state: TaskStateResponse | null,
): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const file of state?.files ?? []) {
    if (file.kind !== 'task_recording' || file.ownerType !== 'task') continue;
    const slots = out.get(file.ownerId) ?? new Set<string>();
    slots.add(file.slot);
    out.set(file.ownerId, slots);
  }
  return out;
}

export interface TaskSyncOpDraft {
  entity: 'task_response' | 'task_attempt';
  entity_id: string;
  payload: Record<string, unknown>;
  updated_at: number;
}

/**
 * The ops implied by moving from `prev` to `next`.
 *
 * Responses are compared per blank on value **and** timestamp, so an adoption
 * that only bumps a timestamp does not look like a student edit. A new attempt is
 * one with a different `submittedAt`.
 */
export function collectTaskOps(
  taskId: string,
  contentVersion: number,
  prev: PersistedTaskState,
  next: PersistedTaskState,
): TaskSyncOpDraft[] {
  const ops: TaskSyncOpDraft[] = [];
  for (const [blankId, value] of Object.entries(next.responses ?? {})) {
    const stamp = next.updatedAt?.[blankId] ?? 0;
    if (stamp === 0) continue;
    // Value-equality is the test, not timestamp equality: adoption bumps a
    // timestamp without changing what the student sees, and echoing that back to
    // the server would be noise (the server already holds that value).
    if (prev.responses?.[blankId] === value) continue;
    ops.push({
      entity: 'task_response',
      entity_id: `${taskId}#${blankId}`,
      payload: { taskId, blankId, contentVersion, value, updatedAt: stamp },
      updated_at: stamp,
    });
  }
  const attempt = next.attempt;
  if (attempt && attempt.submittedAt !== prev.attempt?.submittedAt) {
    ops.push({
      entity: 'task_attempt',
      entity_id: taskId,
      payload: {
        taskId,
        contentVersion: attempt.contentVersion,
        responses: attempt.responses,
        result: attempt.result,
        submittedAt: attempt.submittedAt,
      },
      updated_at: attempt.submittedAt,
    });
  }
  return ops;
}
