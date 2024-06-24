import React from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity } from 'react-native';
import { ThemedText } from './ThemedText';
import { Ionicons } from '@expo/vector-icons';
import { ThemedButton } from './ThemedButton';
import { useThemeColor } from '@/hooks/useThemeColor';
import { router } from 'expo-router';

export const SavedWords = () => {
  // Sample data
  const words = [
    { id: '愛,ai,0', chinese: '爱', pinyin: 'ài', english: 'Love' },
    { id: '和平,he_ping,0', chinese: '和平', pinyin: 'hé píng', english: 'Peace' },
    { id: '希望,xi_wang,0', chinese: '希望', pinyin: 'xī wàng', english: 'Hope' },
    { id: '自由,zi_you,0', chinese: '自由', pinyin: 'zì yóu', english: 'Freedom' },
    { id: '勇氣,yong_qi,0', chinese: '勇气', pinyin: 'yǒng qì', english: 'Courage' },
    { id: '中國人,zhong_guo_ren,0', chinese: '中国人', pinyin: 'zhōng guó rén', english: 'Chinese person' },
    { id: '書,shu,0', chinese: '书', pinyin: 'shū', english: 'Book' },
    { id: '水,shui,0', chinese: '水', pinyin: 'shuǐ', english: 'Water' },
    { id: '食物,shi_wu,0', chinese: '食物', pinyin: 'shí wù', english: 'Food' },
    { id: '朋友,peng_you,0', chinese: '朋友', pinyin: 'péng yǒu', english: 'Friend' },
    { id: '家,jia,0', chinese: '家', pinyin: 'jiā', english: 'Home' },
    { id: '學習,xue_xi,0', chinese: '学习', pinyin: 'xué xí', english: 'Study' },
    { id: '教師,jiao_shi,0', chinese: '教师', pinyin: 'jiào shī', english: 'Teacher' },
    { id: '學校,xue_xiao,0', chinese: '学校', pinyin: 'xué xiào', english: 'School' },
    { id: '汽車,qi_che,0', chinese: '汽车', pinyin: 'qì chē', english: 'Car' },
    { id: '快樂,kuai_le,0', chinese: '快乐', pinyin: 'kuài lè', english: 'Happiness' },
    { id: '夢,meng,0', chinese: '梦', pinyin: 'mèng', english: 'Dream' },
    { id: '音樂,yin_yue,0', chinese: '音乐', pinyin: 'yīn yuè', english: 'Music' },
    { id: '旅行,lv_xing,0', chinese: '旅行', pinyin: 'lǚ xíng', english: 'Travel' },
    { id: '世界,shi_jie,0', chinese: '世界', pinyin: 'shì jiè', english: 'World' }
  ];

  const bookmarkColor = useThemeColor({}, 'semanticWarning');

  // Render Item Function
  const renderItem = ({ item }) => (
    <View style={styles.item}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <ThemedButton type="ghost" size="small" style={{ marginRight: 10 }} textColor={bookmarkColor} trailingIcon={<Ionicons name="bookmark" size={24}  />} />
        <TouchableOpacity onPress={() => router.navigate('/dictionary/word/' + item.id)}>
          <Text>
            <ThemedText style={styles.chinese} type="subtitle">{item.chinese}</ThemedText>
            <ThemedText style={styles.pinyin}> ({item.pinyin}) </ThemedText>
            <ThemedText style={styles.english}>{item.english}</ThemedText>
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
