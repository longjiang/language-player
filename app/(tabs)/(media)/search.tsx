// @/app/select-l2.tsx
import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { ThemedButton } from "@/components/ThemedButton";
import { ThemedScreen } from "@/components/ThemedScreen";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { router } from "expo-router";
import { getCollectionItems, buildFilterQueryParams } from "@/src/api/directus";
import { ThemedInput } from "@/components/ThemedInput";
import { ThemedText } from "@/components/ThemedText";
import { YouTubeVideoCard } from "@/components/YouTubeVideoCard";
import { FlatList } from "react-native-gesture-handler";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";

const SearchScreen = () => {
  const [items, setItems] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    // Search screen mounted
    if (searchQuery) {
      // Load items based on search query
      loadItems();
    }
  }, []);

  const handleInputChange = (text) => {
    setSearchQuery(text);
  };

  const handleSearch = () => {
    // Trigger search based on searchQuery
    loadItems();
  };

  const loadItems = async () => {
    try {
      const data = await getCollectionItems("youtube_videos_4", {
        filter: { title: { contains: searchQuery } },
        fields: 'id,l2,title,youtube_id,tv_show,talk,date,lex_div,word_freq,difficulty,views,tags,category,locale,duration,made_for_kids,views,likes,comments,type'
      });
      setItems(data.data);
    } catch (error) {
      console.error("Failed to load items:", error);
    }
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {items.length === 0 && (
        <ThemedScreen
          title="Search"
          onBackPress={() => router.back()}
          showFlag={true}
        >
          <ThemedInput
            placeholder="Search all Chinese content"
            style={{ marginBottom: 20 }}
            icon="magnify"
            onChangeText={handleInputChange}
            onSubmitEditing={handleSearch}
            value={searchQuery}
          />
          <ThemedText type="default" variant="secondary">
            You can also paste in YouTube URL to import.
          </ThemedText>
        </ThemedScreen>
      )}
      {items.length > 0 && (
        <SafeAreaView style={styles.resultsContainer}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <ThemedButton
                type="ghost"
                size="medium"
                trailingIcon={<Icon name="chevron-left" />}
                onPress={() => router.navigate("/(tabs)/(media)")}
              />
              <ThemedInput
                placeholder="Search all Chinese content"
                style={{ flex: 1, paddingVertical: 8 }}
                icon="magnify"
                onChangeText={handleInputChange}
                onSubmitEditing={handleSearch}
                value={searchQuery}
              />
              <ThemedButton
                type="ghost"
                size="medium"
                trailingIcon={<Icon name="dots-horizontal-circle" />}
                onPress={() => router.navigate("/(tabs)/(media)")}
              />
            </View>
          </View>
          <FlatList
            data={items}
            renderItem={({ item }) => (
              <YouTubeVideoCard video={item} style={{ marginBottom: 20 }} />
            )}
            style={{ padding: 26 }}
            keyExtractor={(item) => item.id}
          />
        </SafeAreaView>
      )}
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  resultsContainer: {
    
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    marginBottom: 20,
    marginLeft: -15,
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 26,
  },
});

export default SearchScreen;
