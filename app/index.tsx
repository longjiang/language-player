// @/app/index.tsx
import {
  StyleSheet,
  View,
  Image,
} from "react-native";
import Icon from "react-native-vector-icons/MaterialIcons"; // Ensure this library is properly installed
import { ThemedButton } from "@/components/ThemedButton";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { router } from 'expo-router';


import splashImage from "../assets/images/splash-image.png";

const Index = () => {

  return (
    <ThemedView style={styles.container}>
      <Image source={splashImage} style={styles.image} />
      <View style={styles.contentContainer}>
        <ThemedText type="title" style={{ marginBottom: 20 }}>
          Enrich your language-learning journey
        </ThemedText>
        <ThemedText style={styles.description}>
          Discover the power of Comprehensible Input through hundreds of
          thousands of videos in over 100 languages.
        </ThemedText>
        <ThemedButton
          title="Start Learning"
          trailingIcon={<Icon name="chevron-right" />}
          onPress={() => router.push("login")} // Assuming 'Login' is the name of your route to login.tsx
        />
      </View>
    </ThemedView>
  );
};

const styles = StyleSheet.create({
  image: {
    width: "100%",
    marginBottom: 20,
  },
  container: {
    flex: 1,
    backgroundColor: "#000",
    paddingBottom: 20,
  },
  contentContainer: {
    flex: 1,
    justifyContent: "flex-end",
    padding: 26,
    textAlign: "left",
    width: "100%", // Ensure this container is full width
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
