import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import {
  buildTocTree,
  loadBook,
  type BookMeta,
  type TocTree,
} from '@langplayer/textbooks';
import type { PersistedTaskState } from '@langplayer/textbooks';
import { useT } from '@/hooks/use-t';
import { useLanguage } from '@/contexts/LanguageContext';
import { TextbookTaskProvider, loadPersistedTask } from './task-provider';
import { TaskShell, TaskStimulus } from './TaskShell';

/**
 * Loads one task for the given book and renders it.
 *
 * `AsyncStorage` is asynchronous, so the saved attempt is read *before* the
 * provider mounts and passed in — that keeps `TaskResponseStore` synchronous and
 * identical to its web counterpart.
 *
 * A book is only served under the L2 it teaches (SPEC-095 § "Initial L2 scope"),
 * so a task URL pointing at the Chinese book while the L2 is Japanese resolves to
 * nothing and shows the same empty state as an unknown task.
 */
export function TaskView({
  bookId,
  unitId,
  lessonId,
  taskId,
}: {
  bookId: string;
  unitId: string;
  lessonId: string;
  taskId: string;
}) {
  const t = useT();
  const { l2Lang } = useLanguage();
  const [book, setBook] = useState<BookMeta | null>(null);
  const [initialState, setInitialState] = useState<PersistedTaskState | null>(null);
  const [loading, setLoading] = useState(true);

  const fullTaskId = `${bookId}.${unitId}.${lessonId}.${taskId}`;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const loaded = await loadBook(bookId);
      const persisted = await loadPersistedTask(fullTaskId);
      if (cancelled) return;
      setBook(loaded && loaded.l2 === l2Lang.code ? loaded : null);
      setInitialState(persisted);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [bookId, fullTaskId, l2Lang.code]);

  const task = useMemo(
    () =>
      book?.units
        .find((u) => u.id === unitId)
        ?.lessons.find((l) => l.id === lessonId)
        ?.tasks.find((x) => x.id === fullTaskId) ?? null,
    [book, unitId, lessonId, fullTaskId],
  );

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center py-10">
        <ActivityIndicator />
        <Text className="mt-2 text-sm text-muted-foreground">{t('msg.loading')}</Text>
      </View>
    );
  }

  if (!book || !task) {
    return (
      <View className="flex-1 items-center justify-center py-10">
        <Text className="text-sm text-muted-foreground">{t('msg.no_results')}</Text>
      </View>
    );
  }

  return (
    <TextbookTaskProvider task={task} book={book} initialState={initialState}>
      <TaskShell>
        <TaskStimulus />
      </TaskShell>
    </TextbookTaskProvider>
  );
}

/**
 * Loads a book and exposes its navigation tree.
 *
 * The L2 gate lives here as well as in `TaskView`: mobile routes carry no
 * language segment, so the current L2 comes from context and the book must be
 * checked against it (SPEC-095 § "Initial L2 scope"). A mismatch yields the same
 * `tree === null` the caller already renders as an empty state.
 */
export function useBookTree(bookId: string): { tree: TocTree | null; loading: boolean } {
  const { l2Lang } = useLanguage();
  const [tree, setTree] = useState<TocTree | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const book = await loadBook(bookId);
    setTree(book && book.l2 === l2Lang.code ? buildTocTree(book) : null);
    setLoading(false);
  }, [bookId, l2Lang.code]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { tree, loading };
}

/** Scrollable container shared by the picker and the TOC list. */
export function TextbookScroll({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView className="flex-1" contentContainerClassName="gap-4 px-4 py-4">
      {children}
    </ScrollView>
  );
}
