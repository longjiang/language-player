// @/app/account.tsx
import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { ThemedButton, ThemedScreen, ThemedText } from "@/components";
import Icon from "react-native-vector-icons/MaterialIcons";
import { router } from "expo-router";
import { PricingBlock } from "@/components/PricingBlock";
import { useThemeColor } from "@/hooks/useThemeColor";

const AccountScreen = () => {
  const [code, setCode] = useState("");

  const onSelect = (value: string) => {
    console.log("Selected:", value);
  };

  const secondaryTextColor = useThemeColor({}, "secondaryText");
  const semanticErrorColor = useThemeColor({}, "semanticError");

  return (
    <ThemedScreen
      title="Delete Account"
      onBackPress={() => {
        router.back();
      }}
    >
      <ThemedText
        type="subtitle"
        style={{ marginBottom: 26 }}
      >
        Are you sure you want to permanently delete your account? You will lose
        all your saved words and progress. This action cannot be undone.
      </ThemedText>
      <ThemedButton
        title="Confirm Deletion"
        type="primary"
        style={{
          marginBottom: 10,
        }}
      />
      <ThemedButton
        title="Keep Account"
        type="accent"
      />
    </ThemedScreen>
  );
};

const styles = StyleSheet.create({
  item: {
    padding: 16,
  },
  button: {
    marginTop: 20,
    marginBottom: 110,
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16, // Add padding to the sides if needed
    marginTop: 16, // Add top margin to separate from the content above
  },
});

export default AccountScreen;
