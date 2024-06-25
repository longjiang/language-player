import React, { useRef } from "react";
import { View, StyleSheet } from "react-native";
import { SubsSearch } from "@/components/SubsSearch"; // Import the SubsSearch component
import { ThemedView } from "@/components/ThemedView";
import { SubsSearchResultsList } from "@/components/SubsSearchResultsList";
import { TokenizedText } from "@/components/TokenizedText";
import {
  GestureHandlerRootView,
  ScrollView,
} from "react-native-gesture-handler";
import { PopupDictionaryHeader } from "@/components/PopupDictionaryHeader";
import { PopupDictionaryContent } from "@/components/PopupDictionaryContent";
import { SafeAreaView } from "react-native-safe-area-context";
import { useThemeColor } from "@/hooks/useThemeColor";

function Test() {
  const refRBSheet = useRef();
  const wordData = {
    word: "睡不着",
    pos: "v",
    pronunciation: "shuì bù zhe",
  };
  const context = "我吃不下睡不着";
  const translatedContext = "I can't eat, I can't sleep";
  const wordTranslation = "can't sleep";
  const secondaryBackgroundColor = useThemeColor({}, "secondaryBackground");


  const styles = StyleSheet.create({
    fullscreen: {
      flex: 1, // Use flex to expand to the full screen
      padding: 26,
      backgroundColor: secondaryBackgroundColor,
    },
  });
  
  return (
    <GestureHandlerRootView>
      <SafeAreaView style={styles.fullscreen}>
        <ScrollView>
          <TokenizedText text="我吃不下睡不着" />
        </ScrollView>
      </SafeAreaView>
    </GestureHandlerRootView>
  );

}

export default Test;
