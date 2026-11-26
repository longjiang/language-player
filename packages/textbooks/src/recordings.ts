/**
 * Recording slots (SPEC-111).
 *
 * A `record` stimulus declares a slot the student records into. These helpers are
 * the one place that answers "where can a recording slot be declared" and "which
 * slots are required", so the validator, the completion gate and the renderer
 * cannot disagree.
 *
 * Only the task body is walked today: D ➐'s slot is task-wide. Item-level slots
 * (a table row, a numbered item) are added when a task needs one, because the
 * walker is the only thing that has to change.
 */

import type { RecordStimulus, Task } from './types';

/** Default stop limit for a take: 30 minutes. Enforced by the recorder, not the server. */
export const RECORDING_MAX_SEC = 1800;

/** Per-file size bound the store enforces (SPEC-113 `task_recording` kind). */
export const RECORDING_BYTES_CAP = 32 * 1024 * 1024;

/** Upload part size for the resumable path (SPEC-113). */
export const RECORDING_CHUNK_BYTES = 4 * 1024 * 1024;

export interface RecordingSlot {
  slotId: string;
  /** A stored take is required before the task counts as complete. */
  required: boolean;
  maxDurationSec: number;
  prompt?: string;
  /** Where it was declared, so a validator message can point at the right place. */
  where: string;
}

/** Every recording slot a task declares, in body order. */
export function recordingSlotsIn(task: Task): RecordingSlot[] {
  const slots: RecordingSlot[] = [];
  task.body.forEach((stimulus, index) => {
    if (stimulus.kind !== 'record') return;
    slots.push(slotOf(stimulus, `body[${index}]`));
  });
  return slots;
}

/** Slots a stored take must exist for, or completion is withheld. */
export function requiredRecordingSlotsIn(task: Task): string[] {
  return recordingSlotsIn(task)
    .filter((slot) => slot.required)
    .map((slot) => slot.slotId);
}

/** Whether the task records at all (required or not). */
export function hasRecording(task: Task): boolean {
  return recordingSlotsIn(task).length > 0;
}

/** `01:07` for a sub-hour take, `1:02:03` above it. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes);
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Number of upload parts a file of `bytes` needs (at least one). */
export function chunkCount(bytes: number, chunkBytes = RECORDING_CHUNK_BYTES): number {
  if (!Number.isFinite(bytes) || bytes <= 0) return 0;
  return Math.ceil(bytes / chunkBytes);
}

function slotOf(stimulus: RecordStimulus, where: string): RecordingSlot {
  const slotId = stimulus.slotId?.trim() || 'task';
  return {
    slotId,
    required: stimulus.required !== false,
    maxDurationSec: stimulus.maxDurationSec ?? RECORDING_MAX_SEC,
    prompt: stimulus.prompt,
    where,
  };
}
