// @/components/WordList.tsx
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity } from 'react-native';
import { ThemedText } from './ThemedText';
import BookmarkButton from './BookmarkButton'; // Updated import
import { useThemeColor } from '@/hooks/useThemeColor';
import { router } from 'expo-router';
import { useDictionary } from '@/contexts/DictionaryContext';
import DefinitionList from './DefinitionList';

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
      <View style={{ flexDirection: 'row', alignItems: 'top' }}>
        <BookmarkButton wordId={item.id} head={item.head} alternate={item.alternate}/>
        <TouchableOpacity onPress={() => router.navigate('/dictionary/word/' + item.id)} style={{ marginLeft: 10, marginTop: -4 }}>
          <Text>
            <ThemedText style={styles.chinese} type="subtitle">{item.head}</ThemedText>
            <ThemedText style={styles.pinyin}> ({item.pronunciation}) </ThemedText>
          </Text>
          <DefinitionList definitions={item.definitions.slice(0, 2)} />
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


export const styles = StyleSheet.create({
  container: {
  },
  item: {
    marginVertical: 8,
  },
  chinese: {},
  pinyin: {
    fontSize: 16,
  },
  english: {
    fontSize: 14,
  }
});