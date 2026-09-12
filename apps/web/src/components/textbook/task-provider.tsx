'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
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

/** A store that never notifies — used only to ask React whether hydration is done. */
const neverChanges = () => () => {};

/**
 * Whether the browser is past hydration.
 *
 * `false` for the server render *and* for the client's hydration render, `true`
 * immediately afterwards — and `true` on the very first render of a client-side
 * navigation, where there is no server HTML to disagree with, so resuming a task
 * shows the saved answers at once rather than flashing an empty task.
 *
 * `useSyncExternalStore` is what draws that line safely rather than by hand: React
 * renders hydration with the server snapshot and then re-renders with the client one,
 * instead of failing the hydration. This is the hook ADR-0044's save/restore has to go
 * through, because the state it restores exists on the device and not on the server.
 */
function usePastHydration(): boolean {
  return useSyncExternalStore(
    neverChanges,
    () => true,
    () => false,
  );
}

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
  const pastHydration = usePastHydration();

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
      // ADR-0044 keeps the attempt on the device, so it can only be read in the
      // browser — and reading it *during* render is what broke hydration: the server
      // has no localStorage and painted an unanswered task, while the client's
      // hydration render already had the saved answers, so React threw the tree away
      // with "Hydration failed because the server rendered text didn't match the
      // client" (A ➋'s ② came back as `?`, then appeared as `E`). Until hydration is
      // past, the store starts empty — which is exactly what the server rendered —
      // and adopts the saved attempt on the render that follows it.
      load: () => (pastHydration ? loadPersistedTask(prepared.id) : null),
      // Nothing is written before the attempt is adopted: the store holds no state of
      // its own yet, so persisting it would overwrite the saved attempt with an empty
      // one — the whole task's answers, not just the blank being typed.
      save: pastHydration ? savePersistedTask : undefined,
    });
    // Responses are persisted on every change, so rebuilding once when the expansion
    // lands re-reads them rather than losing them.
    return { task: prepared, book, store, selection: new BlankSelectionStore() };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prepared, book.contentVersion, pastHydration]);

  return <TextbookTaskContext.Provider value={value}>{children}</TextbookTaskContext.Provider>;
}
