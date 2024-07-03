// @/components/PopupDictionaryContent.tsx

import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { ThemedText } from "./ThemedText";
import { useDictionary } from "@/contexts/DictionaryContext";
import { useThemeColor } from "@/hooks/useThemeColor";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { Token } from "@/src/tokenizer";
import { DictionaryEntry } from "@/src/dictionary-types";
import { popupDictionaryContentStyles as styles } from "@/src/styles";
import BookmarkButton from "@/components/BookmarkButton";  // Import the BookmarkButton component

export const PopupDictionaryContent: React.FC<{
  token: Token;
}> = ({
  token,
}) => {
  if (!token) return null;
  
  const [dictionaryEntries, setDictionaryEntries] = useState<DictionaryEntry[]>([]);
  const { dictionary } = useDictionary();
  const primaryBackgroundColor = useThemeColor({}, "primaryBackground");

  // Wait for the dictionary to load
  if (!dictionary) {
    return null;
  }
  if (!token.text) return null;

  useEffect(() => {
    const fetchDictionaryEntries = async () => {
      if (!token || !token.text || !dictionary) {
        setDictionaryEntries([]);
        return;
      }
      const entries = await dictionary.findWordsInPhrase(token.text) || [];
      setDictionaryEntries(entries);
    };

    fetchDictionaryEntries();
  }, [token, dictionary]); // Re-run this effect if `token` or `dictionary` changes

  return (
    <View style={styles.container}>
      {dictionaryEntries.map((entry: DictionaryEntry, index: number) => (
        <View key={index} style={[styles.entryContainer, {backgroundColor: primaryBackgroundColor}]}>
          <ThemedText
            style={[styles.entryText]}
            type="subtitle"
            level={entry.level}
          >
            {entry.head}
          </ThemedText>
          <BookmarkButton 
            wordId={entry.id}
            head={entry.head}
            alternate={entry.alternate}
            forms={entry.forms}
            context={{ form: entry.head, text: token.text || '' }}
            style={styles.saveWordButton}
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
