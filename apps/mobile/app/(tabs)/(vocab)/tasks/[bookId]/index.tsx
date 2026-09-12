import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { TextbookToc } from '@/components/textbook/TextbookToc';
import { TextbookScroll, useBookTree } from '@/components/textbook/TaskView';
import { useT } from '@/hooks/use-t';

/**
 * The unit → lesson → task TOC for one book.
 *
 * On mobile this is its own screen rather than a sidebar: a phone has no room
 * for a persistent panel, so the task screen keeps a back route to here instead.
 */
export default function BookTocScreen() {
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
  const t = useT();
  const { tree, loading } = useBookTree(bookId);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center py-10">
        <ActivityIndicator />
        <Text className="mt-2 text-sm text-muted-foreground">{t('msg.loading')}</Text>
      </View>
    );
  }

  if (!tree) {
    return (
      <View className="flex-1 items-center justify-center py-10">
        <Text className="text-sm text-muted-foreground">{t('msg.no_results')}</Text>
      </View>
    );
  }

  return (
    <TextbookScroll>
      <TextbookToc tree={tree} />
    </TextbookScroll>
  );
}
