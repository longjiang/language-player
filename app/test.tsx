import React, { useRef } from "react";
import { View, StyleSheet } from "react-native";
import { SubsSearch } from '@/components/SubsSearch';  // Import the SubsSearch component
import { ThemedView } from "@/components/ThemedView";
import { SubsSearchResultsList } from "@/components/SubsSearchResultsList";
import { TokenizedText } from "@/components/TokenizedText";

function Test() {
  const refRBSheet = useRef();
  return (
    <ThemedView style={styles.fullscreen}>
      <TokenizedText text="猫咪说，我不是猫，我是一只狮子，只是大小有点儿不一样。" textScale={3} textWeight="bold" />
    </ThemedView>
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