// @/components/ContextRow.tsx

import React from "react";
import { View } from "react-native";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { ThemedText } from "./ThemedText";
import { ThemedButton } from "./ThemedButton";
import { popupDictionaryHeaderStyles as styles } from "@/src/styles";

interface ContextRowProps {
  context: string;
  translatedContext?: string;
  translation?: string;
}

export const ContextRow: React.FC<ContextRowProps> = ({ context, translatedContext, translation }) => {
  return (
    <View style={styles.contextRow}>
      <View style={{ flex: 1 }}>
        <ThemedText style={styles.contextText} type="large">
          {context}
        </ThemedText>
        <ThemedText style={styles.translatedContextText} variant="secondary">
          {translatedContext || translation}
        </ThemedText>
      </View>
      <ThemedButton
        type="ghost"
        trailingIcon={<Icon name="dots-vertical" size={20} />}
      />
    </View>
  );
};
