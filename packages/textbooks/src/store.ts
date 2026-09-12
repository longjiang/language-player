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
 * Attempts are recorded as an append-only log with `voidedAt` rather than
 * mutating a single record, mirroring `public.user_srs_review_log`, so
 * "try again" is lossless.
 */

import { gradeTask, isBlankScoreable } from './grading';
import type { Task, TaskResult } from './types';

/** A single recorded attempt. Append-only; re-answering voids the previous one. */
export interface AttemptRecord {
  id: string;
  taskId: string;
  /** Content version this attempt was made against (ADR-0044). */
  contentVersion: number;
  responses: Record<string, string>;
  result: TaskResult | null;
  submittedAt: number;
  /** Set when a later attempt supersedes this one. */
  voidedAt?: number;
}

/** What gets persisted to device storage. */
export interface PersistedTaskState {
  taskId: string;
  contentVersion: number;
  responses: Record<string, string>;
  attempts: AttemptRecord[];
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
    // A `given` blank is a worked example: pre-filled, not editable, not scored.
    if (blank.kind === 'given') out[blank.id] = blank.answer;
    else if (persisted && blank.id in persisted) out[blank.id] = persisted[blank.id]!;
    else out[blank.id] = '';
  }
  return out;
}

export class TaskResponseStore {
  readonly task: Task;
  readonly contentVersion: number;

  private responses: Record<string, string>;
  /** Invalidation cache for getResponsesSnapshot. */
  private responsesSnapshot: Record<string, string> | null = null;
  private attempts: AttemptRecord[] = [];
  private result: TaskResult | null = null;
  private submitted = false;
  private listeners = new Set<() => void>();
  private save?: (state: PersistedTaskState) => void;
  private attemptSeq = 0;

  constructor(options: TaskStoreOptions) {
    this.task = options.task;
    this.contentVersion = options.contentVersion;

    const loaded = options.load?.() ?? null;
    // A response saved against different content is stale: the task was
    // re-authored, so the answers may no longer line up (ADR-0044).
    const usable = loaded && loaded.contentVersion === this.contentVersion ? loaded : null;
    this.responses = mutableResponses(this.task, usable?.responses);
    this.attempts = usable?.attempts ?? [];
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

  getAttempts = (): AttemptRecord[] => [...this.attempts];

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
    if (!blank || blank.kind === 'given') return; // worked examples are not editable
    if (this.responses[blankId] === value) return;
    this.responses[blankId] = value;
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

    // Void the previous attempt rather than deleting it (append-only log).
    const now = Date.now();
    for (const attempt of this.attempts) if (!attempt.voidedAt) attempt.voidedAt = now;
    this.attemptSeq += 1;
    this.attempts.push({
      id: `${this.task.id}#${this.attemptSeq}`,
      taskId: this.task.id,
      contentVersion: this.contentVersion,
      responses: { ...this.responses },
      result,
      submittedAt: now,
    });

    this.persist();
    this.emit();
    return result;
  };

  /** Clear responses and the current verdict, keeping the attempt history. */
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
    attempts: this.attempts.map((a) => ({ ...a })),
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
