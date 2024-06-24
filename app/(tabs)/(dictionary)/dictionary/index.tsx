// @/app/search.tsx
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
import { useDictionary } from "@/contexts/DictionaryContext";
import { DictionaryComponent } from "@/components/DictionaryComponent";


const DictionaryScreen = () => {
  const [items, setItems] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const primaryBrandColor = useThemeColor({}, "primaryBrand");
  const { dictionary } = useDictionary(); // Custom hook to access the dictionary


  useEffect(() => {
    console.log('DictionaryScreen - Mounted');
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
    setItems([]); // Clear items
    setIsLoading(true); // Start loading
    // console.log('Screen - Searching for:', searchQuery);
    dictionary.search(searchQuery).then((results) => {
      setItems(results);
    })

    setIsLoading(false); // Stop loading
  };
  

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {true && (
        <ThemedScreen
          title="Dictionary"
          showFlag={true}
        >
          
          <DictionaryComponent />
          {isLoading && (
            <View style={styles.spinnerContainer}>
              <ActivityIndicator size="large" color="#a772d0" />
            </View>
          )}
        </ThemedScreen>
      )}
      {false && (
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
                style={{ flex: 1, marginRight: 8 }}
                size="small"
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
          {isLoading && (
            <View style={styles.spinnerContainer}>
              <ActivityIndicator size="large" color={primaryBrandColor} />
            </View>
          )}
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
  spinnerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 100,
  },
});

export default DictionaryScreen;
