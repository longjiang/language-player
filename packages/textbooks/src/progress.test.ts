import { describe, expect, it } from 'vitest';
import { bookProgress, summarizeProgress, taskProgress } from './progress';
import type { AttemptRecord, PersistedTaskState } from './store';
import type { BookMeta, LessonMeta, Task } from './types';

const task = (id: string, blanks: Task['blanks']): Task => ({
  id,
  number: '➊',
  instructions: 'x',
  body: [{ kind: 'numberededBlanks' as never, ids: [] }],
  blanks,
});

const state = (taskId: string, attempts: Partial<AttemptRecord>[]): PersistedTaskState => ({
  taskId,
  contentVersion: 1,
  responses: {},
  attempts: attempts.map((a, i) => ({
    id: `a${i}`,
    taskId,
    contentVersion: 1,
    responses: {},
    result: null,
    submittedAt: i,
    ...a,
  })) as AttemptRecord[],
});

const result = (complete: boolean, correctCount: number, scoreableCount: number) =>
  ({ complete, correctCount, scoreableCount }) as AttemptRecord['result'];

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
  });

  it('counts only the latest un-voided attempt', () => {
    // A student who got it wrong and then right has completed the task.
    const p = taskProgress(
      t,
      state('x', [
        { result: result(false, 0, 1) },
        { result: result(true, 1, 1) },
        { result: result(false, 0, 1), voidedAt: 99 },
      ]),
    );
    expect(p.attempted).toBe(true);
    expect(p.complete).toBe(true);
    expect(p.correctCount).toBe(1);
  });

  it('does not count a voided attempt as the latest', () => {
    const p = taskProgress(t, state('x', [{ result: result(true, 1, 1), voidedAt: 5 }]));
    expect(p.attempted).toBe(false);
  });
});

describe('bookProgress', () => {
  const lesson = (id: string, tasks: Task[]): LessonMeta =>
    ({ id, letter: id, title: 't', canDo: 'c', tasks }) as LessonMeta;
  const t = (id: string) => task(id, { b1: { id: 'b1', kind: 'type', answer: 'a' } });
  const book = {
    id: 'b',
    title: 'B',
    l2: 'zh',
    contentVersion: 1,
    units: [{ id: 'u06', lessons: [lesson('A', [t('b.u06.A.t1'), t('b.u06.A.t2')]), lesson('B', [t('b.u06.B.t1')])] }],
  } as unknown as BookMeta;

  it('rolls up through lessons and units', () => {
    const states = new Map<string, PersistedTaskState | null>([
      ['b.u06.A.t1', state('b.u06.A.t1', [{ result: result(true, 1, 1) }])],
      ['b.u06.A.t2', state('b.u06.A.t2', [{ result: result(false, 0, 1) }])],
    ]);
    const p = bookProgress(book, states);
    expect([p.attempted, p.complete, p.total]).toEqual([2, 1, 3]);
    expect(p.units[0]!.lessons[0]).toMatchObject({ attempted: 2, complete: 1, total: 2 });
    expect(p.units[0]!.lessons[1]).toMatchObject({ attempted: 0, complete: 0, total: 1 });
  });

  it('reports zero for an untouched book', () => {
    const p = bookProgress(book, new Map());
    expect([p.attempted, p.complete, p.total]).toEqual([0, 0, 3]);
  });
});

describe('summarizeProgress', () => {
  it('counts attempted and complete without a tree', () => {
    const s = summarizeProgress(
      [
        state('a', [{ result: result(true, 1, 1) }]),
        state('b', [{ result: result(false, 0, 1) }]),
        null,
      ],
      5,
    );
    expect(s).toEqual({ attempted: 2, complete: 1, total: 5 });
  });

  it('ignores a task whose only attempt was voided', () => {
    expect(summarizeProgress([state('a', [{ result: result(true, 1, 1), voidedAt: 1 }])], 3)).toEqual({
      attempted: 0,
      complete: 0,
      total: 3,
    });
  });
});

/**
 * C ➌ is check-only: it has no scoreable blank, so a graded result can never be `complete`
 * (that needs at least one scoreable blank, all right). Its completion is the attempt
 * `recordChecked` writes when every question has been checked, and it must read as complete
 * here — the TOC and the picker both go through this summary.
 */
describe('taskProgress — a check-only task', () => {
  const t = task('tblt-hsk4.u06.C.t3', {
    b1: { id: 'b1', kind: 'selfCheck', answer: '一' },
    b2: { id: 'b2', kind: 'selfCheck', answer: '二' },
  });

  it('counts no scoreable blank', () => {
    expect(taskProgress(t, null).scoreableCount).toBe(0);
  });

  it('is complete once the check-completion attempt is recorded', () => {
    const p = taskProgress(t, state('tblt-hsk4.u06.C.t3', [{ result: result(true, 0, 0) }]));
    expect(p.attempted).toBe(true);
    expect(p.complete).toBe(true);
  });

  it('is not complete from reveals alone', () => {
    const p = taskProgress(t, {
      taskId: 'tblt-hsk4.u06.C.t3',
      contentVersion: 1,
      responses: { b1: '1' },
      attempts: [],
    });
    expect(p.attempted).toBe(false);
    expect(p.complete).toBe(false);
  });
});
