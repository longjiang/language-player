import React, { useState, useEffect } from "react";
import { StyleSheet, TouchableOpacity, View, ActionSheetIOS, Platform } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { ThemedInput } from "./ThemedInput";
import { FlatList, GestureHandlerRootView } from "react-native-gesture-handler";
import { Image } from "react-native";
import { subsSearchResultsListStyles as styles } from "@/src/styles";

const extractContexts = (line: string, term: string) => {
  const lowercaseLine = line.toLowerCase();
  const lowercaseTerm = term.toLowerCase();
  const termIndex = lowercaseLine.indexOf(lowercaseTerm);
  
  if (termIndex === -1) {
    return { leftContext: '', rightContext: '' };
  }

  const leftContext = line.substring(0, termIndex).split('').reverse().join('');
  const rightContext = line.substring(termIndex + term.length);

  return { leftContext, rightContext };
};

const HighlightSearchTerm = ({
  line,
  searchTerm,
}: {
  line: string;
  searchTerm: string;
}) => {
  if (!line) return null;

  const { leftContext, rightContext } = extractContexts(line, searchTerm);
  const term = line.substring(leftContext.length, line.length - rightContext.length);

  return (
    <ThemedText style={styles.line}>
      <ThemedText>{leftContext.split('').reverse().join('')}</ThemedText>
      <ThemedText style={styles.highlight}>{term}</ThemedText>
      <ThemedText>{rightContext}</ThemedText>
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
      const { leftContext, rightContext } = extractContexts(item.subs_l2[targetLineIndex]?.line || '', searchTerm);
      item.leftContext = leftContext;
      item.rightContext = rightContext;
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
      case "length":
        filtered.sort((a, b) => {
          const aLength = a.subs_l2[a.targetLineIndex]?.line.length || 0;
          const bLength = b.subs_l2[b.targetLineIndex]?.line.length || 0;
          return aLength - bLength; // Sort from shortest to longest
        });
        break;
      case "leftContext":
        filtered.sort((a, b) => a.leftContext.localeCompare(b.leftContext));
        break;
      case "rightContext":
        filtered.sort((a, b) => a.rightContext.localeCompare(b.rightContext));
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
          options: ['Cancel', 'Popularity', 'Likes', 'Date', 'Length', 'Left Context', 'Right Context'],
          cancelButtonIndex: 0,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) setSortBy('popularity');
          else if (buttonIndex === 2) setSortBy('likes');
          else if (buttonIndex === 3) setSortBy('date');
          else if (buttonIndex === 4) setSortBy('length');
          else if (buttonIndex === 5) setSortBy('leftContext');
          else if (buttonIndex === 6) setSortBy('rightContext');
        }
      );
    } else {
      // For Android, you might want to use a modal or custom dropdown here
      // This is a simple example that cycles through options
      const options = ['popularity', 'likes', 'date', 'length', 'leftContext', 'rightContext'];
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
