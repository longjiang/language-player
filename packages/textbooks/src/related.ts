/**
 * Tasks this task reads from (SPEC-111).
 *
 * `recall` shows an earlier task's answers (D ➐ shows ➏'s draft) and a `carried`
 * blank shows another task's pick (B ➏ carries B ➎'s pictures). The task page must
 * fetch those tasks' server state too, or a task opened on a second device renders
 * an empty recall/carried slot while the answers sit on the server.
 */

import type { Task } from './types';

export function relatedTaskIds(task: Task): string[] {
  const ids = new Set<string>();
  for (const stimulus of task.body) {
    if (stimulus.kind === 'recall' && stimulus.taskId) ids.add(stimulus.taskId);
  }
  for (const blank of Object.values(task.blanks ?? {})) {
    if (blank.carriedFrom?.taskId) ids.add(blank.carriedFrom.taskId);
  }
  ids.delete(task.id);
  return [...ids];
}
