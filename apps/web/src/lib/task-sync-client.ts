/**
 * The two Flask calls task-state sync needs (SPEC-111).
 *
 * Deliberately plain `fetch`: the queue and the bridge already own retry and
 * ordering, and going through the shared axios client would add a refresh
 * interceptor between a queued op and its idempotency key.
 */

import { PYTHON_API_URL } from '@/lib/api-url';
import type { TaskStateResponse } from '@langplayer/textbooks';
import type { TaskSyncOp } from '@/lib/task-sync-queue';

export type FetchTaskStateResult =
  | { ok: true; state: TaskStateResponse }
  | { ok: false; status: number };

export async function fetchTaskState(
  taskIds: string[],
  token: string,
): Promise<FetchTaskStateResult> {
  const params = new URLSearchParams();
  for (const id of taskIds) params.append('taskIds', id);
  try {
    const res = await fetch(`${PYTHON_API_URL}/tasks/state?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return { ok: false, status: res.status };
    const state = (await res.json()) as TaskStateResponse;
    return {
      ok: true,
      state: {
        responses: Array.isArray(state.responses) ? state.responses : [],
        attempts: Array.isArray(state.attempts) ? state.attempts : [],
        files: Array.isArray(state.files) ? state.files : [],
      },
    };
  } catch {
    return { ok: false, status: 0 };
  }
}

export async function pushTaskOps(
  ops: TaskSyncOp[],
  token: string,
): Promise<{ ok: true } | { ok: false; status: number }> {
  try {
    const res = await fetch(`${PYTHON_API_URL}/sync/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ ops }),
    });
    return res.ok ? { ok: true } : { ok: false, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}
