import React, { createContext, useContext, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  BlankSelectionStore,
  TaskResponseStore,
  type BookMeta,
  type PersistedTaskState,
  type Task,
} from '@langplayer/textbooks';
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
 * interactive blanks, so it stays behaviourally unchanged everywhere else.
 */
export function useTextbookTask(): TextbookTaskContextValue | null {
  return useContext(TextbookTaskContext);
}

export const TEXTBOOK_STORAGE_PREFIX = 'lp:textbook:';

/**
 * Read a saved attempt.
 *
 * AsyncStorage is asynchronous, unlike web's localStorage, so the caller loads
 * this *before* mounting the provider and passes the result in — that keeps
 * `TaskResponseStore` synchronous and identical on both platforms.
 */
export async function loadPersistedTask(taskId: string): Promise<PersistedTaskState | null> {
  try {
    const raw = await AsyncStorage.getItem(TEXTBOOK_STORAGE_PREFIX + taskId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedTaskState;
    if (!parsed || typeof parsed !== 'object' || parsed.taskId !== taskId) return null;
    return parsed;
  } catch (err) {
    log('[LP Mobile] Textbook: failed to read saved state for', taskId, err);
    return null;
  }
}

export function savePersistedTask(state: PersistedTaskState): void {
  void AsyncStorage.setItem(TEXTBOOK_STORAGE_PREFIX + state.taskId, JSON.stringify(state)).catch(
    (err) => {
      // Losing resume is not worth interrupting the task.
      log('[LP Mobile] Textbook: failed to save state for', state.taskId, err);
    },
  );
}

interface TextbookTaskProviderProps {
  task: Task;
  book: BookMeta;
  /** State loaded by the caller before mount (AsyncStorage is async). */
  initialState?: PersistedTaskState | null;
  children: React.ReactNode;
}

/**
 * Provides one task's response store to its subtree.
 *
 * The context value is created once per task and never changes identity during
 * an attempt, and per-blank state is read through per-blank subscriptions
 * inside each blank rather than through this context. That is deliberate: a
 * context value that changed on every keystroke would re-render every
 * `TokenizedText` in the tree, and re-rendering a token tree on this platform is
 * a documented multi-second JS-thread block.
 */
export function TextbookTaskProvider({
  task,
  book,
  initialState,
  children,
}: TextbookTaskProviderProps) {
  const value = useMemo<TextbookTaskContextValue>(() => {
    const store = new TaskResponseStore({
      task,
      contentVersion: book.contentVersion,
      load: () => initialState ?? null,
      save: savePersistedTask,
    });
    return { task, book, store, selection: new BlankSelectionStore() };
    // Rebuild only when the task itself changes — never on a re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task, book.contentVersion]);

  return (
    <TextbookTaskContext.Provider value={value}>{children}</TextbookTaskContext.Provider>
  );
}
