// @/app/select-l2.tsx
import React, { useState } from "react";
import { StyleSheet } from "react-native";
import { ThemedButton } from "@/components/ThemedButton";
import { ThemedScreen } from "@/components/ThemedScreen";
import Icon from "react-native-vector-icons/MaterialIcons";
import { router } from "expo-router";

const SelectLevelScreen = () => {
  const [code, setCode] = useState("");

  const onSelect = (value) => {
    console.log('Selected:', value);
  }

  return (
    <ThemedScreen
      title="What's your current Chinese level?"
      onBackPress={() => router.navigate("/select-l1")}
      imageName={require("../assets/images/splash-image.png")}
      imageStyle={{ marginTop: -400 }}
    >
      
      <ThemedButton
        title="Next"
        trailingIcon={<Icon name="chevron-right" />}
        style={styles.button}
        onPress={() => {
          router.navigate("/media/index");
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

export default SelectLevelScreen;
