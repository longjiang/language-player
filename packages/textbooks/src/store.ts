/**
 * Task response state (SPEC-095, ADR-0044).
 *
 * Two jobs, and the split matters:
 *
 *  1. **Per-blank state.** Each blank subscribes to just its own value, so a
 *     keystroke re-renders that blank and nothing else. This is what keeps the
 *     memoised `TokenizedText` token tree (mobile: a documented ~47s JS-thread
 *     block if re-rendered) out of the typing path entirely.
 *  2. **Local persistence.** Answers survive a restart. ADR-0044 makes this
 *     device-local only, so persistence is an injected adapter rather than a
 *     network call, and the owning app supplies localStorage / AsyncStorage.
 *
 * A task holds ONE attempt (ADR-0053 rev. 2). Submitting replaces it rather than
 * appending to a log: the product reads a single current result, and an
 * unbounded log of full response snapshots was growth nothing consumed. The
 * attempt is still a snapshot — grading happens here, so it cannot be
 * recomputed later.
 */

import { gradeTask, isBlankScoreable } from './grading';
import { normalisePersistedTaskState } from './persisted-state';
import type { BlankSpec, Task, TaskResult } from './types';

/**
 * A `given` blank prints as an illustration slot when it names an `optionSet`
 * (B ➎'s 插图一), and a slot is answered at the blank like any other picture blank:
 * the worked example starts the box and the student may re-pick it. Such a blank is
 * therefore editable, while every other `given` blank stays a read-only worked
 * example. Neither is ever scored — this changes what can be written, not grading.
 */
function isEditableGiven(blank: BlankSpec): boolean {
  return blank.kind === 'given' && Boolean(blank.optionSet);
}

/** A single recorded attempt: a snapshot taken at submit. Replaced, never appended. */
export interface AttemptRecord {
  taskId: string;
  /** Content version this attempt was made against (ADR-0053). */
  contentVersion: number;
  responses: Record<string, string>;
  result: TaskResult | null;
  submittedAt: number;
}

/** What gets persisted to device storage. */
export interface PersistedTaskState {
  taskId: string;
  contentVersion: number;
  responses: Record<string, string>;
  attempt: AttemptRecord | null;
  /**
   * Per-blank client timestamps, in ms. This is what makes per-blank last-write-
   * wins real when two devices edit the same task: the value alone cannot say
   * which edit is newer. Missing on state saved before SPEC-111, treated as 0.
   */
  updatedAt?: Record<string, number>;
}

/** A remote snapshot to merge into the store (SPEC-111 `/tasks/state`). */
export interface RemoteTaskState {
  responses?: Record<string, { value: string; updatedAt: number }>;
  attempt?: AttemptRecord | null;
}

/** Storage adapter supplied by the app (localStorage / AsyncStorage). */
export interface TaskStateAdapter {
  load(taskId: string): PersistedTaskState | null | Promise<PersistedTaskState | null>;
  save(state: PersistedTaskState): void | Promise<void>;
}

export interface TaskStoreOptions {
  task: Task;
  /** Book/unit content version; a mismatch discards stale responses. */
  contentVersion: number;
  /** Load any previously-saved state for this task. */
  load?: () => PersistedTaskState | null;
  /** Persist after every change; called with a fresh snapshot. */
  save?: (state: PersistedTaskState) => void;
}

function mutableResponses(task: Task, persisted?: Record<string, string> | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const blank of Object.values(task.blanks ?? {})) {
    // A carried slot's value belongs to the earlier task, not this one: it is read
    // from that task's saved state at render time, so nothing is seeded, persisted
    // or editable here. Copying it in would go stale the moment the earlier task
    // changed.
    if (blank.kind === 'carried') {
      out[blank.id] = '';
      continue;
    }
    // A `given` blank is a worked example: pre-filled, not editable, not scored — except a
    // given *slot*, whose worked-example picture is the box's starting value and whose
    // re-picks persist like any other response (see isEditableGiven).
    if (blank.kind === 'given' && !isEditableGiven(blank)) out[blank.id] = blank.answer;
    else if (persisted && blank.id in persisted) out[blank.id] = persisted[blank.id]!;
    else out[blank.id] = blank.kind === 'given' ? blank.answer : '';
  }
  return out;
}

export class TaskResponseStore {
  readonly task: Task;
  readonly contentVersion: number;

  private responses: Record<string, string>;
  /** Invalidation cache for getResponsesSnapshot. */
  private responsesSnapshot: Record<string, string> | null = null;
  private attempt: AttemptRecord | null = null;
  private updatedAt: Record<string, number> = {};
  private result: TaskResult | null = null;
  private submitted = false;
  private listeners = new Set<() => void>();
  private save?: (state: PersistedTaskState) => void;

  constructor(options: TaskStoreOptions) {
    this.task = options.task;
    this.contentVersion = options.contentVersion;

    // Normalise here as well as in the adapters: state saved before the shape
    // changed still carries `attempts[]`, and a legacy array must never reach the
    // store's reads.
    const loaded = normalisePersistedTaskState(options.load?.() ?? null);
    // A response saved against different content is stale: the task was
    // re-authored, so the answers may no longer line up (ADR-0044).
    const usable = loaded && loaded.contentVersion === this.contentVersion ? loaded : null;
    this.responses = mutableResponses(this.task, usable?.responses);
    this.attempt = usable?.attempt ?? null;
    this.updatedAt = { ...(usable?.updatedAt ?? {}) };
    this.save = options.save;
  }

  // ── Subscription (useSyncExternalStore-compatible) ──

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private emit(): void {
    this.responsesSnapshot = null;
    for (const listener of this.listeners) listener();
  }

  // ── Reads ──

  /** Current value for one blank. Returns a primitive so it is safe as a snapshot. */
  getValue = (blankId: string): string => this.responses[blankId] ?? '';

  /** The grading result, or null before submit. Stable reference between changes. */
  getResult = (): TaskResult | null => this.result;

  isSubmitted = (): boolean => this.submitted;

  getResponses = (): Record<string, string> => ({ ...this.responses });

  /**
   * Cached responses object for `useSyncExternalStore`.
   *
   * `getResponses()` copies on every call, which as a snapshot would compare
   * unequal on every read and spin the renderer. This returns the same object
   * until something actually changes.
   */
  getResponsesSnapshot = (): Record<string, string> => {
    if (!this.responsesSnapshot) this.responsesSnapshot = { ...this.responses };
    return this.responsesSnapshot;
  };

  /** The task's attempt, or null. A copy: callers cannot mutate the store's. */
  getAttempt = (): AttemptRecord | null =>
    this.attempt ? { ...this.attempt, responses: { ...this.attempt.responses } } : null;

  /** Client timestamp of a blank's last local edit (0 when never edited). */
  getUpdatedAt = (blankId: string): number => this.updatedAt[blankId] ?? 0;

  /** Count of blanks the student has answered (excluding `given`). */
  getAnsweredCount = (): number =>
    Object.values(this.task.blanks ?? {}).filter(
      (b) => isBlankScoreable(b) && (this.responses[b.id] ?? '').trim().length > 0,
    ).length;

  /** Count of blanks that count toward the score. */
  getScoreableCount = (): number =>
    Object.values(this.task.blanks ?? {}).filter(isBlankScoreable).length;

  // ── Writes ──

  setValue = (blankId: string, value: string): void => {
    const blank = this.task.blanks?.[blankId];
    // A worked example is not editable — except a given *slot*, whose picture the
    // student re-picks at the box (see isEditableGiven) — and a carried slot is
    // edited in the task it came from, never here.
    if (!blank || blank.kind === 'carried' || (blank.kind === 'given' && !isEditableGiven(blank))) return;
    if (this.responses[blankId] === value) return;
    this.responses[blankId] = value;
    this.updatedAt[blankId] = Date.now();
    // Editing after submit clears the verdict so stale ticks are never shown.
    if (this.submitted) {
      this.submitted = false;
      this.result = null;
    }
    this.persist();
    this.emit();
  };

  submit = (): TaskResult => {
    const result = gradeTask(this.task, this.responses);
    this.result = result;
    this.submitted = true;

    // Replace the row: one attempt per task (ADR-0053 rev. 2). The snapshot is
    // taken because grading happens here and cannot be recomputed later.
    this.attempt = {
      taskId: this.task.id,
      contentVersion: this.contentVersion,
      responses: { ...this.responses },
      result,
      submittedAt: Date.now(),
    };

    this.persist();
    this.emit();
    return result;
  };

  /**
   * Mark a check-only task complete.
   *
   * A task whose questions are all `selfCheck` has nothing to submit: the student answers in
   * their head and reveals the model answer. A graded result is `complete` only when at least
   * one blank is scoreable and all of them are right, so such a task could never be marked
   * complete — this writes the task's attempt, carrying `complete: true` and no blanks. The
   * store's `submitted`/`result` are deliberately left alone: there is nothing to report and
   * no result banner.
   *
   * Idempotent: once the attempt is a completion, re-checking leaves it alone (hiding and
   * re-showing an answer must not rewrite the record). The UI only offers this control when
   * the task has nothing to grade, so replacing the result cannot discard a real grade.
   */
  recordChecked = (): void => {
    if (this.attempt?.result?.complete) return;
    this.attempt = {
      taskId: this.task.id,
      contentVersion: this.contentVersion,
      responses: { ...this.responses },
      result: {
        taskId: this.task.id,
        blanks: [],
        correctCount: 0,
        scoreableCount: 0,
        complete: true,
      },
      submittedAt: Date.now(),
    };
    this.persist();
    this.emit();
  };

  /**
   * Merge a server snapshot (SPEC-111), per blank and per attempt.
   *
   * A remote value wins over a local one only when it is strictly newer — the
   * local store is the device the student is looking at, and adopting a tie
   * would rewrite what they just typed. The attempt is the same rule on
   * `submittedAt`. One persist + one emit follows a merge, so a task that
   * already has answers does not re-render per blank.
   */
  adoptRemote = (remote: RemoteTaskState): void => {
    let changed = false;
    for (const [blankId, entry] of Object.entries(remote.responses ?? {})) {
      if (!entry) continue;
      if (entry.updatedAt <= (this.updatedAt[blankId] ?? 0)) continue;
      if (this.responses[blankId] === entry.value) {
        this.updatedAt[blankId] = entry.updatedAt;
        continue;
      }
      this.responses[blankId] = entry.value;
      this.updatedAt[blankId] = entry.updatedAt;
      changed = true;
    }
    const incoming = remote.attempt ?? null;
    if (incoming && (!this.attempt || incoming.submittedAt > this.attempt.submittedAt)) {
      this.attempt = { ...incoming, responses: { ...incoming.responses } };
      changed = true;
    }
    if (!changed) return;
    this.persist();
    this.emit();
  };

  /** Clear responses and the current verdict. The attempt stays: it happened. */
  reset = (): void => {
    this.responses = mutableResponses(this.task, null);
    this.result = null;
    this.submitted = false;
    this.persist();
    this.emit();
  };

  snapshot = (): PersistedTaskState => ({
    taskId: this.task.id,
    contentVersion: this.contentVersion,
    responses: { ...this.responses },
    attempt: this.attempt ? { ...this.attempt, responses: { ...this.attempt.responses } } : null,
    updatedAt: { ...this.updatedAt },
  });

  private persist(): void {
    this.save?.(this.snapshot());
  }
}

/**
 * Which blank the option bank will fill next.
 *
 * Kept out of the task context on purpose: the context value must keep a stable
 * identity for the life of an attempt, or every `TokenizedText` re-renders when
 * a student taps a blank. Blanks subscribe to this individually instead.
 *
 * `useSyncExternalStore`-compatible: `get()` returns a primitive.
 */
export class BlankSelectionStore {
  private selected: string | null = null;
  private listeners = new Set<() => void>();

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  get = (): string | null => this.selected;

  set = (blankId: string | null): void => {
    if (this.selected === blankId) return;
    this.selected = blankId;
    this.emit();
  };

  /** Select `blankId`, or clear it if it is already selected (tap to toggle). */
  toggle = (blankId: string): void => {
    this.set(this.selected === blankId ? null : blankId);
  };

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
