import { describe, expect, it } from 'vitest';
import { normalisePersistedTaskState } from './persisted-state';

const attempt = {
  taskId: 't',
  contentVersion: 1,
  responses: { b1: 'x' },
  result: { complete: true },
  submittedAt: 5,
};

describe('normalisePersistedTaskState', () => {
  it('passes the current shape through', () => {
    const out = normalisePersistedTaskState({
      taskId: 't',
      contentVersion: 1,
      responses: { b1: 'x' },
      attempt,
    });
    expect(out).toEqual({ taskId: 't', contentVersion: 1, responses: { b1: 'x' }, attempt });
  });

  it('collapses a legacy attempts[] to the latest un-voided entry', () => {
    const out = normalisePersistedTaskState({
      taskId: 't',
      contentVersion: 1,
      responses: {},
      attempts: [
        { ...attempt, submittedAt: 1, voidedAt: 5, result: { complete: true } },
        { ...attempt, submittedAt: 2, result: { complete: false } },
      ],
    });
    expect(out?.attempt?.submittedAt).toBe(2);
    expect(out?.attempt?.result).toEqual({ complete: false });
  });

  it('keeps the newest entry even when every entry was voided', () => {
    const out = normalisePersistedTaskState({
      taskId: 't',
      contentVersion: 1,
      responses: {},
      attempts: [
        { ...attempt, submittedAt: 1, voidedAt: 2 },
        { ...attempt, submittedAt: 3, voidedAt: 4 },
      ],
    });
    expect(out?.attempt?.submittedAt).toBe(3);
  });

  it('drops the legacy id and voidedAt', () => {
    const out = normalisePersistedTaskState({
      taskId: 't',
      contentVersion: 1,
      responses: {},
      attempts: [{ ...attempt, id: 'legacy#1', voidedAt: 9 }],
    });
    expect(out?.attempt).toEqual(attempt);
    expect(out && 'id' in out.attempt!).toBe(false);
  });

  it('ignores non-string responses rather than trusting the blob', () => {
    const out = normalisePersistedTaskState({
      taskId: 't',
      contentVersion: 1,
      responses: { b1: 'x', b2: 3, b3: null },
      attempt: null,
    });
    expect(out?.responses).toEqual({ b1: 'x' });
  });

  it('returns null when there is no usable task id', () => {
    expect(normalisePersistedTaskState(null)).toBeNull();
    expect(normalisePersistedTaskState('nope')).toBeNull();
    expect(normalisePersistedTaskState({})).toBeNull();
    expect(normalisePersistedTaskState({ taskId: '' })).toBeNull();
  });

  it('defaults a missing content version to 0 (which then reads as stale)', () => {
    const out = normalisePersistedTaskState({ taskId: 't', responses: {} });
    expect(out?.contentVersion).toBe(0);
    expect(out?.attempt).toBeNull();
  });

  it('skips an unreadable attempt instead of failing the whole state', () => {
    const out = normalisePersistedTaskState({
      taskId: 't',
      contentVersion: 1,
      responses: { b1: 'x' },
      attempt: { taskId: 't' },
    });
    expect(out?.attempt).toBeNull();
    expect(out?.responses).toEqual({ b1: 'x' });
  });
});
