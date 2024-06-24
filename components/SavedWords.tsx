import React from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity } from 'react-native';
import { ThemedText } from './ThemedText';
import { Ionicons } from '@expo/vector-icons';
import { ThemedButton } from './ThemedButton';
import { useThemeColor } from '@/hooks/useThemeColor';

export const SavedWords = () => {
  // Sample data
  const words = [
    { id: '1', chinese: '爱', pinyin: 'ài', english: 'Love' },
    { id: '2', chinese: '和平', pinyin: 'hé píng', english: 'Peace' },
    { id: '3', chinese: '希望', pinyin: 'xī wàng', english: 'Hope' },
    { id: '4', chinese: '自由', pinyin: 'zì yóu', english: 'Freedom' },
    { id: '5', chinese: '勇气', pinyin: 'yǒng qì', english: 'Courage' },
    { id: '6', chinese: '中国人', pinyin: 'zhōng guó rén', english: 'Chinese person' },
    { id: '7', chinese: '书', pinyin: 'shū', english: 'Book' },
    { id: '8', chinese: '水', pinyin: 'shuǐ', english: 'Water' },
    { id: '9', chinese: '食物', pinyin: 'shí wù', english: 'Food' },
    { id: '10', chinese: '朋友', pinyin: 'péng yǒu', english: 'Friend' },
    { id: '11', chinese: '家', pinyin: 'jiā', english: 'Home' },
    { id: '12', chinese: '学习', pinyin: 'xué xí', english: 'Study' },
    { id: '13', chinese: '教师', pinyin: 'jiào shī', english: 'Teacher' },
    { id: '14', chinese: '学校', pinyin: 'xué xiào', english: 'School' },
    { id: '15', chinese: '汽车', pinyin: 'qì chē', english: 'Car' },
    { id: '16', chinese: '快乐', pinyin: 'kuài lè', english: 'Happiness' },
    { id: '17', chinese: '梦', pinyin: 'mèng', english: 'Dream' },
    { id: '18', chinese: '音乐', pinyin: 'yīn yuè', english: 'Music' },
    { id: '19', chinese: '旅行', pinyin: 'lǚ xíng', english: 'Travel' },
    { id: '20', chinese: '世界', pinyin: 'shì jiè', english: 'World' }
  ];

  const bookmarkColor = useThemeColor({}, 'semanticWarning');

  // Render Item Function
  const renderItem = ({ item }) => (
    <View style={styles.item}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <ThemedButton type="ghost" size="small" style={{ marginRight: 10 }} textColor={bookmarkColor} trailingIcon={<Ionicons name="bookmark" size={24}  />} />
        <Text>
          <ThemedText style={styles.chinese} type="subtitle">{item.chinese}</ThemedText>
          <ThemedText style={styles.pinyin}> ({item.pinyin}) </ThemedText>
          <ThemedText style={styles.english}>{item.english}</ThemedText>
        </Text>
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
            leadingIcon={<Ionicons name="delete-outline" />}
            style={styles.button}
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
