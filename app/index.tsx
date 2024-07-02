// @/app/index.tsx
import React from 'react';
import {
  StyleSheet,
  View,
} from "react-native";
import Icon from "react-native-vector-icons/MaterialIcons";
import { ThemedButton } from "@/components/ThemedButton";
import { ThemedScreen } from "@/components/ThemedScreen";
import { ThemedText } from "@/components/ThemedText";
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext'; // Ensure this path matches where your AuthContext is defined

const Index = () => {
  const { isAuthenticated } = useAuth();  // Use the isAuthenticated state from AuthContext

  const handleStartPress = () => {
    // Navigate based on authentication status
    if (isAuthenticated) {
      router.push("/select-l2"); // Change to your actual route for "select-l2"
    } else {
      router.push("/login");
    }
  };

  return (
    <ThemedScreen
      title="Enrich your language-learning journey"
      imageName={require("../assets/images/splash-image.png")}
      imageStyle={{ marginTop: -30}}
    >
      <View>
        <ThemedText style={styles.description}>
          Discover the power of Comprehensible Input through hundreds of
          thousands of videos in over 100 languages.
        </ThemedText>
        <ThemedButton
          title="Start Learning"
          trailingIcon={<Icon name="chevron-right" />}
          onPress={handleStartPress}
        />
      </View>
    </ThemedScreen>
  );
};

const styles = StyleSheet.create({
  image: {
    width: "100%",
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "white",
    marginBottom: 10,
  },
  description: {
    fontSize: 16,
    color: "white",
    marginBottom: 20,
  },
});

export default Index;
