import React, { useEffect, useState } from "react";
import { StyleSheet, View, ActivityIndicator, Text } from "react-native";
import { ThemedButton } from "@/components/ThemedButton";
import { ThemedInput } from "@/components/ThemedInput";
import { ThemedScreen } from "@/components/ThemedScreen";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { router } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useRoute, useTheme } from "@react-navigation/native";
import { useDictionary } from "@/contexts/DictionaryContext";
import { ThemedText } from "@/components/ThemedText";
import { useThemeColor } from "@/hooks/useThemeColor";
import { SafeAreaView } from "react-native-safe-area-context";

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
        console.log("Dictionary not loaded yet");
      }
    } catch (error) {
      console.error("Failed to load entry:", error);
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

  const tertiaryBackgroundColor = useThemeColor({}, 'tertiaryBackground');

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={{ marginTop: 16 }}>
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
            value={searchQuery || entry?.simplified}
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
            <View style={styles.entryHeader}>
              <View style={{ flexDirection: "row", alignItems: "flex-end", marginBottom: 12 }}>
                <Text>
                  <ThemedText type="display" style={styles.character} level={entry.hsk}>
                    {entry.simplified}
                  </ThemedText>
                </Text>
                <ThemedText type="subtitle" style={{ marginLeft: 4, fontWeight: 'normal' }} variant="secondary">
                  {entry.traditional}
                </ThemedText>
              </View>
              <Text><ThemedText type="default">{entry.pinyin} • </ThemedText><ThemedText type="defaultBold" level={entry.hsk}>HSK {entry.hsk}</ThemedText></Text>
            </View>
            <View style={[styles.detailsContainer, {backgroundColor: tertiaryBackgroundColor}]}>
              <ThemedText type="default">{entry.definitions}</ThemedText>
            </View>
          </View>
        )}
      </SafeAreaView>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  character: {

  },
  spinnerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 100,
  },
  entryContainer: {

  },
  entryHeader: {
    padding: 26
  },
  detailsContainer: {
    borderRadius: 24,
    padding: 26,
    minHeight: 600,
  }
});

export default DictionaryEntryScreen;
