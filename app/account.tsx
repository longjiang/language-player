// @/app/account.tsx
import React, { useState } from "react";
import { StyleSheet } from "react-native";
import { ThemedButton } from "@/components/ThemedButton";
import { ThemedScreen } from "@/components/ThemedScreen";
import Icon from "react-native-vector-icons/MaterialIcons";
import { router } from "expo-router";

const AccountScreen = () => {
  const [code, setCode] = useState("");

  const onSelect = (value) => {
    console.log('Selected:', value);
  }

  return (
    <ThemedScreen
      title="Account"
      imageName={require("../assets/images/splash-image.png")}
      imageStyle={{ marginTop: -400 }}
      onBackPress={() => {
        router.back();
      }}
    >
      
      <ThemedButton
        title="Go Pro"
        trailingIcon={<Icon name="chevron-right" />}
        style={styles.button}
        onPress={() => {
          router.navigate("/go-pro");
        }}
      />
    </ThemedScreen>
  );
};

const styles = StyleSheet.create({
  item: {
    padding: 16,
  },
  instructions: {
    marginBottom: 20,
  },
  button: {
    marginTop: 20,
    marginBottom: 110,
  },
});

export default AccountScreen;
