import React from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity } from 'react-native';
import { ThemedText } from './ThemedText';
import { Ionicons } from '@expo/vector-icons';
import { ThemedButton } from './ThemedButton';
import { useThemeColor } from '@/hooks/useThemeColor';
import { router } from 'expo-router';

export const SavedWords = ({ words }) => {

  const bookmarkColor = useThemeColor({}, 'semanticWarning');

  // Render Item Function
  const renderItem = ({ item }: { item: { id: string, head: string, pronunciation: string, definitions: string[] } }) => (
    <View style={styles.item}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <ThemedButton type="ghost" size="small" style={{ marginRight: 10, color: bookmarkColor }} trailingIcon={<Ionicons name="bookmark" size={24}  />} />
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
      ListFooterComponent={
        <View style={{ padding: 20, alignItems: 'center' }}>
          <ThemedButton
            title="Clear"
            type="neutral"
            size="medium"
            leadingIcon={<Ionicons name="trash-outline" />}
            onPress={() => {
              router.navigate("/(tabs)/(dictionary)");
            }}
          />
        </View>
      }
    />
  );
};

// Styles
const styles = StyleSheet.create({
  container: {
    marginBottom: 250,
  },
  item: {
    marginVertical: 8,
  },
  chinese: {

  },
  pinyin: {
    fontSize: 16,
  },
  english: {
    fontSize: 14,
  }
});
