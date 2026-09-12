/**
 * Lazy book loading (SPEC-095).
 *
 * Mirrors `packages/shared/src/sample-content/loaders.ts`: one module per book
 * behind a statically-analyzable dynamic import, so opening one unit does not
 * download the whole catalogue.
 *
 * This is deliberately NOT the `packages/shared/src/docs.ts` approach — that
 * file inlines every locale into a single ~2.1 MB tracked module reachable from
 * the shared barrel, which is exactly the shape textbook content must avoid.
 */

import type { BookMeta, LessonMeta, Task } from './types';

/** A book's shape without loading its tasks — enough to render the picker. */
export interface BookSummary {
  id: string;
  title: string;
  /** Target language the book teaches. */
  l2: string;
  /**
   * How many tasks the book has.
   *
   * Carried here so the picker can show progress without loading a book's content —
   * it renders before any task is opened. A test asserts it matches the book.
   */
  taskCount: number;
}

/**
 * The catalogue the picker renders. Only one book exists today, which is why
 * the picker is a single-item list.
 */
export const TEXTBOOK_CATALOGUE: BookSummary[] = [
  { id: 'tblt-hsk4', title: 'Tasks for Life in China (HSK 4)', l2: 'zh', taskCount: 25 },
];

type BookModule = { book: BookMeta };

export const bookLoaders: Record<string, () => Promise<BookModule>> = {
  'tblt-hsk4': () => import('./content/tblt-hsk4/book').then((m) => ({ book: m.tbltHsk4 })),
};

/**
 * Guard against the map drifting from the catalogue — the same completeness
 * check `sample-content` uses, so adding a catalogue entry without a loader
 * fails loudly instead of producing a book that never opens.
 */
for (const entry of TEXTBOOK_CATALOGUE) {
  if (!bookLoaders[entry.id]) {
    throw new Error(`No loader registered for textbook "${entry.id}".`);
  }
}

/** Load a book by id. Resolves to null when the id is unknown. */
export async function loadBook(bookId: string): Promise<BookMeta | null> {
  const loader = bookLoaders[bookId];
  if (!loader) return null;
  const { book } = await loader();
  return book;
}

// ─── Lookups ─────────────────────────────────────────────────────────────

export function findLesson(book: BookMeta, lessonId: string): LessonMeta | null {
  for (const unit of book.units) {
    const lesson = unit.lessons.find((l) => l.id === lessonId);
    if (lesson) return lesson;
  }
  return null;
}

export function findTask(book: BookMeta, taskId: string): Task | null {
  for (const unit of book.units) {
    for (const lesson of unit.lessons) {
      const task = lesson.tasks.find((t) => t.id === taskId);
      if (task) return task;
    }
  }
  return null;
}

/** A task's shape without its body — enough to render the TOC. */
export interface TocTask {
  id: string;
  /** Display glyph, e.g. ➋. */
  number: string;
  type?: Task['type'];
}

export interface TocLesson {
  id: string;
  letter: string;
  title: string;
  canDo?: string;
  tasks: TocTask[];
}

export interface TocUnit {
  id: string;
  number: number;
  title: string;
  lessons: TocLesson[];
}

export interface TocTree {
  bookId: string;
  bookTitle: string;
  contentVersion: number;
  units: TocUnit[];
}

/**
 * Build the navigation tree for a book.
 *
 * Deliberately excludes task bodies and blank answers: the TOC is rendered on
 * every task page, and serialising the whole book to the client for it would
 * ship every answer to the browser.
 */
export function buildTocTree(book: BookMeta): TocTree {
  return {
    bookId: book.id,
    bookTitle: book.title,
    contentVersion: book.contentVersion,
    units: book.units.map((unit) => ({
      id: unit.id,
      number: unit.number,
      title: unit.title,
      lessons: unit.lessons.map((lesson) => ({
        id: lesson.id,
        letter: lesson.letter,
        title: lesson.title,
        canDo: lesson.canDo,
        tasks: lesson.tasks.map((task) => ({ id: task.id, number: task.number, type: task.type })),
      })),
    })),
  };
}

/** The URL segments for a task id (`tblt-hsk4.u06.B.t2` → 4 parts). */
export function taskPathParts(taskId: string): {
  bookId: string;
  unitId: string;
  lessonId: string;
  taskId: string;
} | null {
  const parts = taskId.split('.');
  if (parts.length < 4) return null;
  return {
    bookId: parts[0]!,
    unitId: parts[1]!,
    lessonId: parts[2]!,
    taskId: parts.slice(3).join('.'),
  };
}

/** Canonical href for a task, given the language pair. */
export function taskHref(l1: string, l2: string, taskId: string): string {
  const parts = taskPathParts(taskId);
  if (!parts) return `/${l1}/${l2}/tasks`;
  return `/${l1}/${l2}/tasks/${parts.bookId}/${parts.unitId}/${parts.lessonId}/${parts.taskId}`;
}

/** Every task in the book, in reading order. */
export function allTasks(book: BookMeta): Task[] {
  return book.units.flatMap((u) => u.lessons.flatMap((l) => l.tasks));
}

/**
 * The task before/after `taskId` in reading order, for prev/next affordances.
 * Returns null at the ends.
 */
export function adjacentTasks(book: BookMeta, taskId: string): { prev: Task | null; next: Task | null } {
  const tasks = allTasks(book);
  const index = tasks.findIndex((t) => t.id === taskId);
  if (index === -1) return { prev: null, next: null };
  return { prev: tasks[index - 1] ?? null, next: tasks[index + 1] ?? null };
}
