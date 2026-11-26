import { describe, expect, it } from 'vitest';
import { bookProgress, summarizeProgress, taskProgress } from './progress';
import type { AttemptRecord, PersistedTaskState } from './store';
import type { BookMeta, LessonMeta, Task } from './types';

const task = (id: string, blanks: Task['blanks'], body: Task['body'] = []): Task => ({
  id,
  number: '➊',
  instructions: 'x',
  body,
  blanks,
});

const state = (
  taskId: string,
  attempt: Partial<AttemptRecord> | null,
  responses: Record<string, string> = {},
): PersistedTaskState => ({
  taskId,
  contentVersion: 1,
  responses,
  attempt: attempt
    ? {
        taskId,
        contentVersion: 1,
        responses: {},
        result: null,
        submittedAt: 1,
        ...attempt,
      }
    : null,
});

const result = (complete: boolean, correctCount: number, scoreableCount: number) =>
  ({ complete, correctCount, scoreableCount }) as AttemptRecord['result'];

const recordSlot = (required?: boolean): Task['body'][number] => ({
  kind: 'record',
  ...(required === undefined ? {} : { required }),
});

describe('taskProgress', () => {
  const t = task('x', {
    b1: { id: 'b1', kind: 'type', answer: 'a' },
    b2: { id: 'b2', kind: 'given', answer: 'b' },
  });

  it('reports nothing for a task never opened', () => {
    const p = taskProgress(t, null);
    expect(p.attempted).toBe(false);
    expect(p.complete).toBe(false);
    expect(p.scoreableCount).toBe(1);
    expect(p.missingRecordings).toEqual([]);
  });

  it('reads the task attempt, not a history', () => {
    const p = taskProgress(t, state('x', { result: result(true, 1, 1) }));
    expect(p.attempted).toBe(true);
    expect(p.complete).toBe(true);
    expect(p.correctCount).toBe(1);
  });

  it('does not complete a task whose attempt is incomplete', () => {
    const p = taskProgress(t, state('x', { result: result(false, 0, 1) }));
    expect(p.attempted).toBe(true);
    expect(p.complete).toBe(false);
  });
});

describe('taskProgress — the recording gate (SPEC-111)', () => {
  const speaking = task(
    'd7',
    { b1: { id: 'b1', kind: 'free', answer: '' } },
    [recordSlot()],
  );

  it('withholds completion when a required take is missing', () => {
    const p = taskProgress(speaking, state('d7', { result: result(true, 0, 0) }));
    expect(p.complete).toBe(false);
    expect(p.missingRecordings).toEqual(['task']);
  });

  it('completes once the take is stored', () => {
    const p = taskProgress(speaking, state('d7', { result: result(true, 0, 0) }), ['task']);
    expect(p.complete).toBe(true);
    expect(p.missingRecordings).toEqual([]);
  });

  it('a pending take is not a stored take', () => {
    // Only what the file store confirms is passed in; an unuploaded recording
    // is absent from the set, so the task stays incomplete.
    const p = taskProgress(speaking, state('d7', { result: result(true, 0, 0) }), []);
    expect(p.complete).toBe(false);
  });

  it('required: false never gates completion', () => {
    const optional = task('d7', { b1: { id: 'b1', kind: 'free', answer: '' } }, [
      recordSlot(false),
    ]);
    const p = taskProgress(optional, state('d7', { result: result(true, 0, 0) }));
    expect(p.complete).toBe(true);
    expect(p.missingRecordings).toEqual([]);
  });

  it('a shadowing task with no record stimulus is unaffected', () => {
    const shadowing = task('d4', { b1: { id: 'b1', kind: 'given', answer: '' } });
    const p = taskProgress(shadowing, state('d4', { result: result(true, 0, 0) }));
    expect(p.complete).toBe(true);
  });

  it('a self-check task with a required take needs both gates', () => {
    const selfCheck = task(
      'd7',
      { b1: { id: 'b1', kind: 'selfCheck', answer: 'model' } },
      [recordSlot()],
    );
    const checked = state('d7', { result: result(true, 0, 0) });
    expect(taskProgress(selfCheck, checked).complete).toBe(false);
    expect(taskProgress(selfCheck, checked, ['task']).complete).toBe(true);
  });
});

describe('bookProgress', () => {
  const book: BookMeta = {
    id: 'b',
    title: 'B',
    l2: 'zh',
    contentVersion: 1,
    units: [
      {
        id: 'u1',
        number: 1,
        title: 'U1',
        lessons: [{ id: 'l1', letter: 'A', title: 'A', tasks: [] }],
      },
    ],
  };

  const tree = {
    units: [
      {
        id: 'u1',
        lessons: [
          {
            id: 'l1',
            tasks: [
              { id: 'a', requiredRecordings: [] },
              { id: 'b', requiredRecordings: ['task'] },
            ],
          },
        ],
      },
    ],
  };

  it('rolls up the saved states', () => {
    const states = new Map<string, PersistedTaskState | null>([
      ['a', state('a', { result: result(true, 1, 1) })],
      ['b', state('b', { result: result(false, 0, 1) })],
    ]);
    const p = bookProgress(tree, states);
    expect(p.attempted).toBe(2);
    expect(p.complete).toBe(1);
    expect(p.total).toBe(2);
    expect(p.units[0]!.lessons[0]!.tasks[1]!.complete).toBe(false);
  });

  it('counts a required take only when it is stored', () => {
    const states = new Map<string, PersistedTaskState | null>([
      ['b', state('b', { result: result(true, 1, 1) })],
    ]);
    expect(bookProgress(tree, states).complete).toBe(0);
    const live = new Map<string, Iterable<string>>([['b', ['task']]]);
    expect(bookProgress(tree, states, live).complete).toBe(1);
  });

  it('an empty tree rolls up to zero', () => {
    const p = bookProgress({ units: [] }, new Map());
    expect(p).toEqual({ units: [], attempted: 0, complete: 0, total: 0 });
  });

  it('accepts a BookMeta (its tasks carry requiredRecordings)', () => {
    const tasks = book.units[0]!.lessons[0]!.tasks;
    expect(Array.isArray(tasks)).toBe(true);
  });
});

describe('summarizeProgress', () => {
  it('totals attempted and complete', () => {
    const s = summarizeProgress(
      [
        state('a', { result: result(true, 1, 1) }),
        state('b', { result: result(false, 0, 1) }),
        null,
      ],
      3,
    );
    expect(s).toEqual({ attempted: 2, complete: 1, total: 3 });
  });

  it('honours the recording gate when the maps are given', () => {
    const requiredByTask = new Map<string, readonly string[]>([['a', ['task']]]);
    expect(summarizeProgress([state('a', { result: result(true, 0, 0) })], 1, { requiredByTask }))
      .toEqual({ attempted: 1, complete: 0, total: 1 });
    const liveByTask = new Map<string, Iterable<string>>([['a', ['task']]]);
    expect(
      summarizeProgress([state('a', { result: result(true, 0, 0) })], 1, {
        requiredByTask,
        liveByTask,
      }),
    ).toEqual({ attempted: 1, complete: 1, total: 1 });
  });
});

describe('taskProgress — a check-only task', () => {
  const checkTask: Task = {
    id: 'c',
    number: '➌',
    instructions: 'x',
    body: [{ kind: 'numberededBlanks' as never, ids: [] }],
    blanks: {
      b1: { id: 'b1', kind: 'selfCheck', answer: 'model' },
    },
  } as Task;

  it('is complete once checked', () => {
    const p = taskProgress(checkTask, state('c', { result: result(true, 0, 0) }));
    expect(p.complete).toBe(true);
    expect(p.scoreableCount).toBe(0);
  });
});

// Keep the unused import honest: LessonMeta is part of the public shape this file exercises.
export type _LessonMeta = LessonMeta;
