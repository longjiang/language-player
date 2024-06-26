import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { ThemedScreen } from "@/components/ThemedScreen";
import { ThemedButton } from "@/components/ThemedButton";
import { ThemedRadio } from "@/components/ThemedRadio";
import { ThemedInput } from "@/components/ThemedInput";
import { router } from "expo-router";

const AcquisitionSurveyScreen = () => {
  const [selectedOption, setSelectedOption] = useState("");
  const [otherText, setOtherText] = useState("");

  const options = [
    "Word of Mouth",
    "Instagram",
    "Bilibili",
    "Online Ads",
    "HSK Courses",
    "App Store",
    "Google Play",
    "Web Search",
    "YouTube",
    "Other",
  ];

  const handleSelectOption = (option: string) => {
    setSelectedOption(option);
    if (option !== "Other") setOtherText("");
  };

  return (
    <ThemedScreen
      title="How did you hear about us?"
      onBackPress={() => router.navigate("/register")}
      imageName={require("../assets/images/splash-image.png")}
      imageStyle={{ marginTop: -400 }}
    >
      <View>
        {options.map((option, index) => (
          <ThemedRadio
            key={index}
            label={option}
            isSelected={selectedOption === option}
            onPress={() => handleSelectOption(option)}
          />
        ))}
        {selectedOption === "Other" && (
          <ThemedInput
            style={styles.input}
            value={otherText}
            onChangeText={setOtherText}
            placeholder="Please specify"
          />
        )}
      </View>
      <ThemedButton
        title="Start Learning"
        onPress={() =>
          { 
            console.log("Survey results:", selectedOption, otherText)
            router.push("select-l2")
          }
        }
        style={{ marginTop: 20 }}
      />
    </ThemedScreen>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  input: {
    marginTop: 10,
  },
});

export default AcquisitionSurveyScreen;
