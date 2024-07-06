// @/app/account.tsx
import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { ThemedButton, ThemedScreen, ThemedText } from "@/components";
import Icon from "react-native-vector-icons/MaterialIcons";
import { router } from "expo-router";
import { PricingBlock } from "@/components/PricingBlock";
import { useThemeColor } from "@/hooks/useThemeColor";
import { useLanguage } from "@/contexts/LanguageContext";

const AccountScreen = () => {
  const [code, setCode] = useState("");
  const { t } = useLanguage();

  const onSelect = (value: string) => {
    console.log("Selected:", value);
  };

  const secondaryTextColor = useThemeColor({}, "secondaryText");
  const semanticErrorColor = useThemeColor({}, "semanticError");

  return (
    <ThemedScreen
      title={t('title.delete_account')}
      onBackPress={() => {
        router.back();
      }}
    >
      <ThemedText
        type="subtitle"
        style={{ marginBottom: 26 }}
      >
        {t('msg.delete_confirmation')}
      </ThemedText>
      <ThemedButton
        title={t('action.confirm_deletion')}
        type="primary"
        style={{
          marginBottom: 10,
        }}
      />
      <ThemedButton
        title={t('action.keep_account')}
        type="accent"
        onPress={() => {
          router.back();
        }}
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
    paddingHorizontal: 16,
    marginTop: 16,
  },
});

export default AccountScreen;