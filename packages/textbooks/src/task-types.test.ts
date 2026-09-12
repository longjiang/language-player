import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TASK_TYPES, taskTypeKey } from './task-types';

/**
 * The task type label keys have to exist in the translation source.
 *
 * The TOC shows a task's type as an icon, so `translations.csv` is the only place
 * its name lives — as the icon's accessible name and tooltip. A missing row is
 * therefore not a fallback-to-English, it is an unlabelled button, and the failure
 * would be invisible in a screenshot. `translations.csv` is the source of truth
 * (the locale JSONs are generated from it), so the check reads that.
 */

const CSV_PATH = join(__dirname, '..', '..', '..', 'translations.csv');

/** Parse one CSV row, honouring the quoted cells the CSV actually contains. */
function parseRow(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      cells.push(cell);
      cell = '';
    } else {
      cell += ch;
    }
  }
  cells.push(cell);
  return cells;
}

const csvLines = readFileSync(CSV_PATH, 'utf-8').split('\n').filter((l) => l.trim().length > 0);
const header = parseRow(csvLines[0]!);
const rows = new Map<string, string[]>(
  csvLines.slice(1).map((line) => {
    const cells = parseRow(line);
    return [cells[0]!, cells];
  }),
);

describe('task type labels', () => {
  it('names every type with a key that follows the type verbatim', () => {
    for (const type of TASK_TYPES) {
      expect(taskTypeKey(type)).toBe(`label.${type}`);
    }
  });

  it('has a non-empty label in all 18 locales for every type', () => {
    // Columns 1.. are the locales; the first column is the key.
    expect(header.length).toBe(19);
    for (const type of TASK_TYPES) {
      expectNonEmptyInEveryLocale(taskTypeKey(type));
    }
  });

  /**
   * The task row's own label — `Task {number}` — is one ICU message rather than a
   * translated noun glued to a numeral, because word order differs by language. An
   * empty cell would therefore render a bare `{number}` with no word at all.
   */
  it('labels a task row in all 18 locales', () => {
    expectNonEmptyInEveryLocale('label.task_number');
  });
});

function expectNonEmptyInEveryLocale(key: string) {
  const row = rows.get(key);
  expect(row, `missing translations.csv row for ${key}`).toBeDefined();
  expect(row!.length).toBe(19);
  header.slice(1).forEach((locale, i) => {
    expect(row![i + 1], `${key} is empty for ${locale}`).toBeTruthy();
  });
}
