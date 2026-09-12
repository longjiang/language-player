import { describe, expect, it, vi } from 'vitest';
import { TaskResponseStore } from './store';
import type { PersistedTaskState } from './store';
import type { Task } from './types';

const task: Task = {
  id: 'tblt-hsk4.u06.B.t2',
  number: '➋',
  instructions: '填词',
  body: [{ kind: 'passage', text: '{{b1}}{{b2}}{{b3}}' }],
  blanks: {
    b1: { id: 'b1', kind: 'given', answer: '快' },
    b2: { id: 'b2', kind: 'choose', answer: '新', bank: 'w1' },
    b3: { id: 'b3', kind: 'choose', answer: '免费Wi-Fi', bank: 'w1' },
  },
  banks: [{ id: 'w1', items: ['新', '免费Wi-Fi'] }],
};

const make = (over: Partial<ConstructorParameters<typeof TaskResponseStore>[0]> = {}) =>
  new TaskResponseStore({ task, contentVersion: 1, ...over });

describe('TaskResponseStore', () => {
  it('pre-fills given blanks and leaves the rest empty', () => {
    const store = make();
    expect(store.getValue('b1')).toBe('快');
    expect(store.getValue('b2')).toBe('');
  });

  it('refuses to edit a given blank', () => {
    const store = make();
    store.setValue('b1', '别的');
    expect(store.getValue('b1')).toBe('快');
  });

  it('notifies subscribers on change and only once for a no-op', () => {
    const store = make();
    const listener = vi.fn();
    store.subscribe(listener);
    store.setValue('b2', '新');
    expect(listener).toHaveBeenCalledTimes(1);
    store.setValue('b2', '新');
    expect(listener).toHaveBeenCalledTimes(1); // unchanged value
  });

  it('stops notifying after unsubscribe', () => {
    const store = make();
    const listener = vi.fn();
    const off = store.subscribe(listener);
    off();
    store.setValue('b2', '新');
    expect(listener).not.toHaveBeenCalled();
  });

  it('grades on submit and excludes given blanks from the score', () => {
    const store = make();
    store.setValue('b2', '新');
    store.setValue('b3', '免费Wi-Fi');
    const result = store.submit();
    expect(result.scoreableCount).toBe(2);
    expect(result.correctCount).toBe(2);
    expect(result.complete).toBe(true);
    expect(store.isSubmitted()).toBe(true);
    expect(store.getResult()).toBe(result);
  });

  it('clears the verdict when an answer changes after submit', () => {
    const store = make();
    store.setValue('b2', '新');
    store.setValue('b3', '免费Wi-Fi');
    store.submit();
    store.setValue('b3', '充电口');
    expect(store.isSubmitted()).toBe(false);
    expect(store.getResult()).toBeNull();
  });

  it('counts answered blanks for progress', () => {
    const store = make();
    expect(store.getAnsweredCount()).toBe(0);
    expect(store.getScoreableCount()).toBe(2);
    store.setValue('b2', '新');
    expect(store.getAnsweredCount()).toBe(1);
  });

  it('records attempts append-only and voids the previous one', () => {
    const store = make();
    store.setValue('b2', '新');
    store.setValue('b3', '免费Wi-Fi');
    store.submit();
    store.setValue('b3', '充电口');
    store.submit();

    const attempts = store.getAttempts();
    expect(attempts).toHaveLength(2);
    expect(attempts[0]!.voidedAt).toBeTypeOf('number');
    expect(attempts[1]!.voidedAt).toBeUndefined();
    // The superseded attempt keeps its own answers and result.
    expect(attempts[0]!.result!.complete).toBe(true);
    expect(attempts[1]!.result!.complete).toBe(false);
  });

  it('restores persisted responses', () => {
    const persisted: PersistedTaskState = {
      taskId: task.id,
      contentVersion: 1,
      responses: { b2: '新', b3: '免费Wi-Fi' },
      attempts: [],
    };
    const store = make({ load: () => persisted });
    expect(store.getValue('b2')).toBe('新');
    expect(store.getValue('b3')).toBe('免费Wi-Fi');
    expect(store.getValue('b1')).toBe('快'); // still pre-filled
  });

  it('discards responses saved against an older content version', () => {
    const stale: PersistedTaskState = {
      taskId: task.id,
      contentVersion: 0,
      responses: { b2: '旧答案' },
      attempts: [],
    };
    const store = make({ load: () => stale });
    expect(store.getValue('b2')).toBe('');
  });

  it('persists after every change and on submit', () => {
    const save = vi.fn();
    const store = make({ save });
    store.setValue('b2', '新');
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]![0].responses.b2).toBe('新');
    store.submit();
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1]![0].attempts).toHaveLength(1);
  });

  it('reset clears answers but keeps the attempt history', () => {
    const store = make();
    store.setValue('b2', '新');
    store.submit();
    store.reset();
    expect(store.getValue('b2')).toBe('');
    expect(store.getValue('b1')).toBe('快');
    expect(store.getResult()).toBeNull();
    expect(store.getAttempts()).toHaveLength(1);
  });

  it('snapshots defensively (mutating the copy cannot corrupt state)', () => {
    const store = make();
    const snap = store.snapshot();
    snap.responses.b2 = '篡改';
    expect(store.getValue('b2')).toBe('');
  });
});
