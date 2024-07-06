import React, { useEffect, useState } from "react";
import { View, TouchableOpacity } from "react-native";
import { ThemedText } from "./ThemedText";
import { useDictionary } from "@/contexts/DictionaryContext";
import { useThemeColor } from "@/hooks/useThemeColor";
import { Token } from "@/src/tokenizer";
import { DictionaryEntry } from "@/src/dictionary-types";
import { popupDictionaryContentStyles as styles } from "@/src/styles";
import { languageLevelsByL2Code } from "@/src/language-levels";
import BookmarkButton from "@/components/BookmarkButton";
import { useLanguage } from "@/contexts/LanguageContext";
import { useNavigation } from "@react-navigation/native";
import { router } from "expo-router";
import { DefinitionList } from "./DefinitionList";
import { getTokenizer } from "@/src/tokenizer";

/**
 * Gets an array of lemma strings from a Token object.
 * @param token The Token object to process.
 * @returns An array of lemma strings, or an empty array if lemmas are not set or empty.
 */
export const getLemmas = (token: Token): string[] => {
  if (!token.lemmas || token.lemmas.length === 0) {
    return [];
  }

  return token.lemmas.map((lemma: Lemma) => lemma.lemma).filter((lemma: string) => lemma !== '');
};

export const PopupDictionaryContent: React.FC<{
  token: Token;
  context: string;
}> = ({
  token,
  context
}) => {
  if (!token) return null;
  
  const [dictionaryEntries, setDictionaryEntries] = useState<DictionaryEntry[]>([]);
  const { dictionary, tokenizer } = useDictionary();
  const primaryBackgroundColor = useThemeColor({}, "primaryBackground");
  const { l2Lang } = useLanguage();
  const levels = languageLevelsByL2Code(l2Lang.code);
  const navigation = useNavigation();


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
      const tokenizerName = l2Lang && getTokenizer(l2Lang.code)?.name || ''; // getTokenizer gets the tokenizer for the specific language
      let entries: DictionaryEntry[] = []
      if (["PyidaungsuTokenizer", "JiebaTokenizer"].includes(tokenizerName)) {
        entries = await dictionary.findWordsInPhrase(token.text) || [];
      } else {
        // If there are lemmas, match lemmas
        let lemmas = getLemmas(token);
        console.log(lemmas);
        // If not, do a fuzzy match token.text

      }

      setDictionaryEntries(entries);
    };

    fetchDictionaryEntries();
  }, [token, dictionary]);

  const handleEntryPress = (entryId: string) => {
    router.navigate(`/dictionary/word/${entryId}`);
  };

  return (
    <View style={styles.container}>
      {dictionaryEntries.map((entry: DictionaryEntry, index: number) => (
        <TouchableOpacity
          key={index}
          style={[styles.entryContainer, {backgroundColor: primaryBackgroundColor}]}
          onPress={() => handleEntryPress(entry.id)}
        >
          <ThemedText
            style={[styles.entryText]}
            type="subtitle"
            level={entry.level}
          >
            {entry.head}
          </ThemedText>
          <View style={{ position: "absolute", top: 16, right: 16 }}>
            <BookmarkButton 
              wordId={entry.id}
              head={entry.head}
              alternate={entry.alternate}
              forms={[entry.head, entry.alternate, token.text].filter(Boolean)}
              context={{ form: token.text, text: context || '' }}
            />
          </View>
          <ThemedText style={styles.entryText}>
            {entry.pronunciation}{" "}
            <ThemedText type="smallBold" level={entry.level}>
              {entry.level ? " • " + levels[entry.level].examLevelName : ""}
            </ThemedText>{" "}
          </ThemedText>
          <DefinitionList definitions={entry.definitions} type="default" />
        </TouchableOpacity>
      ))}
    </View>
  );
};