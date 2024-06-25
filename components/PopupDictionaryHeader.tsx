import React from "react";
import { View, StyleSheet } from "react-native";
import { ThemedText } from "./ThemedText";
import { ThemedButton } from "./ThemedButton";
import Icon from "react-native-vector-icons/MaterialIcons";
import { Typography } from "@/constants/Typography";

export const PopupDictionaryHeader = ({ word, pronunciation, translation, context, translatedContext }) => {
  const onExplainPress = () => {
    // Implement the logic to explain the word using AI
  }
  return (
    <View style={styles.headerContainer}>
      <View style={{ flexDirection: "row", justifyContent: 'space-between' }}>
        <ThemedText type="xxlarge" style={{flex: 1}}>{word}</ThemedText>
        <View style={{ flexDirection: "row", justifyContent: 'space-between' }}>
          <Icon name="volume-up" size={26} style={styles.iconStyle} />
          <Icon name="bookmark-outline" size={26} style={styles.iconStyle} />
        </View>
      </View>
      <ThemedText style={styles.translationText}>{pronunciation} • {translation}</ThemedText>
      <ThemedButton type="ghost" style={{marginBottom: 26}}  title="Let AI Explain" onPress={onExplainPress} type="pro" leadingIcon={<Icon name="lightbulb-outline" size={20} style={styles.iconStyle} />} />
      <ThemedText style={styles.contextText}>{context}</ThemedText>
      <ThemedText style={styles.translatedContextText} variant="secondary">{translatedContext}</ThemedText>
    </View>
  );
};

const styles = StyleSheet.create({
  headerContainer: {
    
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  contextText: {
    marginVertical: 4,
    textAlign: 'left',
    width: '100%'
  },
  translatedContextText: {
    marginVertical: 4,
    textAlign: 'left',
    width: '100%'
  },
  translationText: {
    textAlign: 'left',
    width: '100%',
    marginBottom: 20,
  },
  iconStyle: {
    marginHorizontal: 5,
    color: "white", // Adjust based on theme if needed
  },
});
