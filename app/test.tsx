import React, { useRef } from "react";
import { View, StyleSheet } from "react-native";
import { SubsSearch } from '@/components/SubsSearch';  // Import the SubsSearch component
import { ThemedView } from "@/components/ThemedView";
import { SubsSearchResultsList } from "@/components/SubsSearchResultsList";
import { TokenizedText } from "@/components/TokenizedText";
import { GestureHandlerRootView, ScrollView } from "react-native-gesture-handler";
import { PopupDictionaryHeader } from "@/components/PopupDictionaryHeader";
import { PopupDictionaryContent } from "@/components/PopupDictionaryContent";

function Test() {
  const refRBSheet = useRef();
  const wordData={
    "word": "睡不着",
    "pos": "v",
    "pronunciation": "shuì bù zhe"
  }
  const context = "我吃不下睡不着";
  const translatedContext = "I can't eat, I can't sleep";
  const wordTranslation = "can't sleep";

  return (
    <GestureHandlerRootView>
      <ScrollView contentContainerStyle={styles.fullscreen}>
        <PopupDictionaryHeader word={wordData.word} pronunciation={wordData.pronunciation} translation={wordTranslation} />
        <PopupDictionaryContent wordData={wordData} context={context} translatedContext={translatedContext} />
      </ScrollView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  fullscreen: {
    flex: 1, // Use flex to expand to the full screen
    justifyContent: 'center', // Center content vertically
    alignItems: 'center', // Center content horizontally
    padding: 26
  },
});

export default Test;