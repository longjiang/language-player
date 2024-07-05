import React, { useState, useEffect } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { ThemedInput } from "./ThemedInput";
import { FlatList, GestureHandlerRootView } from "react-native-gesture-handler";
import { Image } from "react-native";
import { Swatches } from "@/constants/Swatches";

const HighlightSearchTerm = ({
  line,
  searchTerm,
}: {
  line: string;
  searchTerm: string;
}) => {
  if (!line) return null;

  const termIndex = line.toLowerCase().indexOf(searchTerm.toLowerCase());
  if (termIndex === -1) {
    return <ThemedText style={styles.line}>{line}</ThemedText>;
  }

  const beforeTerm = line.substring(0, termIndex);
  const term = line.substring(termIndex, termIndex + searchTerm.length);
  const afterTerm = line.substring(termIndex + searchTerm.length);

  return (
    <ThemedText style={styles.line}>
      {beforeTerm}
      <ThemedText style={styles.highlight}>{term}</ThemedText>
      {afterTerm}
    </ThemedText>
  );
};

export const SubsSearchResultsList = ({
  results,
  term,
  onSelect,
}: {
  results: any[];
  term: string;
  onSelect: (index: number) => void;
}) => {
  const [filteredResults, setFilteredResults] = useState(results);
  const [searchTerm, setSearchTerm] = useState(term);

  useEffect(() => {
    filterResults(searchTerm);
  }, [searchTerm, results]);

  const filterResults = (searchTerm: string) => {
    const filtered = results.filter((item) =>
      item.subs_l2.some((sub: any) =>
        sub.line.toLowerCase().includes(searchTerm.toLowerCase())
      )
    );

    filtered.forEach((item) => {
      const targetLineIndex = item.subs_l2.findIndex((sub: any) => {
        return typeof sub.line === "string" && sub.line.toLowerCase().includes(searchTerm.toLowerCase());
      });
      item.targetLineIndex = targetLineIndex;
    });

    setFilteredResults(filtered);
  };

  const handleSubtitlePress = (index: number) => {
    onSelect(index);
  };

  const handleSearchChange = (text: string) => {
    setSearchTerm(text);
  };

  return (
    <GestureHandlerRootView style={styles.fullContainer}>
      <View style={styles.fullContainer}>
        <ThemedInput
          placeholder="Search..."
          icon="magnify"
          style={{ marginBottom: 26 }}
          value={searchTerm}
          onChangeText={handleSearchChange}
        />
        <FlatList
          data={filteredResults}
          renderItem={({ item, index }) => (
            <TouchableOpacity
              style={styles.item}
              onPress={() => handleSubtitlePress(index)}
            >
              <Image
                source={{
                  uri: `https://img.youtube.com/vi/${item.youtube_id}/0.jpg`,
                }}
                style={[styles.thumbnail]}
              />
              <ThemedText style={styles.line}>
                <HighlightSearchTerm
                  line={item.subs_l2[item.targetLineIndex]?.line}
                  searchTerm={searchTerm}
                />
              </ThemedText>
            </TouchableOpacity>
          )}
          keyExtractor={(item, index) => index.toString()}
        />
      </View>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  thumbnail: {
    width: 75,
    aspectRatio: 16 / 9,
    borderRadius: 4,
  },
  fullContainer: {
    flex: 1,
  },
  highlight: {
    color: Swatches.warning[500],
    fontFamily: "Nunito_700Bold",
  },
  item: {
    paddingBottom: 26,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  line: {
    width: "100%",
    textAlign: "left",
    paddingLeft: 16,
    paddingRight: 50,
  },
});