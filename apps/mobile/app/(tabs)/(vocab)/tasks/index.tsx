import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { BookOpen } from 'lucide-react-native';
import { router } from 'expo-router';
import {
  booksForL2,
  summarizeProgress,
  type ProgressSummary,
} from '@langplayer/textbooks';
import { ICON_MUTED } from '@/lib/theme-colors';
import { TextbookScroll } from '@/components/textbook/TaskView';
import { mobileBookHref } from '@/lib/textbook-routes';
import { TEXTBOOK_STORAGE_PREFIX, loadPersistedTask } from '@/components/textbook/task-provider';
import { useLanguage } from '@/contexts/LanguageContext';
import { useT } from '@/hooks/use-t';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Textbook picker — the entry screen for `Study > Tasks`.
 *
 * Only one textbook exists today, so this is a single-item list. It exists now
 * so that adding a second book is a content change rather than a navigation
 * change.
 *
 * The list is the catalogue filtered to the books that teach the current L2. The
 * nav item is hidden when there are none, so an empty list here means the screen
 * was reached some other way and shows the normal "no results" state.
 */
export default function TasksIndexScreen() {
  const t = useT();
  const { l2Lang } = useLanguage();
  // Overall progress, counted from the saved per-task state rather than by loading the
  // book: this screen renders before any task is opened.
  const [progress, setProgress] = useState<Record<string, ProgressSummary>>({});
  const books = booksForL2(l2Lang.code);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const next: Record<string, ProgressSummary> = {};
      for (const book of books) {
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
  }, [l2Lang.code]);

  if (books.length === 0) {
    return (
      <View className="flex-1 items-center justify-center py-10">
        <Text className="text-sm text-muted-foreground">{t('msg.no_results')}</Text>
      </View>
    );
  }

  return (
    <TextbookScroll>
      {books.map((book) => (
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
