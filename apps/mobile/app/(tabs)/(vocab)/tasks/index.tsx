import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { BookOpen } from 'lucide-react-native';
import { router } from 'expo-router';
import { TEXTBOOK_CATALOGUE } from '@langplayer/textbooks';
import { ICON_MUTED } from '@/lib/theme-colors';
import { TextbookScroll } from '@/components/textbook/TaskView';
import { mobileBookHref } from '@/lib/textbook-routes';

/**
 * Textbook picker — the entry screen for `Study > Tasks`.
 *
 * Only one textbook exists today, so this is a single-item list. It exists now
 * so that adding a second book is a content change rather than a navigation
 * change.
 */
export default function TasksIndexScreen() {
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
          <Text className="text-foreground">{book.title}</Text>
        </Pressable>
      ))}
    </TextbookScroll>
  );
}
