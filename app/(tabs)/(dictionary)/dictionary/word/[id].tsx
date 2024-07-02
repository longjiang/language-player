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
import { DictionaryEntry } from "@/src/dictionary-types";
import { RouteProp } from '@react-navigation/native';
import { debounce } from 'lodash';
import { useLanguage } from "@/contexts/LanguageContext";
import { useSettings } from "@/contexts/SettingsContext";

type DictionaryEntryScreenRouteParams = {
  id: string;
};



const DictionaryEntryScreen = () => {
  const route = useRoute<RouteProp<{
    DictionaryEntryScreen: DictionaryEntryScreenRouteParams;
  }, 'DictionaryEntryScreen'>>();
  if (!route.params) return ;
  const id = decodeURIComponent(route.params.id) 

  const [entry, setEntry] = useState<null | DictionaryEntry>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const { dictionary } = useDictionary();
  const { l2Lang } = useLanguage();
  const { settings } = useSettings();
  if (!l2Lang) return null;

  const tertiaryBackgroundColor = useThemeColor({}, 'tertiaryBackground');
  const secondaryStrokeColor = useThemeColor({}, 'secondaryStroke');
  const primaryBackgroundColor = useThemeColor({}, 'primaryBackground');

  // if l2Lang.code is 'zh' and settings.useTraditional is true, then switch head and alternate keys
  const headKey = l2Lang.code === 'zh' && settings.useTraditional ? 'alternate' : 'head';
  const alternateKey = l2Lang.code === 'zh' && settings.useTraditional ? 'head' : 'alternate';

  useEffect(() => {
    if (dictionary) {
      loadEntry();
    }
  }, [dictionary, id]);

  // This is for 'search suggest': as the user types in the search bar, we want to show suggestions
  const handleInputChange = (text: string) => {
    setSearchQuery(text);
  };

  const handleSearch = () => {
    loadEntry();
  };

  const loadEntry = async () => {
    setIsLoading(true);
    setEntry(null); // Reset entry state for new searches

    if (dictionary) {
      const entryData = await dictionary.getEntry(id);
      // entryData will be null if not found, which is handled in rendering logic
      setEntry(entryData || null);  // Convert undefined to null if entryData is undefined
      setSearchQuery(entryData?.head || "");
    } else {
      console.log("Dictionary not loaded yet");
    }
    setIsLoading(false);
  };

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!entry) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ThemedText>Entry not found or dictionary not loaded</ThemedText>
      </View>
    );
  }

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
            style={{ flex: 1, marginHorizontal: 16 }}
            icon="magnify"
            size="small"
            onChangeText={debounce(handleInputChange, 300)}
            onSubmitEditing={handleSearch}
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
                    {entry[headKey]}
                  </ThemedText>
                </Text>
                <ThemedText type="subtitle" style={{ marginLeft: 4, fontWeight: 'normal' }} variant="secondary">
                  {entry[alternateKey]}
                </ThemedText>
              </View>
              <Text><ThemedText type="default">{entry.pronunciation} • </ThemedText><ThemedText type="smallBold" level={entry.level}>HSK {entry.level}</ThemedText></Text>
            </View>
            <View style={[styles.detailsContainer, { backgroundColor: tertiaryBackgroundColor }]}>
              <View style={{ paddingBottom: 16, paddingHorizontal: 26 }}>
                <ThemedText type="large">{entry.definitions ? entry.definitions.join('; ') : ''}</ThemedText>
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
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
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
