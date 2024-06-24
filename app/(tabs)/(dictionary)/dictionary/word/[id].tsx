import React, { useEffect, useState } from "react";
import { StyleSheet, View, ActivityIndicator } from "react-native";
import { ThemedButton } from "@/components/ThemedButton";
import { ThemedInput } from "@/components/ThemedInput";
import { ThemedScreen } from "@/components/ThemedScreen";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { router } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useRoute } from "@react-navigation/native";
import { useDictionary } from "@/contexts/DictionaryContext";
import { ThemedText } from "@/components/ThemedText";

const DictionaryEntryScreen = () => {
  const [entry, setEntry] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { dictionary } = useDictionary(); // Custom hook to access the dictionary
  const route = useRoute(); // Hook to access the current route parameters

  useEffect(() => {
    if (dictionary) {
      loadEntry();
    }
  }, [dictionary]); // Effect will rerun when `dictionary` changes

  const handleInputChange = (text) => {
    setSearchQuery(text);
  };

  const handleSearch = () => {
    loadEntry();
  };

  const loadEntry = async () => {
    setIsLoading(true);
    const id = decodeURIComponent(route.params.id); // Assuming `id` is passed as a route parameter
    try {
      if (dictionary) {
        // url decode the id
        // console.log('Getting entry:', id);
        const entryData = dictionary.getEntry(id); // Hypothetical method to get data
        setEntry(entryData);
        // console.log('Loaded entry:', entryData);
      } else {
        console.log('Dictionary not loaded yet');
      }
    } catch (error) {
      console.error('Failed to load entry:', error);
    }
    setIsLoading(false);
  };

  if (isLoading) {
    return (
      <View style={styles.spinnerContainer}>
        <ActivityIndicator size="large" color="#0000ff" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemedScreen
        onBackPress={() => router.back()}
        showFlag={false}
        onAction={() => router.navigate("/select-l2")}
        showHeader={false}
      >
        <View style={styles.header}>
          <ThemedButton
            type="ghost"
            size="medium"
            trailingIcon={<Icon name="chevron-left" />}
            onPress={() => router.navigate("/dictionary")}
          />
          <ThemedInput
            placeholder="Chinese, pinyin or English..."
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
        {/* Display the entry if it's loaded */}
        {entry && (
          <View style={styles.entryContainer}>
            <ThemedText>{entry.description}</ThemedText>
          </View>
        )}
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
  entryContainer: {
    padding: 20,
  },
});

export default DictionaryEntryScreen;
