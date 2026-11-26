import { describe, expect, it } from 'vitest';
import {
  RECORDING_MAX_SEC,
  chunkCount,
  formatDuration,
  hasRecording,
  recordingSlotsIn,
  requiredRecordingSlotsIn,
} from './recordings';
import type { Task } from './types';

const task = (body: Task['body']): Task => ({
  id: 't',
  number: '➐',
  instructions: 'x',
  body,
  blanks: { b1: { id: 'b1', kind: 'free', answer: '' } },
});

describe('recordingSlotsIn', () => {
  it('finds a task-wide slot and applies the defaults', () => {
    const slots = recordingSlotsIn(task([{ kind: 'record' }]));
    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({
      slotId: 'task',
      required: true,
      maxDurationSec: RECORDING_MAX_SEC,
      where: 'body[0]',
    });
  });

  it('carries an explicit slot, prompt, cap and optionality', () => {
    const slots = recordingSlotsIn(
      task([
        {
          kind: 'record',
          slotId: 'b1',
          prompt: '介绍一下',
          maxDurationSec: 60,
          required: false,
        },
      ]),
    );
    expect(slots[0]).toMatchObject({
      slotId: 'b1',
      required: false,
      maxDurationSec: 60,
      prompt: '介绍一下',
    });
  });

  it('ignores every other stimulus kind', () => {
    const slots = recordingSlotsIn(
      task([
        { kind: 'freeWrite', blankId: 'b1' },
        { kind: 'record' },
        { kind: 'recall', taskId: 'x', items: [] },
      ]),
    );
    expect(slots.map((slot) => slot.slotId)).toEqual(['task']);
    expect(slots[0]!.where).toBe('body[1]');
  });

  it('treats a blank slotId as the task slot', () => {
    expect(recordingSlotsIn(task([{ kind: 'record', slotId: '   ' }]))[0]!.slotId).toBe('task');
  });
});

describe('requiredRecordingSlotsIn / hasRecording', () => {
  it('lists only the required slots', () => {
    const t = task([
      { kind: 'record' },
      { kind: 'record', slotId: 'b1', required: false },
    ]);
    expect(requiredRecordingSlotsIn(t)).toEqual(['task']);
    expect(hasRecording(t)).toBe(true);
  });

  it('is empty for a task that never records', () => {
    const t = task([{ kind: 'freeWrite', blankId: 'b1' }]);
    expect(requiredRecordingSlotsIn(t)).toEqual([]);
    expect(hasRecording(t)).toBe(false);
  });
});

describe('formatDuration', () => {
  it('renders mm:ss and h:mm:ss', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(67_000)).toBe('1:07');
    expect(formatDuration(3_723_000)).toBe('1:02:03');
  });

  it('never shows a negative time', () => {
    expect(formatDuration(-500)).toBe('0:00');
  });
});

describe('chunkCount', () => {
  it('rounds up, with at least one part for any bytes', () => {
    expect(chunkCount(0)).toBe(0);
    expect(chunkCount(1)).toBe(1);
    expect(chunkCount(4 * 1024 * 1024)).toBe(1);
    expect(chunkCount(4 * 1024 * 1024 + 1)).toBe(2);
  });
});
