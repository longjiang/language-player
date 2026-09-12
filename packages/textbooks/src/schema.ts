/**
 * Content validation (SPEC-095).
 *
 * Every content file must survive this before it ships: a blank with no answer,
 * a bank that disagrees with its answers, or a marker with no matching blank
 * would otherwise surface as a broken exercise in front of a student.
 *
 * Findings are `error` (must fix) or `warning` (probably a mistake).
 */

import { extractBlankMarkers } from '@langplayer/utils';
import { answersForKeyIndex, answersForKeyLabel } from './answer-key';
import { normalizeAnswer } from './grading';
import { assetKeysIn, pictureSetsIn, textsIn } from './types';
import type { BookMeta, LessonMeta, Task } from './types';

export type IssueLevel = 'error' | 'warning';

export interface ValidationIssue {
  level: IssueLevel;
  /** Where the problem is, for a useful message. */
  taskId?: string;
  blankId?: string;
  message: string;
}

export interface ValidationOptions {
  /**
   * Relative asset keys that exist. When supplied, audio and image references
   * are checked against it; omit to skip the check.
   */
  assetKeys?: Set<string> | string[];
}

function assetKeySet(options?: ValidationOptions): Set<string> | null {
  if (!options?.assetKeys) return null;
  return options.assetKeys instanceof Set ? options.assetKeys : new Set(options.assetKeys);
}

/**
 * Every blank reference in a task, in order.
 *
 * A blank can be referenced two ways: an inline `{{bN}}` marker in any text
 * field, or an entry in a `numberedBlanks` stimulus (the picture-set tasks print
 * `① ___ ② ___` rather than embedding blanks in a sentence).
 */
function markerIdsIn(task: Task): string[] {
  const ids = textsIn(task).flatMap((text) => extractBlankMarkers(text).markers.map((m) => m.id));
  for (const stimulus of task.body) {
    if (stimulus.kind === 'numberedBlanks') ids.push(...stimulus.ids);
    if (stimulus.kind === 'imageMap') ids.push(...stimulus.pins.map((pin) => pin.blankId));
    if (stimulus.kind === 'mockApp') ids.push(...stimulus.goals.map((goal) => goal.blankId));
    if (stimulus.kind === 'dictation') ids.push(...stimulus.ids);
    if (stimulus.kind === 'freeWrite') ids.push(stimulus.blankId);
    if (stimulus.kind === 'noteCards') ids.push(...stimulus.cards.map((card) => card.blankId));
  }
  return ids;
}

/** The key item a blank is checked against: explicit `keyIndex`, else its id. */
function keyIndexFor(blankId: string, keyIndex?: number | null): number | null {
  // `null` is an explicit opt-out: the key says nothing about this blank.
  if (keyIndex === null) return null;
  if (keyIndex !== undefined) return keyIndex;
  const n = Number(blankId.replace(/^b/, ''));
  return Number.isFinite(n) ? n : null;
}

export function validateTask(task: Task, options?: ValidationOptions): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (level: IssueLevel, message: string, blankId?: string) =>
    issues.push({ level, taskId: task.id, blankId, message });

  if (!task.id) add('error', 'Task has no id.');
  if (!task.number) add('error', 'Task has no display number (e.g. ➋).');
  if (!task.instructions?.trim()) add('error', 'Task has no instructions.');
  if (task.sourcePage === undefined) {
    add('warning', 'Task has no sourcePage, so it cannot be audited against the workbook.');
  }

  const blanks = task.blanks ?? {};
  const banks = new Map((task.banks ?? []).map((b) => [b.id, b]));
  const pictureSets = pictureSetsIn(task);

  // ── Blanks ──
  for (const [key, blank] of Object.entries(blanks)) {
    if (key !== blank.id) {
      add('error', `Blank key "${key}" does not match its id "${blank.id}".`, key);
    }
    // A `free` blank is ungraded prose, so it has no answer to require.
    if (blank.kind !== 'free' && !blank.answer?.trim()) {
      add('error', `Blank "${key}" has no answer.`, key);
    }
    if (blank.kind === 'choose') {
      if (!blank.bank && !blank.optionSet) {
        add('error', `Choose blank "${key}" has neither a bank nor an optionSet.`, key);
      }
      if (blank.bank) {
        const bank = banks.get(blank.bank);
        if (!bank) {
          add('error', `Choose blank "${key}" references missing bank "${blank.bank}".`, key);
        } else if (blank.multiple) {
          // Each pick must be an option; the answer as a whole is a set, not an item.
          for (const pick of blank.answer.split(/[、,，]/).map((p) => p.trim()).filter(Boolean)) {
            if (!bank.items.includes(pick)) {
              add('error', `Blank "${key}" pick "${pick}" is not in bank "${bank.id}".`, key);
            }
          }
        } else if (!bank.items.includes(blank.answer)) {
          add('error', `Blank "${key}" answer "${blank.answer}" is not in bank "${bank.id}".`, key);
        }
      }
      if (blank.optionSet) {
        const set = pictureSets.get(blank.optionSet);
        if (!set) {
          add('error', `Choose blank "${key}" references missing pictureSet "${blank.optionSet}".`, key);
        } else if (!set.items.some((item) => item.letter === blank.answer)) {
          add(
            'error',
            `Blank "${key}" answer "${blank.answer}" is not a letter in pictureSet "${set.id}".`,
            key,
          );
        }
      }
    }
    if (blank.kind === 'given' && blank.bank) {
      add('warning', `Given blank "${key}" declares a bank but is not answered.`, key);
    }
    if (blank.kind === 'free' && blank.bank) {
      add('error', `Free blank "${key}" cannot draw from a bank.`, key);
    }
    if (blank.kind === 'goal' && (blank.bank || blank.optionSet)) {
      add('error', `Goal blank "${key}" cannot draw from a bank or picture set.`, key);
    }
    if (blank.expectedLength !== undefined && blank.answer && blank.expectedLength !== blank.answer.length) {
      add(
        'warning',
        `Blank "${key}" expectedLength ${blank.expectedLength} != answer length ${blank.answer.length}.`,
        key,
      );
    }
  }

  // ── Markers ↔ blanks, both directions ──
  const markers = markerIdsIn(task);
  const markerSet = new Set(markers);
  if (markers.length !== markerSet.size) {
    const dupes = markers.filter((id, i) => markers.indexOf(id) !== i);
    add('error', `Duplicate blank references: ${[...new Set(dupes)].join(', ')}.`);
  }
  for (const id of markerSet) {
    if (!blanks[id]) {
      add('error', `Blank reference "${id}" has no matching entry in blanks.`, id);
    }
  }
  for (const id of Object.keys(blanks)) {
    if (!markerSet.has(id)) {
      add(
        'error',
        `Blank "${id}" is not referenced by any marker or numberedBlanks entry.`,
        id,
      );
    }
  }

  // ── Banks ──
  const referencedBanks = new Set(
    Object.values(blanks)
      .map((b) => b.bank)
      .filter((id): id is string => Boolean(id)),
  );
  for (const bank of banks.values()) {
    if (bank.items.length === 0) add('error', `Bank "${bank.id}" is empty.`);
    if (!referencedBanks.has(bank.id)) add('warning', `Bank "${bank.id}" is never referenced by a blank.`);
  }

  // ── Mock apps ──
  const goalBlanks = new Set(
    Object.values(blanks)
      .filter((b) => b.kind === 'goal')
      .map((b) => b.id),
  );
  const linkedGoalBlanks = new Set<string>();
  for (const stimulus of task.body) {
    if (stimulus.kind !== 'mockApp') continue;
    if (!stimulus.app) add('error', 'mockApp stimulus has no app id.');
    const seenGoalIds = new Set<string>();
    for (const goal of stimulus.goals) {
      if (seenGoalIds.has(goal.id)) {
        add('error', `mockApp declares goal "${goal.id}" twice.`);
      }
      seenGoalIds.add(goal.id);
      const blank = blanks[goal.blankId];
      if (!blank) {
        add('error', `mockApp goal "${goal.id}" references missing blank "${goal.blankId}".`);
        continue;
      }
      // A goal may link a `goal` blank (answered in the app) or a `given` blank
      // (a worked example the workbook pre-fills). The second case is real: the
      // 12306 app naturally answers all six questions, but ① is demonstrated
      // rather than scored, and `given` already means exactly that.
      if (blank.kind !== 'goal' && blank.kind !== 'given') {
        add(
          'error',
          `mockApp goal "${goal.id}" must reference a goal or given blank, but "${goal.blankId}" is "${blank.kind}".`,
          goal.blankId,
        );
      }
      linkedGoalBlanks.add(goal.blankId);
    }
  }
  for (const id of goalBlanks) {
    if (!linkedGoalBlanks.has(id)) {
      add('error', `Goal blank "${id}" is not linked from any mockApp goal.`, id);
    }
  }

  // ── Picture sets ──
  const referencedSets = new Set(
    Object.values(blanks)
      .map((b) => b.optionSet)
      .filter((id): id is string => Boolean(id)),
  );
  for (const set of pictureSets.values()) {
    if (set.items.length === 0) add('error', `pictureSet "${set.id}" is empty.`);
    if (!referencedSets.has(set.id)) {
      add('warning', `pictureSet "${set.id}" is never referenced by a blank.`);
    }
    for (const item of set.items) {
      if (!item.letter) add('error', `pictureSet "${set.id}" has an option with no letter.`);
      if (!item.image) add('warning', `pictureSet "${set.id}" option "${item.letter}" has no image.`);
    }
  }

  // ── Assets ──
  // One walk covers every place a key can be declared, so a new declaration point
  // cannot silently escape the manifest check.
  const keys = assetKeySet(options);
  if (keys) {
    for (const { key, where } of assetKeysIn(task)) {
      if (!keys.has(key)) {
        add('error', `Asset "${key}" (${where}) is not in the asset manifest.`);
      }
    }
  }
  if (task.type === 'listening' && !(task.audio ?? []).length) {
    add('warning', 'Task is typed "listening" but has no audio.');
  }

  // ── Item audio ──
  // A recording declared inside a passage or dialogue is ambiguous: the block owns
  // the recording, and a per-blank control inside running text has nowhere to sit.
  const inlineBlockIds = new Set(
    task.body.flatMap((stimulus) =>
      stimulus.kind === 'passage'
        ? extractBlankMarkers(stimulus.text).markers.map((m) => m.id)
        : stimulus.kind === 'dialogue'
          ? stimulus.lines.flatMap((l) => extractBlankMarkers(l.text).markers.map((m) => m.id))
          : [],
    ),
  );
  for (const [id, blank] of Object.entries(blanks)) {
    if (blank.audio?.length && inlineBlockIds.has(id)) {
      add(
        'error',
        `Blank "${id}" carries audio but lives in a passage or dialogue, where the block owns the recording.`,
        id,
      );
    }
  }

  // ── Answer key agreement ──
  if (task.answerKeyRaw) {
    for (const blank of Object.values(blanks)) {
      // The key omits worked examples and has nothing to say about free text.
      if (blank.kind === 'given' || blank.kind === 'free') continue;
      const keyed = blank.keyLabel
        ? answersForKeyLabel(task.answerKeyRaw, blank.keyLabel)
        : (() => {
            const index = keyIndexFor(blank.id, blank.keyIndex);
            return index === null ? null : answersForKeyIndex(task.answerKeyRaw, index);
          })();
      if (keyed === null) continue;
      if (keyed.length === 0) {
        add(
          'error',
          `Blank "${blank.id}"${blank.keyLabel ? ` (label "${blank.keyLabel}")` : ''} is absent from the answer key for this task.`,
          blank.id,
        );
        continue;
      }
      const normalizedKeyed = keyed.map(normalizeAnswer);
      const asSet = (value: string) =>
        normalizeAnswer(value)
          .split(/[、,，]|和|与/)
          .map((p) => p.trim())
          .filter(Boolean)
          .sort()
          .join('|');
      // Every accepted form is checked, not just the primary one: an `accept[]` entry
      // that contradicts the key is an authoring mistake worth catching.
      for (const candidate of [blank.answer, ...(blank.accept ?? [])]) {
        // A multi-select blank may join its picks differently from the key — 硬卧和软卧
        // against 硬卧、软卧 — so its picks are compared as a set.
        const agrees = blank.multiple === true
          ? normalizedKeyed.some((k) => asSet(k) === asSet(candidate))
          : normalizedKeyed.includes(normalizeAnswer(candidate));
        if (!agrees) {
          add(
            'error',
            `Blank "${blank.id}" answer "${candidate}" disagrees with the key (${keyed.join(' / ')}).`,
            blank.id,
          );
        }
      }
    }
  } else {
    add('warning', 'Task has no answerKeyRaw, so its answers cannot be cross-checked.');
  }

  return issues;
}

export function validateLesson(lesson: LessonMeta, options?: ValidationOptions): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!lesson.letter) issues.push({ level: 'error', message: `Lesson "${lesson.id}" has no letter.` });
  for (const task of lesson.tasks) issues.push(...validateTask(task, options));
  return issues;
}

export function validateBook(book: BookMeta, options?: ValidationOptions): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seenTasks = new Set<string>();
  const seenBlankIds = new Set<string>();

  for (const unit of book.units) {
    for (const lesson of unit.lessons) {
      issues.push(...validateLesson(lesson, options));
      for (const task of lesson.tasks) {
        if (seenTasks.has(task.id)) {
          issues.push({ level: 'error', taskId: task.id, message: `Duplicate task id "${task.id}".` });
        }
        seenTasks.add(task.id);
        if (!task.id.startsWith(`${book.id}.${unit.id}.`)) {
          issues.push({
            level: 'warning',
            taskId: task.id,
            message: `Task id "${task.id}" does not follow ${book.id}.${unit.id}.<lesson>.t<n>.`,
          });
        }
        // Blank ids are task-scoped, so uniqueness here is within the task
        // (handled by validateTask); this catches a blank declared twice across
        // tasks only if ids were reused verbatim, which is a content smell.
        for (const blankId of Object.keys(task.blanks ?? {})) {
          const scoped = `${task.id}:${blankId}`;
          if (seenBlankIds.has(scoped)) {
            issues.push({ level: 'error', taskId: task.id, message: `Duplicate blank "${scoped}".` });
          }
          seenBlankIds.add(scoped);
        }
      }
    }
  }

  return issues;
}

/** Throw if any issue is an error — for use in tests and CI. */
export function assertValid(issues: ValidationIssue[], label = 'content'): void {
  const errors = issues.filter((i) => i.level === 'error');
  if (errors.length) {
    throw new Error(
      `${label} has ${errors.length} validation error(s):\n` +
        errors.map((e) => `  - ${e.taskId ? `[${e.taskId}] ` : ''}${e.message}`).join('\n'),
    );
  }
}
