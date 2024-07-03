// @/components/WordList.tsx
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity } from 'react-native';
import { ThemedText } from './ThemedText';
import BookmarkButton from './BookmarkButton'; // Updated import
import { useThemeColor } from '@/hooks/useThemeColor';
import { router } from 'expo-router';
import { useDictionary } from '@/contexts/DictionaryContext';
import { wordListStyles as styles } from '@/src/styles'

export const WordList = ({ wordIds }) => {
  const [words, setWords] = useState([]);
  const { dictionary } = useDictionary();
  const bookmarkColor = useThemeColor({}, 'semanticWarning');

  useEffect(() => {
    const fetchWords = async () => {
      const wordsData = await Promise.all(wordIds.map(async (id) => await dictionary.getEntry(id)));
      setWords(wordsData);
    };

    if (wordIds) {
      fetchWords();
    }
  }, [wordIds, dictionary]);

  const renderItem = ({ item }) => (
    <View style={styles.item}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <BookmarkButton bookmarkColor={bookmarkColor} />
        <TouchableOpacity onPress={() => router.navigate('/dictionary/word/' + item.id)}>
          <Text>
            <ThemedText style={styles.chinese} type="subtitle">{item.head}</ThemedText>
            <ThemedText style={styles.pinyin}> ({item.pronunciation}) </ThemedText>
            <ThemedText style={styles.english}>{item.definitions[0]}</ThemedText>
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <FlatList
      data={words}
      renderItem={renderItem}
      keyExtractor={item => item.id}
      style={styles.container}
    />
  );
};
