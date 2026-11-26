'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import {
  collectTaskOps,
  relatedTaskIds,
  remoteStateForTask,
  type PersistedTaskState,
  type TaskStateResponse,
} from '@langplayer/textbooks';
import { log } from '@/lib/logger';
import { fetchTaskState, pushTaskOps } from '@/lib/task-sync-client';
import {
  enqueueTaskSyncOps,
  flushTaskSyncOps,
  loadTaskSyncOps,
  newIdempotencyKey,
} from '@/lib/task-sync-queue';
import { loadPersistedTask, savePersistedTask, useTextbookTask } from './task-provider';

/**
 * Task-state sync for one open task (SPEC-111).
 *
 * Rendered inside the task provider and invisible. It does three things:
 *
 * 1. **Adopts the server snapshot** once per (user, task, content version), after
 *    mount — i.e. after hydration, so the server-rendered HTML and the first
 *    client render still agree (the failure ADR-0044 documents).
 * 2. **Mirrors the tasks this one reads from** into their device storage, so a
 *    recall card (D ➐ shows ➏'s draft) and a carried blank render on a second
 *    device without opening those tasks.
 * 3. **Queues every local change** through the durable outbox and flushes it on
 *    a debounce, on reconnect and on tab focus.
 *
 * Signed out, it does nothing at all: the device store is the whole feature.
 */

const FLUSH_DEBOUNCE_MS = 800;

export function TaskSyncBridge() {
  const ctx = useTextbookTask();
  const { data: session, status } = useSession();

  // The JWT callback puts the Supabase access token on the session object
  // (apps/web/src/auth.ts); the public Session type does not declare it.
  const sessionToken = (session as unknown as { accessToken?: unknown } | null)?.accessToken;
  const token = status === 'authenticated' && typeof sessionToken === 'string' ? sessionToken : null;
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;

  const store = ctx?.store ?? null;
  const task = ctx?.task ?? null;
  const contentVersion = ctx?.book.contentVersion ?? 0;

  const adoptedRef = useRef<string | null>(null);
  /** True only during the synchronous adopt: its store notification must not be
   *  mistaken for a student edit and echoed back to the server. */
  const adoptingRef = useRef(false);
  const prevRef = useRef<PersistedTaskState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushRef = useRef<() => void>(() => {});

  const flushNow = useCallback(() => {
    if (!userId || !token) return;
    if (loadTaskSyncOps(userId).length === 0) return;
    void flushTaskSyncOps(userId, (ops) => pushTaskOps(ops, token)).then((result) => {
      if (result === 'failed') log('[LP Web] Task sync: queue kept for the next attempt');
    });
  }, [userId, token]);
  flushRef.current = flushNow;

  const scheduleFlush = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => flushRef.current(), FLUSH_DEBOUNCE_MS);
  }, []);

  // 1 + 2: adopt the server snapshot and mirror the related tasks.
  useEffect(() => {
    if (!store || !task || !userId || !token) return;
    const key = `${userId}:${task.id}:${contentVersion}`;
    if (adoptedRef.current === key) return;
    adoptedRef.current = key;

    let cancelled = false;
    const related = relatedTaskIds(task);
    void fetchTaskState([task.id, ...related], token).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        // A failed read is not fatal: the device copy renders and the queue
        // keeps this device's writes.
        log('[LP Web] Task sync: state read failed with status', result.status);
        return;
      }
      adoptingRef.current = true;
      try {
        adopt(store, task.id, contentVersion, result.state);
      } finally {
        adoptingRef.current = false;
      }
      for (const id of related) mirrorRelatedTask(id, contentVersion, result.state);
      prevRef.current = store.snapshot();
      flushRef.current();
    });

    return () => {
      cancelled = true;
    };
  }, [store, task, userId, token, contentVersion]);

  // 3: queue local changes. The baseline is updated on every notification, so
  // only a blank that actually changed becomes an op.
  useEffect(() => {
    if (!store || !task || !userId) return;
    prevRef.current ??= store.snapshot();
    const unsubscribe = store.subscribe(() => {
      const next = store.snapshot();
      const prev = prevRef.current ?? next;
      prevRef.current = next;
      if (adoptingRef.current) return;
      const drafts = collectTaskOps(task.id, contentVersion, prev, next);
      if (drafts.length === 0) return;
      const ops = drafts.map((draft) => ({
        ...draft,
        op: 'upsert' as const,
        idempotency_key: newIdempotencyKey(draft.entity),
      }));
      enqueueTaskSyncOps(userId, ops);
      scheduleFlush();
    });
    return unsubscribe;
  }, [store, task, userId, contentVersion, scheduleFlush]);

  // Flush on reconnect and when the tab becomes visible again.
  useEffect(() => {
    if (!userId) return;
    const onOnline = () => flushRef.current();
    const onVisible = () => {
      if (document.visibilityState === 'visible') flushRef.current();
    };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [userId]);

  // Drain anything queued before this page opened.
  useEffect(() => {
    if (userId && token && loadTaskSyncOps(userId).length > 0) flushRef.current();
  }, [userId, token]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return null;
}

function adopt(
  store: NonNullable<ReturnType<typeof useTextbookTask>>['store'],
  taskId: string,
  contentVersion: number,
  state: TaskStateResponse,
): void {
  const remote = remoteStateForTask(taskId, state, contentVersion);
  if (!remote.responses && !remote.attempt) return;
  store.adoptRemote(remote);
}

/**
 * Write another task's server answers into its own device slot.
 *
 * `RecallCard` and carried blanks read `loadPersistedTask`, not this task's
 * store, so without this a recall renders empty on the second device.
 */
function mirrorRelatedTask(
  taskId: string,
  contentVersion: number,
  state: TaskStateResponse,
): void {
  const remote = remoteStateForTask(taskId, state, contentVersion);
  const entries = Object.entries(remote.responses ?? {});
  if (entries.length === 0 && !remote.attempt) return;

  const local = loadPersistedTask(taskId);
  const responses = { ...(local?.responses ?? {}) };
  const updatedAt = { ...(local?.updatedAt ?? {}) };
  for (const [blankId, entry] of entries) {
    if (entry.updatedAt > (updatedAt[blankId] ?? 0)) {
      responses[blankId] = entry.value;
      updatedAt[blankId] = entry.updatedAt;
    }
  }
  const attempt =
    remote.attempt && (!local?.attempt || remote.attempt.submittedAt > local.attempt.submittedAt)
      ? remote.attempt
      : (local?.attempt ?? null);
  savePersistedTask({ taskId, contentVersion, responses, attempt, updatedAt });
}
