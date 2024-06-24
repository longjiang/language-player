// @/app/tv-shows.tsx
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
import { ActivityIndicator } from 'react-native';
import { useThemeColor } from "@/hooks/useThemeColor";
import { ShowCard } from "@/components/ShowCard";


const TVShowsScreen = () => {
  const [items, setItems] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const primaryBrandColor = useThemeColor({}, "primaryBrand");


  useEffect(() => {
    // Search screen mounted
    loadItems();
  }, []);

  const handleInputChange = (text) => {
    setSearchQuery(text);
  };

  const handleSearch = () => {
    // Trigger search based on searchQuery
    loadItems();
  };

  const loadItems = async () => {
    setItems([]); // Clear items
    setIsLoading(true); // Start loading
    
    setIsLoading(false); // Stop loading
  };
  

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemedScreen
        onBackPress={() => router.back()}
        showFlag={false}
        onAction={() => router.navigate("/select-l2")}
        showHeader={false}
      >
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
              style={{ flex: 1, marginRight: 6 }}
              icon="magnify"
              size="small"
              onChangeText={handleInputChange}
              onSubmitEditing={handleSearch}
              value={searchQuery}
            />
            <ThemedButton
              type="ghost"
              size="medium"
              trailingIcon={<Icon name="cog-outline" />}
              onPress={() => router.navigate("/(tabs)/(media)")}
            />
          </View>
        </View>

      </ThemedScreen>

    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    marginBottom: 26,
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  spinnerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 100,
  },
});

export default TVShowsScreen;
