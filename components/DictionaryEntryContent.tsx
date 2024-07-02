// @/components/DictionaryEntryContent.tsx

import React from "react";
import { View, ScrollView, Text } from "react-native";
import { ThemedText, SubsSearch } from "@/components";
import { DictionaryEntry } from "@/src/dictionary-types";
import { dictionaryEntryStyles as styles } from "@/src/styles";
import { useThemeColor } from "@/hooks/useThemeColor";

interface DictionaryEntryContentProps {
  entry: DictionaryEntry;
  headKey: string;
  alternateKey: string;
}

const DictionaryEntryContent: React.FC<DictionaryEntryContentProps> = ({ entry, headKey, alternateKey }) => {
  const tertiaryBackgroundColor = useThemeColor({}, 'tertiaryBackground');
  const secondaryStrokeColor = useThemeColor({}, 'secondaryStroke');

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
        <Text><ThemedText type="default">{entry.pronunciation} • </ThemedText><ThemedText type="smallBold" level={entry.level}>HSK {entry.level}</ThemedText></Text>
      </View>
      <View style={[styles.detailsContainer, { backgroundColor: tertiaryBackgroundColor }]}>
        <View style={{ paddingBottom: 16, paddingHorizontal: 26 }}>
          <ThemedText type="large">{entry.definitions ? entry.definitions.join('; ') : ''}</ThemedText>
          <View style={{ borderBottomColor: secondaryStrokeColor, borderBottomWidth: 2, paddingBottom: 16 }}></View>
          <ThemedText type="defaultBold" style={{ marginTop: 26 }}>EXAMPLES FROM VIDEOS</ThemedText>
        </View>
        <SubsSearch term={entry.head} />
      </View>
    </ScrollView>
  );
};

export default DictionaryEntryContent;
