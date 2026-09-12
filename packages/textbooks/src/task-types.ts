/**
 * Task types and their display names (SPEC-095).
 *
 * `Task.type` affects presentation only — the icon in the task TOC, and the
 * grouping affordance a picker may add. It never changes the interaction
 * mechanics, because the same blank primitive serves all four types.
 *
 * The display name is a translation key, not a string: the TOC shows the type as
 * an icon, and the key supplies its accessible name and tooltip. The mapping is
 * shared rather than duplicated per app so web and mobile cannot disagree about
 * which key a type resolves to — and `task-types.test.ts` proves every key
 * exists in `translations.csv` for all 18 locales, so a missing label is a test
 * failure rather than an unlabelled icon.
 */

import type { TaskType } from './types';

/** Every task type, in the order a legend would list them. */
export const TASK_TYPES: readonly TaskType[] = [
  'listening',
  'reading',
  'conversation',
  'writing',
] as const;

/**
 * The translation key for a task type's display name.
 *
 * The keys follow the type verbatim (`label.listening`, `label.reading`,
 * `label.conversation`, `label.writing`) so a new type never needs a mapping
 * table — only a CSV row.
 */
export function taskTypeKey(type: TaskType): string {
  return `label.${type}`;
}
