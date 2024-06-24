// @/app/select-l2.tsx
import React from "react";
import { StyleSheet, View } from "react-native";
import { ThemedButton } from "@/components/ThemedButton";
import { ThemedScreen } from "@/components/ThemedScreen";
import { ThemedText } from "@/components/ThemedText";
import Icon from "react-native-vector-icons/MaterialIcons";
import { router } from "expo-router";

const LanguageProgressScreen = () => {
  return (
    <ThemedScreen
      title="My Progress"
      showFlag={true}
    >
      <View style={{ flexDirection: "column" }}>
        <View style={{ flexDirection: "column", justifyContent: "space-between", alignItems: 'center', marginTop: 14, marginBottom: 42 }}>
          <ThemedText type="xlarge">22 hours 2 min 15 sec</ThemedText>
          <ThemedText style={{ marginTop: 8}}>Spent learning Chinese in Language Player</ThemedText>
        </View>
        <ThemedButton
          title="Saved Words"
          trailingIcon={<Icon name="chevron-right" />}
          type="accent"
          style={styles.button}
          onPress={() => {
            router.navigate("/saved-words");
          }}
        />
        <ThemedButton
          title="Watch History"
          trailingIcon={<Icon name="chevron-right" />}
          type="accent"
          style={styles.button}
          onPress={() => {
            router.navigate("/watch-history");
          }}
        />
        <ThemedButton
          title="Settings"
          trailingIcon={<Icon name="chevron-right" />}
          type="accent"
          style={styles.button}
          onPress={() => {
            router.navigate("/settings");
          }}
        />
        <ThemedButton
          title="Account"
          trailingIcon={<Icon name="chevron-right" />}
          type="accent"
          style={styles.button}
          onPress={() => {
            router.navigate("/account");
          }}
        />
        <ThemedButton
          title="Logout"
          trailingIcon={<Icon name="chevron-right" />}
          type="accent"
          style={styles.button}
          onPress={() => {
            router.navigate("/logout");
          }}
        />
      </View>
    </ThemedScreen>
  );
};

const styles = StyleSheet.create({
  button: {
    marginBottom: 8,
  },
});

export default LanguageProgressScreen;
