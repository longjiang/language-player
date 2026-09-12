/**
 * Cross-task progress (SPEC-095).
 *
 * Exercise state is per-task and local (ADR-0044), so nothing aggregates it: the
 * picker and the TOC had no way to say what a student had already attempted. This
 * derives that picture from the same persisted state the store writes, without
 * introducing a second store or any server record.
 *
 * Pure and platform-agnostic: each app loads the persisted states (localStorage is
 * synchronous, AsyncStorage is not) and passes them in.
 */

import type { Task } from './types';
import type { PersistedTaskState } from './store';

export interface TaskProgress {
  taskId: string;
  /** The student has submitted at least once. */
  attempted: boolean;
  /** The most recent un-voided attempt was fully correct. */
  complete: boolean;
  /** Correct / scoreable on the latest un-voided attempt. */
  correctCount: number;
  scoreableCount: number;
}

export interface LessonProgress {
  lessonId: string;
  attempted: number;
  complete: number;
  total: number;
  /** Per-task detail, so a TOC can mark each leaf. */
  tasks: TaskProgress[];
}

export interface UnitProgress {
  unitId: string;
  lessons: LessonProgress[];
  attempted: number;
  complete: number;
  total: number;
}

export interface BookProgress {
  units: UnitProgress[];
  attempted: number;
  complete: number;
  total: number;
}

/**
 * Summarise one task from its saved state.
 *
 * Attempts are append-only and a later one voids the earlier (ADR-0044), so the
 * latest un-voided attempt is the one that counts — a student who got it wrong and
 * then right has completed it.
 */
export function taskProgress(task: Task, state: PersistedTaskState | null): TaskProgress {
  const scoreable = Object.values(task.blanks ?? {}).filter(
    (b) => b.kind !== 'given' && b.kind !== 'free',
  ).length;
  return progressForId(task.id, scoreable, state);
}

/** The same summary when only the id is known — what the TOC has. */
export function progressForId(
  taskId: string,
  scoreableFallback: number,
  state: PersistedTaskState | null,
): TaskProgress {
  const live = (state?.attempts ?? []).filter((a) => !a.voidedAt);
  const latest = live[live.length - 1];
  return {
    taskId,
    attempted: live.length > 0,
    complete: Boolean(latest?.result?.complete),
    correctCount: latest?.result?.correctCount ?? 0,
    scoreableCount: latest?.result?.scoreableCount ?? scoreableFallback,
  };
}

/**
 * The shape `bookProgress` needs: just ids, so both `BookMeta` and the TOC tree a
 * screen already holds can be rolled up without loading the content again.
 */
export interface ProgressTree {
  units: Array<{
    id: string;
    lessons: Array<{ id: string; tasks: Array<{ id: string }> }>;
  }>;
}

/** Roll per-task progress up through the book's own hierarchy. */
export function bookProgress(
  book: ProgressTree,
  states: Map<string, PersistedTaskState | null>,
): BookProgress {
  const units: UnitProgress[] = [];
  let attempted = 0;
  let complete = 0;
  let total = 0;

  for (const unit of book.units) {
    const lessons: LessonProgress[] = [];
    for (const lesson of unit.lessons) {
      let lessonAttempted = 0;
      let lessonComplete = 0;
      const tasks: TaskProgress[] = [];
      for (const task of lesson.tasks) {
        // The stored attempt carries its own totals, so the tree needs only ids.
        const p = progressForId(task.id, 0, states.get(task.id) ?? null);
        tasks.push(p);
        if (p.attempted) lessonAttempted += 1;
        if (p.complete) lessonComplete += 1;
      }
      lessons.push({
        lessonId: lesson.id,
        attempted: lessonAttempted,
        complete: lessonComplete,
        total: lesson.tasks.length,
        tasks,
      });
      attempted += lessonAttempted;
      complete += lessonComplete;
      total += lesson.tasks.length;
    }
    units.push({
      unitId: unit.id,
      lessons,
      attempted: lessons.reduce((n, l) => n + l.attempted, 0),
      complete: lessons.reduce((n, l) => n + l.complete, 0),
      total: lessons.reduce((n, l) => n + l.total, 0),
    });
  }

  return { units, attempted, complete, total };
}

export interface ProgressSummary {
  attempted: number;
  complete: number;
  total: number;
}

/**
 * Totals across a set of saved states, when the task list is not at hand.
 *
 * The picker renders before any task is opened, so it has the student's saved states
 * and the book's task count but not the book's tree. Kept here rather than in the app
 * so the "latest un-voided attempt counts" rule lives in one place.
 */
export function summarizeProgress(
  states: Iterable<PersistedTaskState | null>,
  total: number,
): ProgressSummary {
  let attempted = 0;
  let complete = 0;
  for (const state of states) {
    const p = progressForId('', 0, state);
    if (p.attempted) attempted += 1;
    if (p.complete) complete += 1;
  }
  return { attempted, complete, total };
}
