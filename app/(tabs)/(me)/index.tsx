// @/app/select-l2.tsx
import React from "react";
import { StyleSheet } from "react-native";
import { ThemedButton } from "@/components/ThemedButton";
import { ThemedScreen } from "@/components/ThemedScreen";
import Icon from "react-native-vector-icons/MaterialIcons";
import { router } from "expo-router";

const LanguageProgressScreen = () => {
  return (
    <ThemedScreen
      title="Language Progress"
      imageName={require("@/assets/images/splash-image.png")}
      imageStyle={{ marginTop: -400 }}
    >
      
      <ThemedButton
        title="Account"
        trailingIcon={<Icon name="chevron-right" />}
        style={styles.button}
        onPress={() => {
          router.navigate("/account");
        }}
      />
    </ThemedScreen>
  );
};

const styles = StyleSheet.create({
  button: {
    marginTop: 20,
    marginBottom: 110,
  },
});

export default LanguageProgressScreen;
