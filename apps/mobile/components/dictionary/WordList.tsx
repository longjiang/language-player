import React from 'react';
import { View, Text, FlatList, Pressable } from 'react-native';
import { useT } from '@/hooks/use-t';

interface WordListItem {
  id: string;
  head: string;
  pronunciation?: string;
  definition?: string;
}

interface WordListProps {
  words: WordListItem[];
  onPress?: (word: WordListItem) => void;
  onRemove?: (word: WordListItem) => void;
  emptyText?: string;
}

export function WordList({ words, onPress, onRemove, emptyText }: WordListProps) {
  const t = useT();

  if (words.length === 0) {
    return (
      <View className="flex-1 items-center justify-center py-16 px-4">
        <Text className="text-center text-muted-foreground">
          {emptyText ?? t('msg.no_saved_words')}
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={words}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <Pressable
          onPress={() => onPress?.(item)}
          className="flex-row items-center justify-between border-b border-border px-4 py-3 active:bg-muted"
        >
          <View className="flex-1">
            <Text className="text-base font-medium text-foreground">{item.head}</Text>
            {item.pronunciation ? (
              <Text className="mt-0.5 text-sm text-muted-foreground">{item.pronunciation}</Text>
            ) : null}
            {item.definition ? (
              <Text className="mt-0.5 text-sm text-muted-foreground" numberOfLines={1}>
                {item.definition}
              </Text>
            ) : null}
          </View>
          {onRemove && (
            <Pressable onPress={() => onRemove(item)} className="ml-3 p-2">
              <Text className="text-destructive">✕</Text>
            </Pressable>
          )}
        </Pressable>
      )}
    />
  );
}
