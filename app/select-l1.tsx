// @/app/select-l2.tsx
import React, { useState } from "react";
import { StyleSheet } from "react-native";
import { ThemedLanguageSelect } from "@/components/ThemedLanguageSelect";
import { ThemedButton } from "@/components/ThemedButton";
import { ThemedScreen } from "@/components/ThemedScreen";
import { router } from "expo-router";
import Icon from "react-native-vector-icons/MaterialIcons";

const SelectL2Screen = () => {
  const [code, setCode] = useState("");

  const onSelect = (value) => {
    console.log('Selected:', value);
  }

  return (
    <ThemedScreen
      title="What’s your first language?"
      onBackPress={() => router.navigate("/select-l2")}
      imageName={require("../assets/images/splash-image.png")}
      imageStyle={{ marginTop: -400 }}
    >
      <ThemedLanguageSelect onSelect={onSelect} />


      <ThemedButton
        title="Next"
        trailingIcon={<Icon name="chevron-right" />}
        style={styles.button}
        onPress={() => {
          router.navigate("/acquisition-survey");
        }}
      />
    </ThemedScreen>
  );
};

const styles = StyleSheet.create({
  item: {
    padding: 16,
  },
  image: {
    width: "100%",
    marginBottom: 20,
    position: "relative",
    top: -230,
  },
  instructions: {
    marginBottom: 20,
  },
  button: {
    marginTop: 20,
    marginBottom: 110,
  },
  // Add or adjust other styles as necessary
});

export default SelectL2Screen;
