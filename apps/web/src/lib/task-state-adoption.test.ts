// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { PersistedTaskState } from '@langplayer/textbooks';
import {
  collectTaskOps,
  emptyTaskState,
  liveRecordingSlotsByTask,
  remoteStateForTask,
  type TaskStateResponse,
} from './task-state-adoption';

const TASK = 'tblt-hsk4.u06.D.t7';
const OTHER = 'tblt-hsk4.u06.D.t6';

const state = (overrides: Partial<PersistedTaskState> = {}): PersistedTaskState => ({
  taskId: TASK,
  contentVersion: 3,
  responses: {},
  attempt: null,
  updatedAt: {},
  ...overrides,
});

const server = (overrides: Partial<TaskStateResponse> = {}): TaskStateResponse => ({
  ...emptyTaskState(),
  ...overrides,
});

describe('remoteStateForTask', () => {
  it('takes this task’s rows at the current content version', () => {
    const remote = remoteStateForTask(
      TASK,
      server({
        responses: [
          { taskId: TASK, blankId: 'b1', contentVersion: 3, value: '地铁', updatedAt: 10 },
          { taskId: OTHER, blankId: 'b1', contentVersion: 3, value: '别人的', updatedAt: 10 },
          { taskId: TASK, blankId: 'b2', contentVersion: 2, value: '旧内容', updatedAt: 20 },
        ],
        attempts: [
          {
            taskId: TASK,
            contentVersion: 3,
            responses: { b1: '地铁' },
            result: { taskId: TASK, blanks: [], complete: true, correctCount: 1, scoreableCount: 1 },
            submittedAt: 30,
          },
        ],
      }),
      3,
    );
    expect(remote.responses).toEqual({ b1: { value: '地铁', updatedAt: 10 } });
    expect(remote.attempt?.submittedAt).toBe(30);
    expect(remote.attempt?.result?.complete).toBe(true);
  });

  it('ignores a row written against another content version', () => {
    const remote = remoteStateForTask(
      TASK,
      server({
        attempts: [
          { taskId: TASK, contentVersion: 2, responses: {}, result: { taskId: TASK, blanks: [], complete: true, correctCount: 0, scoreableCount: 0 }, submittedAt: 1 },
        ],
      }),
      3,
    );
    expect(remote.attempt).toBeNull();
  });

  it('handles a missing response body', () => {
    expect(remoteStateForTask(TASK, null, 3)).toEqual({});
  });
});

describe('liveRecordingSlotsByTask', () => {
  it('groups live task recordings by owner and slot', () => {
    const slots = liveRecordingSlotsByTask(
      server({
        files: [
          {
            fileId: 'f1',
            kind: 'task_recording',
            ownerType: 'task',
            ownerId: TASK,
            slot: 'task',
            mime: 'audio/webm',
            byteSize: 10,
            durationMs: 1,
            createdAt: 1,
          },
          {
            fileId: 'f2',
            kind: 'task_recording',
            ownerType: 'task',
            ownerId: TASK,
            slot: 'b1',
            mime: 'audio/webm',
            byteSize: 10,
            durationMs: 1,
            createdAt: 2,
          },
          {
            fileId: 'f3',
            kind: 'user_avatar',
            ownerType: 'user',
            ownerId: TASK,
            slot: '',
            mime: 'image/png',
            byteSize: 10,
            durationMs: null,
            createdAt: 3,
          },
        ],
      }),
    );
    expect([...slots.get(TASK)!].sort()).toEqual(['b1', 'task']);
  });

  it('is empty without files', () => {
    expect(liveRecordingSlotsByTask(null).size).toBe(0);
  });
});

describe('collectTaskOps', () => {
  it('emits one response op per changed blank, carrying its timestamp', () => {
    const ops = collectTaskOps(
      TASK,
      3,
      state(),
      state({ responses: { b1: '地铁' }, updatedAt: { b1: 100 } }),
    );
    expect(ops).toEqual([
      {
        entity: 'task_response',
        entity_id: `${TASK}#b1`,
        payload: { taskId: TASK, blankId: 'b1', contentVersion: 3, value: '地铁', updatedAt: 100 },
        updated_at: 100,
      },
    ]);
  });

  it('ignores an unchanged blank even when its timestamp moved (adoption)', () => {
    const ops = collectTaskOps(
      TASK,
      3,
      state({ responses: { b1: '地铁' }, updatedAt: { b1: 100 } }),
      state({ responses: { b1: '地铁' }, updatedAt: { b1: 999 } }),
    );
    expect(ops).toEqual([]);
  });

  it('ignores a blank that was never locally stamped', () => {
    const ops = collectTaskOps(TASK, 3, state(), state({ responses: { b1: 'x' } }));
    expect(ops).toEqual([]);
  });

  it('emits one attempt op when a new attempt lands', () => {
    const attempt = {
      taskId: TASK,
      contentVersion: 3,
      responses: { b1: 'x' },
      result: { taskId: TASK, blanks: [], complete: true, correctCount: 1, scoreableCount: 1 },
      submittedAt: 500,
    };
    const ops = collectTaskOps(TASK, 3, state(), state({ attempt }));
    expect(ops).toHaveLength(1);
    expect(ops[0]!.entity).toBe('task_attempt');
    expect(ops[0]!.entity_id).toBe(TASK);
    expect(ops[0]!.payload).toMatchObject({ submittedAt: 500, taskId: TASK });
  });

  it('does not re-send an attempt that did not change', () => {
    const attempt = {
      taskId: TASK,
      contentVersion: 3,
      responses: {},
      result: null,
      submittedAt: 500,
    };
    expect(collectTaskOps(TASK, 3, state({ attempt }), state({ attempt }))).toEqual([]);
  });
});
