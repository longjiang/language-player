/**
 * Cross-task progress (SPEC-095, SPEC-111).
 *
 * Nothing aggregates state server-side: each saved task state is rolled up here,
 * without introducing a second store.
 *
 * Completion has **two inputs** since ADR-0053 rev. 2: the task's attempt must be
 * complete **and** every required recording slot must have a stored take. The
 * second input is the file store's (SPEC-113), so it is passed in — this module
 * never talks to a store or a network.
 *
 * Pure and platform-agnostic: each app loads the persisted states (localStorage is
 * synchronous, AsyncStorage is not) and the live recording slots, and passes both in.
 */

import { isBlankScoreable } from './grading';
import { requiredRecordingSlotsIn } from './recordings';
import type { Task } from './types';
import type { PersistedTaskState } from './store';

export interface TaskProgress {
  taskId: string;
  /** The task has an attempt. */
  attempted: boolean;
  /** The attempt is complete and every required take is stored. */
  complete: boolean;
  /** Correct / scoreable on the attempt. */
  correctCount: number;
  scoreableCount: number;
  /** Required recording slots that have no stored take yet. */
  missingRecordings: string[];
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

/** What a task needs from the file store before it can be complete. */
export interface ProgressOptions {
  requiredRecordings?: readonly string[];
  /** Slot ids that have a stored take. Absent means none. */
  liveRecordings?: Iterable<string>;
}

/**
 * Summarise one task.
 *
 * `liveRecordings` is the set of this task's slots with a stored take; a task
 * with a required slot and no take is `attempted` but not `complete`.
 */
export function taskProgress(
  task: Task,
  state: PersistedTaskState | null,
  liveRecordings?: Iterable<string>,
): TaskProgress {
  const scoreable = Object.values(task.blanks ?? {}).filter(isBlankScoreable).length;
  return progressForId(task.id, scoreable, state, {
    requiredRecordings: requiredRecordingSlotsIn(task),
    liveRecordings,
  });
}

/** The same summary when only the id (and what the tree knows) is at hand. */
export function progressForId(
  taskId: string,
  scoreableFallback: number,
  state: PersistedTaskState | null,
  options: ProgressOptions = {},
): TaskProgress {
  const attempt = state?.attempt ?? null;
  const live = new Set(options.liveRecordings ?? []);
  const missing = (options.requiredRecordings ?? []).filter((slot) => !live.has(slot));
  return {
    taskId,
    attempted: attempt !== null,
    complete: Boolean(attempt?.result?.complete) && missing.length === 0,
    correctCount: attempt?.result?.correctCount ?? 0,
    scoreableCount: attempt?.result?.scoreableCount ?? scoreableFallback,
    missingRecordings: missing,
  };
}

/**
 * The shape `bookProgress` needs: ids plus the required slots the TOC tree carries,
 * so both `BookMeta` and a screen's TOC can be rolled up without the bodies.
 */
export interface ProgressTree {
  units: Array<{
    id: string;
    lessons: Array<{
      id: string;
      tasks: Array<{ id: string; requiredRecordings?: readonly string[] }>;
    }>;
  }>;
}

/**
 * Roll per-task progress up through the book's own hierarchy.
 *
 * `liveByTask` maps a task id to the slots that have a stored take; a task absent
 * from the map is treated as having none, so a required take can never be
 * assumed present.
 */
export function bookProgress(
  book: ProgressTree,
  states: Map<string, PersistedTaskState | null>,
  liveByTask?: Map<string, Iterable<string>>,
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
        const p = progressForId(task.id, 0, states.get(task.id) ?? null, {
          requiredRecordings: task.requiredRecordings,
          liveRecordings: liveByTask?.get(task.id),
        });
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

export interface SummaryOptions {
  /** Required recording slots per task id (the picker knows the book it is showing). */
  requiredByTask?: Map<string, readonly string[]>;
  /** Stored-take slots per task id. */
  liveByTask?: Map<string, Iterable<string>>;
}

/**
 * Totals across a set of saved states, when the task list is not at hand.
 *
 * The picker renders before any task is opened, so it has the student's saved states
 * and the book's task count but not the book's tree. Kept here rather than in the app
 * so the completion rule lives in one place.
 */
export function summarizeProgress(
  states: Iterable<PersistedTaskState | null>,
  total: number,
  options: SummaryOptions = {},
): ProgressSummary {
  let attempted = 0;
  let complete = 0;
  for (const state of states) {
    const taskId = state?.taskId ?? '';
    const p = progressForId(taskId, 0, state, {
      requiredRecordings: options.requiredByTask?.get(taskId),
      liveRecordings: options.liveByTask?.get(taskId),
    });
    if (p.attempted) attempted += 1;
    if (p.complete) complete += 1;
  }
  return { attempted, complete, total };
}
