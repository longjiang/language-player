import React, { useState, useEffect } from "react";
import { StyleSheet, TouchableOpacity, View, ActionSheetIOS, Platform } from "react-native";
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
  const [sortBy, setSortBy] = useState("popularity");

  useEffect(() => {
    filterAndSortResults(searchTerm, sortBy);
  }, [searchTerm, sortBy, results]);

  const filterAndSortResults = (searchTerm: string, sortBy: string) => {
    let filtered = results.filter((item) =>
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

    switch (sortBy) {
      case "popularity":
        filtered.sort((a, b) => b.views - a.views);
        break;
      case "likes":
        filtered.sort((a, b) => b.likes - a.likes);
        break;
      case "date":
        filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        break;
      default:
        break;
    }

    setFilteredResults(filtered);
  };

  const handleSubtitlePress = (index: number) => {
    onSelect(index);
  };

  const handleSearchChange = (text: string) => {
    setSearchTerm(text);
  };

  const showSortOptions = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Popularity', 'Likes', 'Date'],
          cancelButtonIndex: 0,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) setSortBy('popularity');
          else if (buttonIndex === 2) setSortBy('likes');
          else if (buttonIndex === 3) setSortBy('date');
        }
      );
    } else {
      // For Android, you might want to use a modal or custom dropdown here
      // This is a simple example that cycles through options
      const options = ['popularity', 'likes', 'date'];
      const currentIndex = options.indexOf(sortBy);
      const nextIndex = (currentIndex + 1) % options.length;
      setSortBy(options[nextIndex]);
    }
  };

  return (
    <GestureHandlerRootView style={styles.fullContainer}>
      <View style={styles.fullContainer}>
        <TouchableOpacity onPress={showSortOptions} style={styles.sortContainer}>
          <ThemedText style={styles.sortLabel} type="defaultBold">Sort by: {sortBy}</ThemedText>
        </TouchableOpacity>
        <ThemedInput
          placeholder="Search..."
          icon="magnify"
          style={styles.searchInput}
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
  fullContainer: {
    flex: 1,
  },
  sortContainer: {
    marginBottom: 16,
    alignItems: "center",
  },
  sortLabel: {
    fontSize: 16,
  },
  searchInput: {
    marginBottom: 16,
  },
  thumbnail: {
    width: 75,
    aspectRatio: 16 / 9,
    borderRadius: 4,
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
  highlight: {
    color: Swatches.warning[500],
    fontFamily: "Nunito_700Bold",
  },
});