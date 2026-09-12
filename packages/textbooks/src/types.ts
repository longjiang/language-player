/**
 * Interactive textbook content model (SPEC-095).
 *
 * Hierarchy: book → unit → lesson → task.
 *
 * Every type here is pure data — no React, no platform APIs — so both the web
 * and mobile apps can consume the same content (ADR-0003: share logic, not
 * views).
 */

/** Optional task type. Affects presentation only, never interaction mechanics. */
export type TaskType = 'listening' | 'reading' | 'conversation' | 'writing';

/**
 * How a blank is answered.
 *
 * `given` is a worked example the workbook pre-fills; the printed answer key
 * deliberately omits those, so they must be modelled rather than inferred.
 */
export type BlankKind = 'given' | 'choose' | 'type';

/** A bank of options that `choose` blanks draw from. */
export interface Bank {
  id: string;
  items: string[];
  /**
   * Whether an option may be used by more than one blank. Defaults to false.
   *
   * This is a per-task fact, not a global rule: in B ➊ the answer key reuses
   * letter `a` for both ① and ⑤.
   */
  allowReuse?: boolean;
}

/**
 * One interactive blank.
 *
 * `id` mirrors the workbook's question index (`b1` ↔ ①) because those circled
 * numerals are question identifiers used to look answers up in the answer key.
 * They are NOT character-count hints — see `expectedLength`.
 */
export interface BlankSpec {
  id: string;
  kind: BlankKind;
  /** The correct answer. Required for every kind, including `given`. */
  answer: string;
  /**
   * Additional accepted surface forms (e.g. alternate renderings). Matching is
   * also script-variant aware, so 車 is accepted for 车.
   */
  accept?: string[];
  /**
   * Expected character count, driving boxed per-character entry.
   *
   * Defaults to `answer.length`. Set explicitly only for dictation tasks
   * (E ➊ / ➋), where the workbook prints one visible box per character.
   */
  expectedLength?: number;
  /** Id of a `Bank` this blank draws options from. Required for `choose`. */
  bank?: string;
}

/** A running L2 passage carrying inline `{{bN}}` blank markers. */
export interface PassageStimulus {
  kind: 'passage';
  text: string;
}

export type Stimulus = PassageStimulus;

/** Audio track attached to a task. */
export interface AudioTrack {
  /** Relative asset key, resolved through the asset resolver. */
  key: string;
  /** Optional label (e.g. the item it belongs to). */
  label?: string;
}

/** A single task (one numbered activity in a lesson). */
export interface Task {
  /** Canonical id, e.g. `tblt-hsk4.u06.B.t2`. */
  id: string;
  /** Display glyph from the workbook, e.g. ➋. */
  number: string;
  type?: TaskType;
  /** Workbook page this was transcribed from, for human audit. */
  sourcePage?: number;
  /** L2 instructions — rendered as tokenized text, never as a plain string. */
  instructions: string;
  /** Authored L1 translation of the instructions, shown when translation is on. */
  instructionsL1?: string;
  audio?: AudioTrack[];
  banks?: Bank[];
  body: Stimulus[];
  /** Keyed by blank id. */
  blanks?: Record<string, BlankSpec>;
  /**
   * The task's line from the printed answer key, verbatim.
   *
   * Kept alongside the authored answers so the validator can prove they agree
   * (see `validateTask`) — the cheapest possible defence against a
   * transcription error in a hand-copied answer.
   */
  answerKeyRaw?: string;
}

export interface LessonMeta {
  id: string;
  /** Lesson letter as printed, e.g. `A` for 六A. */
  letter: string;
  title: string;
  /** The workbook's CAN-DO statement for the lesson. */
  canDo?: string;
  tasks: Task[];
}

export interface UnitMeta {
  id: string;
  number: number;
  title: string;
  lessons: LessonMeta[];
}

export interface BookMeta {
  id: string;
  title: string;
  /** Target language this book teaches. */
  l2: string;
  /**
   * Bump when authored answers or blank ids change.
   *
   * Saved responses are stamped with this and discarded when it moves, so a
   * re-authored task cannot silently mis-grade a student's stored answer.
   */
  contentVersion: number;
  units: UnitMeta[];
}

// ─── Responses and grading ───────────────────────────────────────────────

/** A student's answer to one blank. */
export interface BlankResponse {
  blankId: string;
  value: string;
}

/** Result of grading one blank. */
export interface BlankResult {
  blankId: string;
  correct: boolean;
  /** The expected answer, for reveal. */
  answer: string;
}

/** Result of grading a whole task. */
export interface TaskResult {
  taskId: string;
  blanks: BlankResult[];
  /** Blanks that were answered and correct. */
  correctCount: number;
  /** Blanks that count toward the score (excludes `given`). */
  scoreableCount: number;
  /** True when every scoreable blank is correct. */
  complete: boolean;
}
