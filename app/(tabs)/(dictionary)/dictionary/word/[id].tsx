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
  const { dictionary } = useDictionary();
  const route = useRoute();
  const id = decodeURIComponent(route.params.id);

  useEffect(() => {
    if (dictionary) {
      loadEntry();
    }
  }, [dictionary, id]);

  const handleInputChange = (text) => {
    setSearchQuery(text);
  };

  const handleSearch = () => {
    loadEntry();
  };

  const loadEntry = async () => {
    setIsLoading(true);
    
    try {
      if (dictionary) {
        const entryData = dictionary.getEntry(id);
        setEntry(entryData);
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
        {entry && (
          <View style={styles.entryContainer}>
            <ThemedText type="subtitle" style={styles.character}>{entry.simplified} {entry.traditional}</ThemedText>
            <ThemedText type="defaultBold">{entry.pinyin}</ThemedText>
            <ThemedText type="default">{entry.definitions}</ThemedText>
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
  character: {
    fontSize: 24, // Adjust as needed
    fontWeight: 'bold',
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
