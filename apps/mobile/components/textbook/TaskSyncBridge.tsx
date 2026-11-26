import { useEffect, useRef } from 'react';
import {
  relatedTaskIds,
  remoteStateForTask,
  type PersistedTaskState,
  type TaskStateResponse,
} from '@langplayer/textbooks';
import { useAuth } from '@/contexts/AuthContext';
import { log } from '@/lib/logger';
import { fetchTaskState } from '@/lib/task-sync-client';
import { enqueueTaskChanges } from '@/lib/task-sync';
import { loadPersistedTask, savePersistedTask, useTextbookTask } from './task-provider';

/**
 * Task-state sync for one open task (SPEC-111, mobile).
 *
 * Mirrors the web bridge: adopt the server snapshot once per (user, task,
 * content version) after mount, mirror the tasks this one reads from into their
 * device slots (so ➐'s recall of ➏ and B ➏'s carried pictures survive a second
 * device), and queue local changes through the outbox. Signed out it does
 * nothing; offline the outbox holds the writes until the sync engine runs.
 */
export function TaskSyncBridge() {
  const ctx = useTextbookTask();
  const { token, user } = useAuth();

  const store = ctx?.store ?? null;
  const task = ctx?.task ?? null;
  const contentVersion = ctx?.book.contentVersion ?? 0;

  const adoptedRef = useRef<string | null>(null);
  const prevRef = useRef<PersistedTaskState | null>(null);
  const adoptingRef = useRef(false);

  useEffect(() => {
    if (!store || !task || !token || !user?.id) return;
    const key = `${user.id}:${task.id}:${contentVersion}`;
    if (adoptedRef.current === key) return;
    adoptedRef.current = key;

    let cancelled = false;
    const related = relatedTaskIds(task);
    void fetchTaskState([task.id, ...related], token).then(async (result) => {
      if (cancelled) return;
      if (!result.ok) {
        log('[LP Mobile] Task sync: state read failed with status', result.status);
        return;
      }
      adoptingRef.current = true;
      try {
        store.adoptRemote(remoteStateForTask(task.id, result.state, contentVersion));
      } finally {
        adoptingRef.current = false;
      }
      for (const id of related) await mirrorRelatedTask(id, contentVersion, result.state);
      prevRef.current = store.snapshot();
    });

    return () => {
      cancelled = true;
    };
  }, [store, task, token, user?.id, contentVersion]);

  useEffect(() => {
    if (!store || !task || !user?.id) return;
    prevRef.current ??= store.snapshot();
    const unsubscribe = store.subscribe(() => {
      const next = store.snapshot();
      const prev = prevRef.current ?? next;
      prevRef.current = next;
      if (adoptingRef.current) return;
      void enqueueTaskChanges(task.id, contentVersion, prev, next).catch((err) => {
        log('[LP Mobile] Task sync: enqueue failed', err);
      });
    });
    return unsubscribe;
  }, [store, task, user?.id, contentVersion]);

  return null;
}

async function mirrorRelatedTask(
  taskId: string,
  contentVersion: number,
  state: TaskStateResponse,
): Promise<void> {
  const remote = remoteStateForTask(taskId, state, contentVersion);
  const entries = Object.entries(remote.responses ?? {});
  if (entries.length === 0 && !remote.attempt) return;

  const local = await loadPersistedTask(taskId);
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
