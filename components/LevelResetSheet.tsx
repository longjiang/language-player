// @/components/LevelResetSheet.tsx
import React, { forwardRef } from "react";
import { StyleSheet, View } from "react-native";
import { ThemedRBSheet } from "./ThemedRBSheet";
import { ThemedText } from "@/components/ThemedText";
import { ThemedButton } from "@/components/ThemedButton";
import { useLanguage } from "@/contexts/LanguageContext";

interface LevelResetSheetProps {
  onConfirm: (resetTime: boolean) => void;
}

const LevelResetSheet = forwardRef<RBSheet, LevelResetSheetProps>(({ onConfirm }, ref) => {
  const { t } = useLanguage();

  return (
    <ThemedRBSheet ref={ref}>
      <View style={styles.container}>
        <ThemedText style={styles.title} type="subtitle">
          {t('title.update_progress')}
        </ThemedText>
        <ThemedText style={styles.message}>
          {t('msg.keep_or_reset_time')}
        </ThemedText>
        <ThemedButton
          title={t('button.keep_current_time')}
          type="neutral"
          onPress={() => onConfirm(false)}
          style={styles.button}
        />
        <ThemedButton
          title={t('button.reset_time_to_zero')}
          type="primary"
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