// @/components/LevelResetSheet.tsx
import React, { forwardRef } from "react";
import { StyleSheet, View } from "react-native";
import { ThemedRBSheet } from "./ThemedRBSheet";
import { ThemedText } from "@/components/ThemedText";
import { ThemedButton } from "@/components/ThemedButton";

interface LevelResetSheetProps {
  onConfirm: (resetTime: boolean) => void;
}

const LevelResetSheet = forwardRef<RBSheet, LevelResetSheetProps>(({ onConfirm }, ref) => {
  return (
    <ThemedRBSheet ref={ref}>
      <View style={styles.container}>
        <ThemedText style={styles.title} type="subtitle">Update Progress</ThemedText>
        <ThemedText style={styles.message}>Do you want to keep your current time or reset it to zero?</ThemedText>
        <ThemedButton
          title="Keep Current Time"
          type="primary"
          onPress={() => onConfirm(false)}
          style={styles.button}
        />
        <ThemedButton
          title="Reset Time to Zero"
          type="neutral"
          onPress={() => onConfirm(true)}
          style={styles.button}
        />
      </View>
    </ThemedRBSheet>
  );
});

const styles = StyleSheet.create({
  container: {
    padding: 20,
  },
  title: {
    marginBottom: 20,
    textAlign: 'center',
  },
  message: {
    marginBottom: 20,
    textAlign: 'center',
  },
  button: {
    marginBottom: 10,
  },
});

export default LevelResetSheet;
