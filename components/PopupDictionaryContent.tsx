import React, { useEffect, useState } from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import { ThemedText } from "./ThemedText";
import { ThemedButton } from "@/components/ThemedButton";
import { Typography } from "@/constants/Typography";
import { useDictionary } from "@/contexts/DictionaryContext";
import { useThemeColor } from "@/hooks/useThemeColor";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { Token } from "@/types/tokenTypes";
import { DictionaryEntry } from "@/src/dictionary-types";

export const PopupDictionaryContent: React.FC<{
  token: Token;
}> = ({
  token,
}) => {
  if (!token) return
  
  const [dictionaryEntries, setDictionaryEntries] = useState<DictionaryEntry[]>([]);
  const { dictionary } = useDictionary();
  const primaryBackgroundColor = useThemeColor({}, "primaryBackground");

  // Wait for the dictionary to load
  if (!dictionary) {
    return null;
  }
  if (!token.word) return


  useEffect(() => {
    const fetchDictionaryEntries = async () => {
      if (!token || !token.word || !dictionary) {
        setDictionaryEntries([]);
        return;
      }
      const entries = await dictionary.findWordsInPhrase(token.word) || [];
      setDictionaryEntries(entries);
    };

    fetchDictionaryEntries();
  }, [token, dictionary]); // Re-run this effect if `token` or `dictionary` changes


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
      {dictionaryEntries.map((entry: DictionaryEntry, index: number) => (
        <View key={index} style={styles.entryContainer}>
          <ThemedText
            style={[styles.entryText]}
            type="subtitle"
            level={entry.level}
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
            <ThemedText type="smallBold" level={entry.level}>
              {entry.level ? " • HSK " + entry.level : ""}
            </ThemedText>{" "}
            • {entry.definitions.join("; ")}
          </ThemedText>
        </View>
      ))}
    </View>
  );
};
