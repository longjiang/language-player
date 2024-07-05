import React, { useState, useEffect } from "react";
import { StyleSheet, TouchableOpacity, View, ActionSheetIOS, Platform } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { ThemedInput } from "./ThemedInput";
import { FlatList, GestureHandlerRootView } from "react-native-gesture-handler";
import { Image } from "react-native";
import { subsSearchResultsListStyles as styles } from "@/src/styles";
import { Ionicons } from "@expo/vector-icons";
import { ThemedButton } from "./ThemedButton";
import { useLanguage } from '@/contexts/LanguageContext';

const extractContexts = (line: string, term: string) => {
  const lowercaseLine = line.toLowerCase().replace(/\s/g, '');
  const lowercaseTerm = term.toLowerCase().replace(/\s/g, '');
  const termIndex = lowercaseLine.indexOf(lowercaseTerm);
  
  if (termIndex === -1) {
    return { leftContext: '', rightContext: '' };
  }

  const leftContext = lowercaseLine.substring(0, termIndex).split('').reverse().join('');
  const rightContext = lowercaseLine.substring(termIndex + lowercaseTerm.length);

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
  const termIndex = line.toLowerCase().indexOf(searchTerm.toLowerCase());
  const term = line.substring(termIndex, termIndex + searchTerm.length);

  return (
    <ThemedText style={styles.line}>
      <ThemedText>{line.substring(0, termIndex)}</ThemedText>
      <ThemedText style={styles.highlight}>{term}</ThemedText>
      <ThemedText>{line.substring(termIndex + searchTerm.length)}</ThemedText>
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
  const { t } = useLanguage();

  useEffect(() => {
    filterAndSortResults(searchTerm, sortBy);
  }, [searchTerm, sortBy, results]);

  const filterAndSortResults = (searchTerm: string, sortBy: string) => {
    let filtered = results.filter((item) =>
      item.subs_l2.some((sub: any) =>
        sub.line.toLowerCase().replace(/\s/g, '').includes(searchTerm.toLowerCase().replace(/\s/g, ''))
      )
    );

    filtered.forEach((item) => {
      const targetLineIndex = item.subs_l2.findIndex((sub: any) => {
        return typeof sub.line === "string" && sub.line.toLowerCase().replace(/\s/g, '').includes(searchTerm.toLowerCase().replace(/\s/g, ''));
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
          return aLength - bLength;
        });
        break;
      case "leftContext":
      case "rightContext":
        const contextGroups = new Map();
        filtered.forEach((item) => {
          const context = sortBy === "leftContext" ? item.leftContext : item.rightContext;
          const immediateContext = context.charAt(0) || '';
          if (!contextGroups.has(immediateContext)) {
            contextGroups.set(immediateContext, []);
          }
          contextGroups.get(immediateContext).push(item);
        });

        // Sort groups by size (descending) and then by immediate context character
        const sortedGroups = Array.from(contextGroups.entries()).sort((a, b) => {
          const sizeComparison = b[1].length - a[1].length;
          return sizeComparison !== 0 ? sizeComparison : a[0].localeCompare(b[0]);
        });

        // Flatten the sorted groups back into a single array
        filtered = sortedGroups.flatMap(([_, group]) => {
          // Within each group, sort by the full context
          return group.sort((a, b) => {
            const aContext = sortBy === "leftContext" ? a.leftContext : a.rightContext;
            const bContext = sortBy === "leftContext" ? b.leftContext : b.rightContext;
            return aContext.localeCompare(bContext);
          });
        });
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
          options: [
            t('action.cancel'),
            t('title.popularity'),
            t('title.likes'),
            t('title.date'),
            t('title.length'),
            t('title.leftContext'),
            t('title.rightContext')
          ],
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
      const options = ['popularity', 'likes', 'date', 'length', 'leftContext', 'rightContext'];
      const currentIndex = options.indexOf(sortBy);
      const nextIndex = (currentIndex + 1) % options.length;
      setSortBy(options[nextIndex]);
    }
  };

  return (
    <GestureHandlerRootView style={styles.fullContainer}>
      <View style={styles.fullContainer}>
        <ThemedButton
          title={t('msg.sort_by', { sortBy: t(`title.${sortBy}`) })}
          type="ghost"
          size="small"
          trailingIcon={<Ionicons name="caret-down" />}
          onPress={showSortOptions}
          style={{marginBottom: 8}}
        />
        <ThemedInput
          placeholder={t('placeholder.search')}
          icon="magnify"
          style={styles.searchInput}
          value={searchTerm}
          size="small"
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
              <HighlightSearchTerm
                line={item.subs_l2[item.targetLineIndex]?.line}
                searchTerm={searchTerm}
              />
            </TouchableOpacity>
          )}
          keyExtractor={(item, index) => index.toString()}
        />
      </View>
    </GestureHandlerRootView>
  );
};