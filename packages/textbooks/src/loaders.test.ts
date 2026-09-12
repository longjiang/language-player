import { describe, expect, it } from 'vitest';
import {
  adjacentTasks,
  allTasks,
  buildTocTree,
  findLesson,
  findTask,
  loadBook,
  taskHref,
  taskPathParts,
  TEXTBOOK_CATALOGUE,
  bookLoaders,
} from './loaders';

describe('catalogue and loaders', () => {
  it('has a loader for every catalogued book', () => {
    for (const entry of TEXTBOOK_CATALOGUE) {
      expect(bookLoaders[entry.id]).toBeTypeOf('function');
    }
  });

  it('loads the pilot book', async () => {
    const book = await loadBook('tblt-hsk4');
    expect(book?.id).toBe('tblt-hsk4');
    expect(book?.l2).toBe('zh');
    expect(book?.units.length).toBeGreaterThan(0);
  });

  it('returns null for an unknown book rather than throwing', async () => {
    expect(await loadBook('nope')).toBeNull();
  });
});

describe('task id ⇄ URL segments', () => {
  it('splits a canonical id into route segments', () => {
    expect(taskPathParts('tblt-hsk4.u06.B.t2')).toEqual({
      bookId: 'tblt-hsk4',
      unitId: 'u06',
      lessonId: 'B',
      taskId: 't2',
    });
  });

  it('rejects an id that is too short to route', () => {
    expect(taskPathParts('tblt-hsk4.u06')).toBeNull();
  });

  it('builds a web href that round-trips back to the task id', () => {
    for (const id of ['tblt-hsk4.u06.B.t2', 'tblt-hsk4.u12.D.t11']) {
      const href = taskHref('en', 'zh', id);
      // /{l1}/{l2}/tasks/{bookId}/{unitId}/{lessonId}/{taskId}
      const [, , , , bookId, unitId, lessonId, taskId] = href.split('/');
      expect(`${bookId}.${unitId}.${lessonId}.${taskId}`).toBe(id);
    }
  });

  it('falls back to the picker for an unroutable id', () => {
    expect(taskHref('en', 'zh', 'broken')).toBe('/en/zh/tasks');
  });
});

describe('lookups', () => {
  it('finds a task and the lesson containing it', async () => {
    const book = (await loadBook('tblt-hsk4'))!;
    const task = findTask(book, 'tblt-hsk4.u06.B.t2');
    expect(task?.number).toBe('➋');
    expect(findLesson(book, 'B')?.tasks.some((t) => t.id === task!.id)).toBe(true);
  });

  it('returns null for an unknown task or lesson', async () => {
    const book = (await loadBook('tblt-hsk4'))!;
    expect(findTask(book, 'tblt-hsk4.u06.Z.t9')).toBeNull();
    expect(findLesson(book, 'Z')).toBeNull();
  });

  it('walks tasks in reading order with prev/next', async () => {
    const book = (await loadBook('tblt-hsk4'))!;
    const tasks = allTasks(book);
    if (tasks.length < 2) return;
    const { prev, next } = adjacentTasks(book, tasks[1]!.id);
    expect(prev?.id).toBe(tasks[0]!.id);
    expect(adjacentTasks(book, tasks[0]!.id).prev).toBeNull();
  });
});

describe('TOC tree', () => {
  it('excludes task bodies, so answers are not serialised to the client', async () => {
    const book = (await loadBook('tblt-hsk4'))!;
    const tree = buildTocTree(book);
    const serialised = JSON.stringify(tree);
    // The passage text and the answer key must not appear in the TOC payload.
    expect(serialised).not.toContain('和谐号');
    expect(serialised).not.toContain('免费Wi-Fi');
    expect(serialised).not.toContain('answerKeyRaw');
  });

  it('keeps the ids a route needs', async () => {
    const book = (await loadBook('tblt-hsk4'))!;
    const tree = buildTocTree(book);
    const lessonIds = tree.units[0]!.lessons.map((l) => l.id);
    // Lessons come out in workbook order, not alphabetically by accident.
    expect(lessonIds).toEqual(['A', 'B', 'C', 'D', 'E']);
    const allTaskIds = tree.units.flatMap((u) => u.lessons.flatMap((l) => l.tasks.map((t) => t.id)));
    expect(allTaskIds).toContain('tblt-hsk4.u06.A.t2');
    expect(allTaskIds).toContain('tblt-hsk4.u06.B.t2');
    expect(allTaskIds).toContain('tblt-hsk4.u06.C.t4');
    expect(allTaskIds).toContain('tblt-hsk4.u06.E.t1');
    expect(allTaskIds).toContain('tblt-hsk4.u06.D.t6');
    expect(tree.contentVersion).toBe(book.contentVersion);
  });
});
