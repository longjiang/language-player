'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  BlankSelectionStore,
  TaskResponseStore,
  type BookMeta,
  type PersistedTaskState,
  type Task,
} from '@langplayer/textbooks';
import { expandAcceptedVariants } from '@langplayer/textbooks';
import { toTraditional } from '@/lib/chinese-script';
import { log } from '@/lib/logger';

export interface TextbookTaskContextValue {
  task: Task;
  book: BookMeta;
  store: TaskResponseStore;
  /** Which blank the option bank fills next. */
  selection: BlankSelectionStore;
}

const TextbookTaskContext = createContext<TextbookTaskContextValue | null>(null);

/**
 * Read the current textbook task, or null when not inside one.
 *
 * `TokenizedText` uses this to decide whether to render `{{bN}}` markers as
 * interactive blanks. Returning null outside a task keeps the component's
 * existing behaviour untouched everywhere else.
 */
export function useTextbookTask(): TextbookTaskContextValue | null {
  return useContext(TextbookTaskContext);
}

export const TEXTBOOK_STORAGE_PREFIX = 'lp:textbook:';

/**
 * Read a saved attempt from localStorage.
 *
 * ADR-0044 makes exercise state local-only, so this is the whole persistence
 * layer: no request, no account binding. localStorage is synchronous, which is
 * why the store can be built in one render.
 */
export function loadPersistedTask(taskId: string): PersistedTaskState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(TEXTBOOK_STORAGE_PREFIX + taskId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedTaskState;
    if (!parsed || typeof parsed !== 'object' || parsed.taskId !== taskId) return null;
    return parsed;
  } catch (err) {
    log('[LP Web] Textbook: failed to read saved state for', taskId, err);
    return null;
  }
}

export function savePersistedTask(state: PersistedTaskState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(TEXTBOOK_STORAGE_PREFIX + state.taskId, JSON.stringify(state));
  } catch (err) {
    // Quota or private-mode failure: losing resume is not worth breaking the task.
    log('[LP Web] Textbook: failed to save state for', state.taskId, err);
  }
}

interface TextbookTaskProviderProps {
  task: Task;
  book: BookMeta;
  children: React.ReactNode;
}

/**
 * Provides one task's response store to its subtree.
 *
 * The context value is created once per task and never changes identity during
 * an attempt, and per-blank state is read through `useSyncExternalStore`
 * subscriptions inside each blank rather than through this context. That is
 * deliberate: a context value that changed on every keystroke would re-render
 * every `TokenizedText` in the tree, which on mobile is a documented
 * multi-second JS-thread block.
 */
export function TextbookTaskProvider({ task, book, children }: TextbookTaskProviderProps) {
  // A student may type either script: a traditional form of the answer has to count.
  // OpenCC is lazy-loaded, so the expansion is asynchronous and starts from the
  // unexpanded task — an L2 with no script pair never triggers the load at all.
  const [prepared, setPrepared] = useState<Task>(task);

  useEffect(() => {
    let cancelled = false;
    if (book.l2 !== 'zh') {
      setPrepared(task);
      return;
    }
    void expandAcceptedVariants(task, toTraditional)
      .then((expanded) => {
        if (!cancelled) setPrepared(expanded);
      })
      .catch((err) => {
        log('[LP Web] Textbook: script-variant expansion failed', err);
      });
    return () => {
      cancelled = true;
    };
  }, [task, book.l2]);

  const value = useMemo<TextbookTaskContextValue>(() => {
    const store = new TaskResponseStore({
      task: prepared,
      contentVersion: book.contentVersion,
      load: () => loadPersistedTask(prepared.id),
      save: savePersistedTask,
    });
    // Responses are persisted on every change, so rebuilding once when the expansion
    // lands re-reads them rather than losing them.
    return { task: prepared, book, store, selection: new BlankSelectionStore() };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prepared, book.contentVersion]);

  return <TextbookTaskContext.Provider value={value}>{children}</TextbookTaskContext.Provider>;
}
