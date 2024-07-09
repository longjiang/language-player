// @/app/tv-shows.tsx

import React, { useRef, useState, useMemo } from "react";
import { View, TouchableOpacity } from "react-native";
import { ThemedButton } from "@/components/ThemedButton";
import { ThemedScreen } from "@/components/ThemedScreen";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { router } from "expo-router";
import { ThemedInput } from "@/components/ThemedInput";
import { FlatList } from "react-native-gesture-handler";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ActivityIndicator } from 'react-native';
import { ShowCard, Show } from "@/components/ShowCard";
import { tvShowsStyles as styles } from "@/src/styles";
import { ThemedRBSheet } from "@/components/ThemedRBSheet";
import { ThemedText } from "@/components/ThemedText";
import { ThemedRadio } from "@/components/ThemedRadio";
import { useTVShows } from "@/contexts/TVShowsContext";

const TVShowsScreen = () => {
  const { shows, isLoading } = useTVShows();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOption, setSortOption] = useState('views');  // Changed default to 'views'
  const [localeFilter, setLocaleFilter] = useState('all');

  const rbSheetRef = useRef(null);

  const filteredAndSortedShows = useMemo(() => {
    return shows
      .filter(show => 
        show.title.toLowerCase().includes(searchQuery.toLowerCase()) &&
        (localeFilter === 'all' || show.locale === localeFilter)
      )
      .sort((a, b) => {
        switch (sortOption) {
          case 'title':
            return a.title.localeCompare(b.title);
          case 'views':
            return b.avg_views - a.avg_views;
          case 'year':
            return (b.year || 0) - (a.year || 0);
          default:
            return 0;
        }
      });
  }, [shows, searchQuery, sortOption, localeFilter]);

  const handleInputChange = (text: string) => {
    setSearchQuery(text);
  };

  const handleActions = () => {
    rbSheetRef.current?.open();
  };

  const handleLocaleFilter = (locale: string) => {
    setLocaleFilter(locale);
    rbSheetRef.current?.close();
  };

  const getUniqueLocales = () => {
    const locales = new Set(shows.map(item => item.locale).filter(Boolean));
    return ["all", ...Array.from(locales)];
  };

  const SortOption = ({ title, option }) => (
    <TouchableOpacity 
      style={styles.sortOption} 
      onPress={() => {
        setSortOption(option);
        rbSheetRef.current?.close();
      }}
    >
      <ThemedRadio
        key={title}
        label={title}
        isSelected={sortOption === option}
        onPress={() => {
          setSortOption(option);
          rbSheetRef.current?.close();
        }}
      />
    </TouchableOpacity>
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemedScreen
        title="TV Shows"
        onBackPress={() => router.back()}
        showFlag={false}
        onAction={handleActions}
        showHeader={!searchQuery}
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            {searchQuery && (
              <ThemedButton
                type="ghost"
                size="medium"
                trailingIcon={<Icon name="chevron-left" />}
                onPress={() => router.navigate("/(tabs)/(media)")}
              />
            )}
            <ThemedInput
              placeholder="Filter by title..."
              style={{ flex: 1, marginRight: 6 }}
              icon="magnify"
              size="small"
              onChangeText={handleInputChange}
              value={searchQuery}
            />
            {searchQuery && (
              <ThemedButton
                type="ghost"
                size="medium"
                trailingIcon={<Icon name="dots-horizontal-circle" />}
                onPress={handleActions}
              />
            )}
          </View>
        </View>
        {isLoading && (
          <View style={styles.spinnerContainer}>
            <ActivityIndicator size="large" color="#a772d0" />
          </View>
        )}

        <View>
          <FlatList
            data={filteredAndSortedShows}
            renderItem={({ item }) => (
              <ShowCard show={item} style={{ marginBottom: 26 }} />
            )}
            keyExtractor={(item) => item.id.toString()}
          />
        </View>
      </ThemedScreen>

      <ThemedRBSheet ref={rbSheetRef} height={400}>
        <ThemedText type="subtitle" style={{ marginBottom: 12 }}>SORT BY</ThemedText>
        <SortOption title="Most Viewed" option="views" />
        <SortOption title="Title" option="title" />
        {/* <SortOption title="Year" option="year" /> */}
        
        <ThemedText type="subtitle" style={{ marginTop: 20, marginBottom: 12 }}>FILTER BY LOCALE</ThemedText>
        {getUniqueLocales().map(locale => (
          <TouchableOpacity 
            key={locale}
            style={styles.sortOption} 
            onPress={() => handleLocaleFilter(locale)}
          >
            <ThemedRadio
              label={locale === "all" ? "All Locales" : locale}
              isSelected={localeFilter === locale}
              onPress={() => handleLocaleFilter(locale)}
            />
          </TouchableOpacity>
        ))}
      </ThemedRBSheet>
    </GestureHandlerRootView>
  );
};

export default TVShowsScreen;