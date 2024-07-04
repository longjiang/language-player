// @/app/tv-shows.tsx

import React, { useEffect, useState, useRef } from "react";
import { StyleSheet, View, TouchableOpacity } from "react-native";
import { ThemedButton } from "@/components/ThemedButton";
import { ThemedScreen } from "@/components/ThemedScreen";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { router } from "expo-router";
import { getCollectionItems } from "@/src/api/directus";
import { ThemedInput } from "@/components/ThemedInput";
import { FlatList } from "react-native-gesture-handler";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ActivityIndicator } from 'react-native';
import { useThemeColor } from "@/hooks/useThemeColor";
import { ShowCard, Show } from "@/components/ShowCard";
import { useLanguage } from "@/contexts/LanguageContext";
import { tvShowsStyles as styles } from "@/src/styles";
import { ThemedRBSheet } from "@/components/ThemedRBSheet";
import { ThemedText } from "@/components/ThemedText";

const TVShowsScreen = () => {
  const [items, setItems] = useState<Show[]>([]);
  const [filteredItems, setFilteredItems] = useState<Show[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sortOption, setSortOption] = useState("title");
  const primaryBrandColor = useThemeColor({}, "primaryBrand");
  const { l2Lang } = useLanguage();
  const rbSheetRef = useRef(null);

  useEffect(() => {
    loadItems();
  }, []);

  useEffect(() => {
    sortItems(sortOption);
  }, [sortOption, items]);

  const handleInputChange = (text: string) => {
    setSearchQuery(text);
    filterItems(text);
  };

  const filterItems = (query: string) => {
    const filtered = items.filter(item =>
      item.title.toLowerCase().includes(query.toLowerCase())
    );
    setFilteredItems(filtered);
  };

  const loadItems = async () => {
    if (!l2Lang) return;
    setItems([]);
    setFilteredItems([]);
    setIsLoading(true);
    try {
      const tvShows = await getCollectionItems("tv_shows", {
        filter: { l2: { eq: l2Lang.id } },
      });
      setItems(tvShows as Show[]);
      setFilteredItems(tvShows as Show[]);
    } catch (error) {
      console.error("Failed to load items:", error);
    }
    setIsLoading(false);
  };

  const handleActions = () => {
    rbSheetRef.current?.open();
  };

  const sortItems = (option: string) => {
    const sorted = [...items].sort((a, b) => {
      switch (option) {
        case "title":
          return a.title.localeCompare(b.title);
        case "views":
          return b.avg_views - a.avg_views;
        case "year":
          return (b.year || 0) - (a.year || 0);
        default:
          return 0;
      }
    });
    setFilteredItems(sorted);
  };

  const SortOption = ({ title, option }) => (
    <TouchableOpacity 
      style={styles.sortOption} 
      onPress={() => {
        setSortOption(option);
        rbSheetRef.current?.close();
      }}
    >
      <ThemedText>{title}</ThemedText>
      {sortOption === option && <Icon name="check" size={24} color={primaryBrandColor} />}
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
              placeholder="Search all Chinese content"
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
            data={filteredItems}
            renderItem={({ item }) => (
              <ShowCard show={item} style={{ marginBottom: 26 }} />
            )}
            keyExtractor={(item) => item.id.toString()}
          />
        </View>
      </ThemedScreen>

      <ThemedRBSheet ref={rbSheetRef} height={300}>
        <ThemedText style={styles.sortTitle}>Sort by</ThemedText>
        <SortOption title="Title" option="title" />
        <SortOption title="Most Viewed" option="views" />
      </ThemedRBSheet>
    </GestureHandlerRootView>
  );
};

export default TVShowsScreen;