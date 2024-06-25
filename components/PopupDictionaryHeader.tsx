import React from 'react';
import { View, StyleSheet } from 'react-native';
import { ThemedText } from './ThemedText';
import Icon from "react-native-vector-icons/MaterialIcons";
import { Typography } from '@/constants/Typography';

export const PopupDictionaryHeader = ({ word, pronunciation, translation }) => {
  return (
    <View style={styles.headerContainer}>
      <ThemedText style={styles.wordText}>{word}</ThemedText>
      <Icon name="volume-up" size={20} style={styles.iconStyle} />
      <Icon name="volume-up" size={20} style={styles.iconStyle} />
      <ThemedText style={styles.translationText}>{translation}</ThemedText>
    </View>
  );
};

const styles = StyleSheet.create({
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  wordText: {
    fontSize: Typography.fontSize.medium,
    fontWeight: 'bold',
  },
  translationText: {
    fontSize: Typography.fontSize.small,
  },
  iconStyle: {
    marginHorizontal: 5,
    color: 'white', // Adjust based on theme if needed
  },
});
