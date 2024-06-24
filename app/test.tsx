import React, { useRef } from "react";
import { View, Button } from "react-native";
import { SubsSearch } from '@/components/SubsSearch';  // Import the SubsSearch component
import { ThemedView } from "@/components/ThemedView";

function Test() {
  const refRBSheet = useRef();
  return (
    <ThemedView
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <SubsSearch term="你好" />
    </ThemedView>
  );
}

export default Test;