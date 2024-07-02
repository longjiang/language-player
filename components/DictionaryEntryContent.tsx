// @/components/DictionaryEntryContent.tsx

import React from "react";
import { View, ScrollView, Text } from "react-native";
import { ThemedText, SubsSearch } from "@/components";
import { DictionaryEntry } from "@/src/dictionary-types";
import { dictionaryEntryStyles as styles } from "@/src/styles";
import { useThemeColor } from "@/hooks/useThemeColor";
import { languageLevelsByL2Code } from "@/src/language-levels";
import { useLanguage } from "@/contexts/LanguageContext";

interface DictionaryEntryContentProps {
  entry: DictionaryEntry;
  headKey: string;
  alternateKey: string;
}

const DictionaryEntryContent: React.FC<DictionaryEntryContentProps> = ({ entry, headKey, alternateKey }) => {
  const l2Lang = useLanguage().l2Lang;
  if (!l2Lang) return null;
  const levels = languageLevelsByL2Code(l2Lang.code)

  return (
    <ScrollView style={styles.entryContainer}>
      <View style={styles.entryHeader}>
        <View style={{ flexDirection: "row", alignItems: "flex-end", marginBottom: 12 }}>
          <Text>
            <ThemedText type="xxlarge" style={styles.character} level={entry.level}>
              {entry[headKey]}
            </ThemedText>
          </Text>
          <ThemedText type="subtitle" style={{ marginLeft: 4, fontWeight: 'normal' }} variant="secondary">
            {entry[alternateKey]}
          </ThemedText>
        </View>
        <Text>
          {entry.pronunciation && <ThemedText type="large">{entry.pronunciation}</ThemedText>}
          {entry.pronunciation && entry.level && <ThemedText type="large"> • </ThemedText>}
          {entry.level && <ThemedText type="defaultBold" level={entry.level}>{levels[entry.level].examLevelName}</ThemedText>}
        </Text>
      </View>
      <View style={[styles.detailsContainer, { backgroundColor: useThemeColor({}, 'primaryBackground') }]}>
        <View style={{ paddingBottom: 16, paddingHorizontal: 26 }}>
          <ThemedText type="large">{entry.definitions ? entry.definitions.join('; ') : ''}</ThemedText>
          <View style={{ borderBottomColor: useThemeColor({}, 'secondaryStroke'), borderBottomWidth: 2, paddingBottom: 16 }}></View>
          <ThemedText type="defaultBold" style={{ marginTop: 26 }} variant="secondary">EXAMPLES FROM VIDEOS</ThemedText>
        </View>
        <SubsSearch term={entry.head} />
      </View>
    </ScrollView>
  );
};

export default DictionaryEntryContent;
