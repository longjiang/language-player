// @/app/search.tsx
import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { ThemedButton } from "@/components/ThemedButton";
import { ThemedScreen } from "@/components/ThemedScreen";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { router } from "expo-router";
import { ThemedInput } from "@/components/ThemedInput";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";
import { ActivityIndicator } from 'react-native';
import { useThemeColor } from "@/hooks/useThemeColor";
import { useDictionary } from "@/contexts/DictionaryContext";
import { DictionaryComponent } from "@/components/DictionaryComponent";
import { DictionaryEntry } from "@/src/dictionary-types";
import { useLanguage } from "@/contexts/LanguageContext";

const DictionaryScreen = () => {
  const [items, setItems] = useState<DictionaryEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const primaryBrandColor = useThemeColor({}, "primaryBrand");
  const { dictionary } = useDictionary();
  const { t } = useLanguage();

  useEffect(() => {
    console.log('DictionaryScreen - Mounted');
    if (searchQuery) {
      loadItems();
    }
  }, []);

  const handleInputChange = (text: string) => {
    setSearchQuery(text);
  };

  const handleSearch = () => {
    loadItems();
  };

  const loadItems = async () => {
    setItems([]);
    setIsLoading(true);
    if (!dictionary) return;
    dictionary.search(searchQuery).then((results) => {
      setItems(results);
    })
    setIsLoading(false);
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemedScreen
          title={t('title.dictionary')}
          showFlag={true}
        >
          <DictionaryComponent />
          {isLoading && (
            <View style={styles.spinnerContainer}>
              <ActivityIndicator size="large" color="#a772d0" />
            </View>
          )}
        </ThemedScreen>
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