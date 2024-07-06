// @/app/search.tsx

import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { ThemedScreen } from "@/components/ThemedScreen";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ActivityIndicator } from 'react-native';
import { useThemeColor } from "@/hooks/useThemeColor";
import { useDictionary } from "@/contexts/DictionaryContext";
import { DictionaryComponent } from "@/components/DictionaryComponent";
import { DictionaryEntry } from "@/src/dictionary-types";
import { useLanguage } from "@/contexts/LanguageContext";

const DictionaryScreen = () => {
  const [isLoading, setIsLoading] = useState(false);
  const { t } = useLanguage();
  const [items, setItems] = useState<DictionaryEntry[]>([]);


  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemedScreen
          title={t('title.dictionary')}
          showFlag={true}
        >
          <View style={{ marginTop: items.length ? 0 : 32 }}>
            <DictionaryComponent searchBarSize={ items.length ? "small" : "medium" }  setItems={setItems} />
          </View>
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