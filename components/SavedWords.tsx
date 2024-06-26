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
    { id: '愛,ai,0', head: '爱', pronunciation: 'ài', definitions: ['Love'] },
    { id: '和平,he_ping,0', head: '和平', pronunciation: 'hé píng', definitions: ['Peace'] },
    { id: '希望,xi_wang,0', head: '希望', pronunciation: 'xī wàng', definitions: ['Hope'] },
    { id: '自由,zi_you,0', head: '自由', pronunciation: 'zì yóu', definitions: ['Freedom'] },
    { id: '勇氣,yong_qi,0', head: '勇气', pronunciation: 'yǒng qì', definitions: ['Courage'] },
    { id: '中國人,zhong_guo_ren,0', head: '中国人', pronunciation: 'zhōng guó rén', definitions: ['head person'] },
    { id: '書,shu,0', head: '书', pronunciation: 'shū', definitions: ['Book'] },
    { id: '水,shui,0', head: '水', pronunciation: 'shuǐ', definitions: ['Water'] },
    { id: '食物,shi_wu,0', head: '食物', pronunciation: 'shí wù', definitions: ['Food'] },
    { id: '朋友,peng_you,0', head: '朋友', pronunciation: 'péng yǒu', definitions: ['Friend'] },
    { id: '家,jia,0', head: '家', pronunciation: 'jiā', definitions: ['Home'] },
    { id: '學習,xue_xi,0', head: '学习', pronunciation: 'xué xí', definitions: ['Study'] },
    { id: '教師,jiao_shi,0', head: '教师', pronunciation: 'jiào shī', definitions: ['Teacher'] },
    { id: '學校,xue_xiao,0', head: '学校', pronunciation: 'xué xiào', definitions: ['School'] },
    { id: '汽車,qi_che,0', head: '汽车', pronunciation: 'qì chē', definitions: ['Car'] },
    { id: '快樂,kuai_le,0', head: '快乐', pronunciation: 'kuài lè', definitions: ['Happiness'] },
    { id: '夢,meng,0', head: '梦', pronunciation: 'mèng', definitions: ['Dream'] },
    { id: '音樂,yin_yue,0', head: '音乐', pronunciation: 'yīn yuè', definitions: ['Music'] },
    { id: '旅行,lv_xing,0', head: '旅行', pronunciation: 'lǚ xíng', definitions: ['Travel'] },
    { id: '世界,shi_jie,0', head: '世界', pronunciation: 'shì jiè', definitions: ['World]'] }
  ];

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
