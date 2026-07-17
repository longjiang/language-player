// @/app/(tabs)/(dictionary)/dictionary/word/[id].tsx

import React, { useEffect, useState, useCallback } from "react";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { View, ActivityIndicator } from "react-native";
import { ThemedButton, ThemedInput, ThemedText } from "@/components";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { debounce } from 'lodash';
import { useLanguage } from "@/contexts/LanguageContext";
import { useSettings } from "@/contexts/SettingsContext";
import { useDictionary } from "@/contexts/DictionaryContext";
import { useThemeColor } from "@/hooks/useThemeColor";
import { dictionaryEntryStyles as styles } from "@/src/styles";
import DictionaryEntryContent from "@/components/DictionaryEntryContent";
import { DictionaryComponent, getDictionaryPlaceholder } from "@/components/DictionaryComponent";

const DictionaryEntryScreen = () => {
  const { id: encodedId } = useLocalSearchParams<{ id: string }>();
  const { dictionary } = useDictionary();
  const { l2Lang, t } = useLanguage();
  const { settings } = useSettings();
  const primaryBackgroundColor = useThemeColor({}, 'primaryBackground');
  const secondaryBackgroundColor = useThemeColor({}, 'secondaryBackground');
  const tertiaryBackgroundColor = useThemeColor({}, 'tertiaryBackground');

  const [entry, setEntry] = useState<null | DictionaryEntry>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);

  if (!encodedId || !l2Lang || !dictionary) return null;
  const id = decodeURIComponent(encodedId);

  const headKey = l2Lang.code === 'zh' && settings.useTraditional ? 'alternate' : 'head';
  const alternateKey = l2Lang.code === 'zh' && settings.useTraditional ? 'head' : 'alternate';

  const loadEntry = useCallback(async () => {
    setIsLoading(true);
    setEntry(null);

    if (dictionary) {
      const entryData = await dictionary.getEntry(id);
      setEntry(entryData || null);
      setSearchQuery(entryData?.head || "");
    } else {
      console.log("Dictionary not loaded yet");
    }
    setIsLoading(false);
  }, [dictionary, id]);

  useEffect(() => {
    if (dictionary) {
      loadEntry();
    }
  }, [dictionary, loadEntry]);

  const handleInputChange = (text: string) => {
    setSearchQuery(text);
  };

  const handleSearch = () => {
    loadEntry();
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
        <ThemedText>{t('error.entry_not_found')}</ThemedText>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: secondaryBackgroundColor }}>
      <SafeAreaView style={{ marginTop: 16 }}>
        <View style={styles.header}>
        <DictionaryComponent showBackIcon={true} showSettingsIcon={true} inputBackgroundColor="primaryBackground" />
        </View>
        {entry && (
          <DictionaryEntryContent entry={entry} headKey={headKey} alternateKey={alternateKey} />
        )}
      </SafeAreaView>
    </View>
  );
};

export default DictionaryEntryScreen;