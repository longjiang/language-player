// @/app/select-l2.tsx
import React from "react";
import { StyleSheet } from "react-native";
import { ThemedButton } from "@/components/ThemedButton";
import { ThemedScreen } from "@/components/ThemedScreen";
import Icon from "react-native-vector-icons/MaterialIcons";
import { router } from "expo-router";

const DictionaryScreen = () => {
  return (
    <ThemedScreen
      title="Dictionary"
      imageName={require("@/assets/images/splash-image.png")}
      imageStyle={{ marginTop: -400 }}
    >
      
      <ThemedButton
        title="Saved Words"
        trailingIcon={<Icon name="chevron-right" />}
        style={styles.button}
        onPress={() => {
          router.navigate("/dictionary/saved-words");
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

export default DictionaryScreen;
