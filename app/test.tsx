import React, { useRef } from "react";
import { View, StyleSheet } from "react-native";
import { SubsSearch } from '@/components/SubsSearch';  // Import the SubsSearch component
import { ThemedView } from "@/components/ThemedView";
import { SubsSearchResultsList } from "@/components/SubsSearchResultsList";

function Test() {
  const refRBSheet = useRef();
  return (
    <ThemedView style={styles.fullscreen}>
      <SubsSearch term="你好" />
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