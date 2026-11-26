/**
 * `/tasks/state` for the mobile task page (SPEC-111).
 *
 * Plain fetch, like the web client: the outbox owns retry and ordering, and an
 * axios refresh interceptor in front of a queued op would only add a second
 * retry mechanism.
 */

import type { TaskStateResponse } from '@langplayer/textbooks';
import { PYTHON_API_URL } from './api-url';

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
