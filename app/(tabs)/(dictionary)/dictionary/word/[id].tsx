// @/app/(tabs)/(dictionary)/dictionary/word/[id].tsx

import React, { useEffect, useState } from "react";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { View, ActivityIndicator, Text } from "react-native";
import { ThemedButton, ThemedInput, ThemedText } from "@/components";
import { router } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useRoute } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DictionaryEntry } from "@/src/dictionary-types";
import { RouteProp } from '@react-navigation/native';
import { debounce } from 'lodash';
import { useLanguage } from "@/contexts/LanguageContext";
import { useSettings } from "@/contexts/SettingsContext";
import { useDictionary } from "@/contexts/DictionaryContext";
import { useThemeColor } from "@/hooks/useThemeColor";
import { dictionaryEntryStyles as styles } from "@/src/styles";
import DictionaryEntryContent from "@/components/DictionaryEntryContent";

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
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: useThemeColor({}, 'tertiaryBackground') }}>
      <SafeAreaView style={{ marginTop: 16 }}>
        <View style={styles.header}>
          <ThemedButton
            type="ghost"
            size="medium"
            trailingIcon={<Icon name="chevron-left" />}
            onPress={() => router.navigate("../")}
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
            onPress={() => router.navigate("/(tabs)/(me)/settings")}
          />
        </View>
        {entry && (
          <DictionaryEntryContent entry={entry} headKey={headKey} alternateKey={alternateKey} />
        )}
      </SafeAreaView>
    </GestureHandlerRootView>
  );
};

export default DictionaryEntryScreen;
