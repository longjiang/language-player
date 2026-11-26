/**
 * Reading persisted task state (SPEC-111).
 *
 * The shape changed when attempts stopped being an append-only log: a task now
 * holds one mutable attempt. Saved state on devices still has the old
 * `attempts: AttemptRecord[]` shape, so every load goes through this normaliser
 * before the store sees it. Keeping it here means both apps run one migration
 * instead of two slightly different ones, and a legacy array cannot reach the
 * store at all.
 */

import type { AttemptRecord, PersistedTaskState } from './store';
import type { TaskResult } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringMap(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') out[key] = entry;
  }
  return out;
}

function resultOf(value: unknown): TaskResult | null {
  return isRecord(value) ? (value as unknown as TaskResult) : null;
}

/** One attempt from either the current shape or the legacy log entry. */
function normaliseAttempt(value: unknown): AttemptRecord | null {
  if (!isRecord(value)) return null;
  if (typeof value.taskId !== 'string') return null;
  if (typeof value.submittedAt !== 'number') return null;
  return {
    taskId: value.taskId,
    contentVersion: typeof value.contentVersion === 'number' ? value.contentVersion : 0,
    responses: stringMap(value.responses),
    result: resultOf(value.result),
    submittedAt: value.submittedAt,
  };
}

/**
 * The single attempt a legacy array collapses to.
 *
 * The latest un-voided entry is the one that counted; if every entry was voided
 * (a student who submitted, edited, and never re-submitted) the newest entry is
 * still the honest record of what happened.
 */
function latestLegacyAttempt(list: unknown): AttemptRecord | null {
  if (!Array.isArray(list) || list.length === 0) return null;
  const entries = list.filter(isRecord);
  const live = entries.filter((entry) => entry.voidedAt == null);
  const pool = live.length > 0 ? live : entries;
  const newest = pool.reduce<Record<string, unknown> | null>((best, entry) => {
    if (best === null) return entry;
    const a = typeof entry.submittedAt === 'number' ? entry.submittedAt : -Infinity;
    const b = typeof best.submittedAt === 'number' ? best.submittedAt : -Infinity;
    return a >= b ? entry : best;
  }, null);
  return normaliseAttempt(newest);
}

/**
 * Coerce anything read from device storage into the current shape.
 *
 * Returns null when there is nothing usable (no task id), so a corrupt entry is
 * a miss rather than a crash.
 */
export function normalisePersistedTaskState(raw: unknown): PersistedTaskState | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.taskId !== 'string' || raw.taskId === '') return null;

  const attempt =
    normaliseAttempt(raw.attempt) ?? latestLegacyAttempt(raw.attempts) ?? null;

  return {
    taskId: raw.taskId,
    contentVersion: typeof raw.contentVersion === 'number' ? raw.contentVersion : 0,
    responses: stringMap(raw.responses),
    attempt,
  };
}
