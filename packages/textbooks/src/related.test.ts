import { describe, expect, it } from 'vitest';
import { relatedTaskIds } from './related';
import type { Task } from './types';

const task = (body: Task['body'], blanks: Task['blanks'] = {}): Task => ({
  id: 'tblt-hsk4.u06.D.t7',
  number: '➐',
  instructions: 'x',
  body,
  blanks,
});

describe('relatedTaskIds', () => {
  it('includes a recalled task', () => {
    const ids = relatedTaskIds(
      task([{ kind: 'recall', taskId: 'tblt-hsk4.u06.D.t6', items: [] }]),
    );
    expect(ids).toEqual(['tblt-hsk4.u06.D.t6']);
  });

  it('includes the task a carried blank comes from', () => {
    const ids = relatedTaskIds(
      task([], {
        b1: {
          id: 'b1',
          kind: 'carried',
          answer: '',
          carriedFrom: { taskId: 'tblt-hsk4.u06.B.t5', blankId: 'b1' },
        },
      }),
    );
    expect(ids).toEqual(['tblt-hsk4.u06.B.t5']);
  });

  it('de-duplicates and never returns the task itself', () => {
    const ids = relatedTaskIds(
      task(
        [
          { kind: 'recall', taskId: 'x', items: [] },
          { kind: 'recall', taskId: 'x', items: [] },
          { kind: 'recall', taskId: 'tblt-hsk4.u06.D.t7', items: [] },
        ],
        {},
      ),
    );
    expect(ids).toEqual(['x']);
  });

  it('is empty for a self-contained task', () => {
    expect(relatedTaskIds(task([{ kind: 'freeWrite', blankId: 'b1' }]))).toEqual([]);
  });
});
