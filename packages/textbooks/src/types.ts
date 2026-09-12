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
export type BlankKind =
  | 'given'
  | 'choose'
  | 'type'
  /**
   * Answered *inside* a mock app, not by a blank widget.
   *
   * Its `answer`/`accept` are the expected values, so the mock app's reported
   * answer can be graded and cross-checked against the printed key like any
   * other blank. No `{{bN}}` marker or blank widget may reference it.
   */
  | 'goal';

/** A bank of options that `choose` blanks draw from. */
export interface Bank {
  id: string;
  /**
   * The values a blank may answer with.
   *
   * Often these ARE the printed options (B ➋: `快`), but B ➊ prints each option
   * as a letter plus a description (`a 高速动车组列车`) while the blank records
   * only the letter — hence `optionLabels`.
   */
  items: string[];
  /** Optional description shown beside a value, keyed by that value. */
  optionLabels?: Record<string, string>;
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
  /**
   * Id of a `Bank` this blank draws options from. Required for `choose` blanks
   * answered with text.
   */
  bank?: string;
  /**
   * Id of a `pictureSet` stimulus this blank draws options from. Used instead of
   * `bank` when the options are labelled pictures: the blank's answer is the
   * option's letter, and the validator checks it against the set's letters.
   */
  optionSet?: string;
  /**
   * Which answer-key item this blank is checked against.
   *
   * Defaults to the blank's own numeric id (`b3` → item ③). It matters when a
   * **single** key item covers several blanks: A ➌'s key reads
   * `2. 金敏俊: B、c`, i.e. one row giving both the "how" and the "where" answer,
   * so both of that row's blanks cite item 2.
   */
  keyIndex?: number;
  /**
   * Which label-keyed answer-key item this blank is checked against.
   *
   * A ➊'s key names the blanks rather than numbering them
   * (`北京：C；成都：D；…`), because the blanks sit on a map next to city names.
   */
  keyLabel?: string;
}

/** One labelled picture option in a `pictureSet`. */
export interface PictureOption {
  /** Option letter as printed, e.g. `A` — this is what a blank answers with. */
  letter: string;
  /** Caption under the picture. */
  label: string;
  /** Relative asset key. */
  image: string;
}

/** A lettered grid of pictures that blanks reference by letter. */
export interface PictureSetStimulus {
  kind: 'pictureSet';
  id: string;
  items: PictureOption[];
}

/** One spoken line of a dialogue. */
export interface DialogueLine {
  /** Speaker label as printed (e.g. 售票员); omitted for narration. */
  speaker?: string;
  /** L2 text, may carry `{{bN}}` markers. */
  text: string;
}

/** Speaker-labelled lines carrying inline blanks. */
export interface DialogueStimulus {
  kind: 'dialogue';
  id?: string;
  lines: DialogueLine[];
}

/**
 * A simple table.
 *
 * Cells are L2 text and may carry `{{bN}}` markers, so a table can hold blanks
 * without needing its own blank mechanism — B ➊ puts a blank in the 车型 column.
 */
export interface DataTableStimulus {
  kind: 'dataTable';
  id?: string;
  columns: string[];
  rows: string[][];
}

/**
 * A numbered row of blanks, printed as `① ___ ② ___ ③ ___`.
 *
 * The picture-set tasks (A ➋, C ➊, C ➋) have no passage: the student listens and
 * answers a run of numbered slots. Each blank renders with its workbook index,
 * which is also how the answer key refers to it.
 */
export interface NumberedBlanksStimulus {
  kind: 'numberedBlanks';
  ids: string[];
}

/** A running L2 passage carrying inline `{{bN}}` blank markers. */
export interface PassageStimulus {
  kind: 'passage';
  text: string;
}

/** One interactive slot on an image, positioned as a percentage of the image. */
export interface ImageMapPin {
  /** The blank rendered at this position. */
  blankId: string;
  /** Horizontal position, 0–100 (% of image width). */
  x: number;
  /** Vertical position, 0–100 (% of image height). */
  y: number;
}

/**
 * An image with positioned blanks.
 *
 * The image itself carries the printed labels (A ➊'s map already shows each city
 * name and its `( )`), so a pin only places the interactive blank over that slot
 * rather than duplicating the text.
 */
export interface ImageMapStimulus {
  kind: 'imageMap';
  id?: string;
  /** Relative asset key. */
  image: string;
  /** Displayed above the map, e.g. the picture bank the answers come from. */
  alt?: string;
  pins: ImageMapPin[];
}

/** Ties one mock-app goal to the blank holding its expected answer. */
export interface MockAppGoalLink {
  /** Goal id as the app declares it. */
  id: string;
  /** The `goal` blank holding the expected answer. */
  blankId: string;
  prompt?: string;
}

/**
 * A self-contained HTML mock app in a sandboxed frame (ADR-0045).
 *
 * The host does not know the app's UI. It forwards help mode, hint and reset over
 * the bridge, and grades the answers the app reports against the linked `goal`
 * blanks.
 */
export interface MockAppStimulus {
  kind: 'mockApp';
  /** App id; its HTML lives at `<MOCK_APP_BASE_URL>/<app>/index.html`. */
  app: string;
  /** Workbook screenshot shown if the frame cannot load. */
  fallbackImage?: string;
  goals: MockAppGoalLink[];
}

export type Stimulus =
  | PassageStimulus
  | DialogueStimulus
  | PictureSetStimulus
  | DataTableStimulus
  | NumberedBlanksStimulus
  | ImageMapStimulus
  | MockAppStimulus;

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

/**
 * Every L2 string in a task that needs rendering (and therefore tokenization).
 *
 * A single source of truth for "where can a `{{bN}}` marker live", so the
 * validator, the tokenizer warm-up and the renderers cannot disagree about which
 * fields are text.
 */
export function textsIn(task: Task): string[] {
  const out: string[] = [];
  if (task.instructions) out.push(task.instructions);
  for (const stimulus of task.body) {
    switch (stimulus.kind) {
      case 'passage':
        out.push(stimulus.text);
        break;
      case 'dialogue':
        for (const line of stimulus.lines) if (line.text) out.push(line.text);
        break;
      case 'dataTable':
        out.push(...stimulus.columns);
        for (const row of stimulus.rows) out.push(...row);
        break;
      case 'pictureSet':
        for (const item of stimulus.items) if (item.label) out.push(item.label);
        break;
      case 'mockApp':
        // The app's own text is tokenized inside the frame, not from here.
        break;
      case 'numberedBlanks':
      case 'imageMap':
        // No text of their own: `numberedBlanks` renders blanks from their
        // specs, and an imageMap's labels are baked into the image.
        break;
    }
  }
  return out;
}

/** Every `pictureSet` in a task, keyed by set id. */
export function pictureSetsIn(task: Task): Map<string, PictureSetStimulus> {
  const map = new Map<string, PictureSetStimulus>();
  for (const stimulus of task.body) {
    if (stimulus.kind === 'pictureSet') map.set(stimulus.id, stimulus);
  }
  return map;
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
