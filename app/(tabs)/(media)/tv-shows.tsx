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
    try {
      const data = await getCollectionItems("tv_shows", {
        filter: { l2: { eq: 7731 } }, // 7731 is Chinese
      });
      setItems(data.data);
    } catch (error) {
      console.error("Failed to load items:", error);
    }
    setIsLoading(false); // Stop loading
  };
  

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemedScreen
        title="TV Shows"
        onBackPress={() => router.back()}
        showFlag={false}
        onAction={() => router.navigate("/select-l2")}
        showHeader={searchQuery ? false : true}
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            {(searchQuery && <ThemedButton
              type="ghost"
              size="medium"
              trailingIcon={<Icon name="chevron-left" />}
              onPress={() => router.navigate("/(tabs)/(media)")}
            />)}
            <ThemedInput
              placeholder="Search all Chinese content"
              style={{ flex: 1, marginRight: 6 }}
              icon="magnify"
              size="small"
              onChangeText={handleInputChange}
              onSubmitEditing={handleSearch}
              value={searchQuery}
            />
            {(searchQuery && <ThemedButton
              type="ghost"
              size="medium"
              trailingIcon={<Icon name="dots-horizontal-circle" />}
              onPress={() => router.navigate("/(tabs)/(media)")}
            />)}
          </View>
        </View>
        {isLoading && (
          <View style={styles.spinnerContainer}>
            <ActivityIndicator size="large" color="#a772d0" />
          </View>
        )}

        <View>
          <FlatList
            data={items}
            renderItem={({ item }) => (
              <ShowCard show={item} style={{ marginBottom: 26 }} />
            )}
            keyExtractor={(item) => item.id}
          />
          {isLoading && (
            <View style={styles.spinnerContainer}>
              <ActivityIndicator size="large" color={primaryBrandColor} />
            </View>
          )}
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
