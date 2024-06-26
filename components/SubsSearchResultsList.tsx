import React from "react";
import { StyleSheet, TouchableOpacity, View, Text } from "react-native";
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
  const handleSubtitlePress = (index: number) => {
    onSelect(index);
  };

  results.forEach((item) => {
    const targetLineIndex = item.subs_l2.findIndex((sub: any) => {
      return typeof sub.line === "string" && sub.line.includes(term);
    });
    item.targetLineIndex = targetLineIndex;
  });

  return (
    <GestureHandlerRootView style={styles.fullContainer}>
      {results && results.length > 0 && (
        <View style={styles.fullContainer}>
          <ThemedInput
            placeholder="Search..."
            icon="magnify"
            style={{ marginBottom: 26 }}
          />
          <FlatList
            data={results}
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
                    searchTerm={term}
                  />
                </ThemedText>
              </TouchableOpacity>
            )}
            keyExtractor={(item, index) => index.toString()}
          />
        </View>
      )}
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  thumbnail: {
    width: 75, // Makes the image fill the container
    aspectRatio: 16 / 9, // Maintains a 16:9 aspect ratio
    borderRadius: 4,
  },
  fullContainer: {
    flex: 1, // This will make the container fill the entire space of its parent
  },
  highlight: {
    color: Swatches.warning[500], // Example highlight style
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
