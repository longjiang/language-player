import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { BookOpen } from 'lucide-react-native';
import { router } from 'expo-router';
import {
  TEXTBOOK_CATALOGUE,
  summarizeProgress,
  type ProgressSummary,
} from '@langplayer/textbooks';
import { ICON_MUTED } from '@/lib/theme-colors';
import { TextbookScroll } from '@/components/textbook/TaskView';
import { mobileBookHref } from '@/lib/textbook-routes';
import { TEXTBOOK_STORAGE_PREFIX, loadPersistedTask } from '@/components/textbook/task-provider';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Textbook picker — the entry screen for `Study > Tasks`.
 *
 * Only one textbook exists today, so this is a single-item list. It exists now
 * so that adding a second book is a content change rather than a navigation
 * change.
 */
export default function TasksIndexScreen() {
  // Overall progress, counted from the saved per-task state rather than by loading the
  // book: this screen renders before any task is opened.
  const [progress, setProgress] = useState<Record<string, ProgressSummary>>({});

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const next: Record<string, ProgressSummary> = {};
      for (const book of TEXTBOOK_CATALOGUE) {
        const keys = (await AsyncStorage.getAllKeys()).filter((k) =>
          k.startsWith(`${TEXTBOOK_STORAGE_PREFIX}${book.id}.`),
        );
        const states = await Promise.all(
          keys.map((k) => loadPersistedTask(k.slice(TEXTBOOK_STORAGE_PREFIX.length))),
        );
        next[book.id] = summarizeProgress(states, book.taskCount);
      }
      if (!cancelled) setProgress(next);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <TextbookScroll>
      {TEXTBOOK_CATALOGUE.map((book) => (
        <Pressable
          key={book.id}
          onPress={() => router.push(mobileBookHref(book.id) as never)}
          accessibilityRole="button"
          className="flex-row items-center gap-3 rounded-lg border border-border bg-card px-4 py-3"
        >
          <BookOpen size={18} color={ICON_MUTED} />
          <Text className="flex-1 text-foreground">{book.title}</Text>
          {progress[book.id] ? (
            <Text className="text-xs tabular-nums text-muted-foreground">
              {progress[book.id]!.complete}/{progress[book.id]!.total}
            </Text>
          ) : null}
        </Pressable>
      ))}
    </TextbookScroll>
  );
}
