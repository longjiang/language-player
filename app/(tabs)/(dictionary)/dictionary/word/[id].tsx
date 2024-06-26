import React, { useEffect, useState } from "react";
import { StyleSheet, View, ActivityIndicator, Text, ScrollView } from "react-native";
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
import { SubsSearch } from "@/components/SubsSearch";
import { DictionaryEntry } from "@/src/dictionary";
import { RouteProp } from '@react-navigation/native';

type DictionaryEntryScreenRouteParams = {
  id: string;
};



const DictionaryEntryScreen = () => {
  const route = useRoute<RouteProp<{
    DictionaryEntryScreen: DictionaryEntryScreenRouteParams;
  }, 'DictionaryEntryScreen'>>();
  if (!route.params) return;
  const id = decodeURIComponent(route.params.id) 

  const [entry, setEntry] = useState<null | DictionaryEntry>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const { dictionary } = useDictionary();

  useEffect(() => {
    if (dictionary) {
      loadEntry();
    }
  }, [dictionary, id]);

  const handleInputChange = (text: string) => {
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
        if (entryData) setEntry(entryData);
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
  const secondaryStrokeColor = useThemeColor({}, 'secondaryStroke');
  const primaryBackgroundColor = useThemeColor({}, 'primaryBackground');

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: primaryBackgroundColor }}>
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
            value={searchQuery || entry?.head}
          />
          <ThemedButton
            type="ghost"
            size="medium"
            trailingIcon={<Icon name="cog-outline" />}
            onPress={() => router.navigate("/(tabs)/(media)")}
          />
        </View>
        {entry && (
          <ScrollView style={styles.entryContainer}>
            <View style={styles.entryHeader}>
              <View style={{ flexDirection: "row", alignItems: "flex-end", marginBottom: 12 }}>
                <Text>
                  <ThemedText type="xxlarge" style={styles.character} level={entry.level}>
                    {entry.head}
                  </ThemedText>
                </Text>
                <ThemedText type="subtitle" style={{ marginLeft: 4, fontWeight: 'normal' }} variant="secondary">
                  {entry.alternate}
                </ThemedText>
              </View>
              <Text><ThemedText type="default">{entry.pronunciation} • </ThemedText><ThemedText type="smallBold" level={entry.level}>HSK {entry.level}</ThemedText></Text>
            </View>
            <View style={[styles.detailsContainer, { backgroundColor: tertiaryBackgroundColor }]}>
              <View style={{ paddingBottom: 16, paddingHorizontal: 26 }}>
                <ThemedText type="large">{entry.definitions.join('; ')}</ThemedText>
                <View style={{ borderBottomColor: secondaryStrokeColor, borderBottomWidth: 2, paddingBottom: 16 }}></View>
                <ThemedText type="defaultBold" style={{ marginTop: 26 }}>EXAMPLES FROM VIDEOS</ThemedText>
              </View>
              <SubsSearch term={entry.head} />
            </View>
          </ScrollView>
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
    paddingTop: 26,
    minHeight: 600,
  }
});

export default DictionaryEntryScreen;
