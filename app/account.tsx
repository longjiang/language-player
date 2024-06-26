// @/app/account.tsx
import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { ThemedButton, ThemedScreen, ThemedText } from "@/components";
import Icon from "react-native-vector-icons/MaterialIcons";
import { router } from "expo-router";
import { PricingBlock } from "@/components/PricingBlock";
import { useThemeColor } from "@/hooks/useThemeColor";

const AccountScreen = () => {
  const secondaryTextColor = useThemeColor({}, "secondaryText");

  return (
    <ThemedScreen
      title="Account"
      imageName={require("../assets/images/splash-image.png")}
      imageStyle={{ marginTop: -400 }}
      onBackPress={() => {
        router.back();
      }}
    >
      <ThemedText style={{ alignSelf: "center", marginTop: 16 }} type="xxlarge">
        Tim Burton
      </ThemedText>
      <ThemedText
        style={{ alignSelf: "center", marginBottom: 32 + 16 }}
        variant="secondary"
      >
        tim.burton@example.com
      </ThemedText>
      <PricingBlock
        price="$89/yr"
        duration="Auto renews in 5 months 10 days."
        current
        showButtons
      />

      <ThemedButton
        title="Logout"
        leadingIcon={<Icon name="logout" size={20} />}
        style={styles.button}
        type="ghost"
        onPress={() => {
          router.navigate("/login");
        }}
      />

      <View style={styles.buttonRow}>
        <ThemedButton
          title="Delete My Account"
          size="small"
          type="ghost"
          onPress={() => {
            router.navigate("/delete-account");
          }}
          style={{ color: secondaryTextColor }}
        />
        <ThemedButton
          title="Privacy Policy"
          size="small"
          type="ghost"
          onPress={() => {
            router.navigate("/privacy-policy");
          }}
          style={{ color: secondaryTextColor }}
        />
      </View>
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
