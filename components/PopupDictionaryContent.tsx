import React from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import { ThemedText } from "./ThemedText";
import { ThemedButton } from "@/components/ThemedButton";
import { Typography } from "@/constants/Typography";
import { useDictionary } from "@/contexts/DictionaryContext";
import { useThemeColor } from "@/hooks/useThemeColor";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";

export const PopupDictionaryContent = ({
  token,
}) => {
  if (!token) return
  const { dictionary } = useDictionary();
  // Wait for the dictionary to load
  if (!dictionary) {
    return null;
  }
  const dictionaryEntries = dictionary.findWordsInPhrase(token.word) || [];
  const primaryBackgroundColor = useThemeColor({}, "primaryBackground");

  const styles = StyleSheet.create({
    container: {},
    entryContainer: {
      marginVertical: 2,
      borderRadius: 8,
      padding: 20,
      backgroundColor: primaryBackgroundColor,
    },
    entryText: {
      fontWeight: "bold",
    },
    definitionText: {
      fontSize: Typography.fontSize.xsmall,
    },
  });

  return (
    <View style={styles.container}>
      {dictionaryEntries.map((entry, index) => (
        <View key={index} style={styles.entryContainer}>
          <ThemedText
            style={[styles.entryText]}
            type="subtitle"
            level={entry.hsk}
          >
            {entry.head}
          </ThemedText>
          <ThemedButton
            type="ghost"
            trailingIcon={<Icon name="bookmark-outline" size={20} />}
            style={{ position: "absolute", top: 16, right: 16 }}
          />
          <ThemedText style={styles.entryText}>
            {entry.pronunciation}{" "}
            <ThemedText type="smallBold" level={entry.hsk}>
              {entry.hsk ? " • HSK " + entry.hsk : ""}
            </ThemedText>{" "}
            • {entry.definitions.join("; ")}
          </ThemedText>
        </View>
      ))}
    </View>
  );
};
