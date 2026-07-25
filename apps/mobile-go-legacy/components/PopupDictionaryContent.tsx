// @/components/PopupDictionaryContent

import React, { useEffect, useState } from "react";
import { View, TouchableOpacity } from "react-native";
import { ThemedText } from "./ThemedText";
import { useDictionary } from "@/contexts/DictionaryContext";
import { useThemeColor } from "@/hooks/useThemeColor";
import { Token } from "@/src/tokenizer";
import { DictionaryEntry } from "@/src/dictionary-types";
import { popupDictionaryContentStyles as styles } from "@/src/styles";
import { formatPronunciation } from '@langplayer/utils';
import { languageLevelsByL2Code } from "@/src/language-levels";
import BookmarkButton from "@/components/BookmarkButton";
import { useLanguage } from "@/contexts/LanguageContext";
import { router, useNavigation } from "expo-router";
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
  const { l1Lang } = useLanguage();
  const levels = languageLevelsByL2Code(l2Lang.code);
  const primaryTextColor = useThemeColor({}, "primaryText");


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

      // Phase 1: Try online lookup first (same endpoint as Next.js web app).
      // The Python backend handles normalization, LLM fallback, and L1 translation.
      const onlineResults = await dictionary.onlineLookup(token.text, l1Lang?.code);
      console.log('[PHASE1] onlineLookup:', {
        text: token.text,
        l1: l1Lang?.code,
        l2: l2Lang?.code,
        resultCount: onlineResults?.length ?? 'null',
        source: onlineResults !== null && onlineResults.length > 0 ? 'PYTHON' : 'FALLBACK',
      });
      if (onlineResults !== null && onlineResults.length > 0) {
        setDictionaryEntries(onlineResults);
        return;
      }

      // Fallback: local SQLite dictionary (existing behavior)
      console.log('[PHASE1] falling back to local SQLite for:', token.text);
      const tokenizerName = l2Lang && getTokenizer(l2Lang.code)?.name || '';
      let entries: DictionaryEntry[] = []
      if (["PyidaungsuTokenizer", "JiebaTokenizer"].includes(tokenizerName)) {
          entries = await dictionary.findWordsInPhrase(token.text) || [];
      } else {
          let searchTerms = [...getLemmas(token), token.text].filter(Boolean);
          entries = await dictionary.findEntriesByLemmas(searchTerms) || [];
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
          style={[
            styles.entryContainer,
            { backgroundColor: primaryBackgroundColor },
          ]}
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
              context={{ form: token.text, text: context || "" }}
              size="large"
              color={primaryTextColor}
            />
          </View>
          {(entry.pronunciation || entry.level) && (
            <ThemedText style={styles.entryText} variant="secondary">
              {formatPronunciation(entry as any, l2Lang.code) && <>{formatPronunciation(entry as any, l2Lang.code)} </>}
              {entry.level && (
                <ThemedText type="smallBold" level={entry.level}>
                  {entry.level ? "  " + levels[entry.level].examLevelName : ""}
                </ThemedText>
              )}
            </ThemedText>
          )}
          <DefinitionList definitions={entry.definitions} type="default" />
        </TouchableOpacity>
      ))}
    </View>
  );
};