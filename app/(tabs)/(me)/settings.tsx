// @/app/select-l2.tsx
import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { StyleSheet } from "react-native";
import { ThemedScreen } from "@/components/ThemedScreen";
import ThemedSwitch from '@/components/ThemedSwitch';

const SettingsScreen = () => {
  const [isEnabled, setIsEnabled] = useState(false);

  const toggleSwitch = () => setIsEnabled(previousState => !previousState);

  return (
    <ThemedScreen
      title="Settings"
      imageName={require("@/assets/images/splash-image.png")}
      imageStyle={{ marginTop: -400 }}
    >
      <View style={{ flex: 1 }}>
        <ThemedSwitch isEnabled={isEnabled} toggleSwitch={toggleSwitch} />
        <ThemedSwitch isEnabled={isEnabled} toggleSwitch={toggleSwitch} />
        <ThemedSwitch isEnabled={isEnabled} toggleSwitch={toggleSwitch} />
        <ThemedSwitch isEnabled={isEnabled} toggleSwitch={toggleSwitch} />
        <ThemedSwitch isEnabled={isEnabled} toggleSwitch={toggleSwitch} />
        <ThemedSwitch isEnabled={isEnabled} toggleSwitch={toggleSwitch} />
        <Text>{isEnabled ? 'Switch is ON' : 'Switch is OFF'}</Text>
      </View>
    </ThemedScreen>
  );
};

const styles = StyleSheet.create({
  button: {
    marginTop: 20,
    marginBottom: 110,
  },
});

export default SettingsScreen;
