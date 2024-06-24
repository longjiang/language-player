// @/app/index.tsx
import {
  StyleSheet,
  View,
  Image,
} from "react-native";
import Icon from "react-native-vector-icons/MaterialIcons";
import { ThemedButton } from "@/components/ThemedButton";
import { ThemedScreen } from "@/components/ThemedScreen";
import { ThemedText } from "@/components/ThemedText";
import { router } from 'expo-router';

const Index = () => {  // 中国

  return (
    <ThemedScreen
      title="Enrich your language-learning journey"
      imageName={require("../assets/images/splash-image.png")}
      imageStyle={{ marginTop: -30}}
    >
      <View style={styles.contentContainer}>
        <ThemedText style={styles.description}>
          Discover the power of Comprehensible Input through hundreds of
          thousands of videos in over 100 languages.
        </ThemedText>
        <ThemedButton
          title="Start Learning"
          trailingIcon={<Icon name="chevron-right" />}
          onPress={() => router.push("/settings")} // 中国
          
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
  container: {
    flex: 1,
    backgroundColor: "#000",
    paddingBottom: 20,
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
