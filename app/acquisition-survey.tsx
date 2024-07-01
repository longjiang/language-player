// @/app/acquisition-survey.tsx

import React, { useState, useEffect } from "react";
import { StyleSheet, View, Alert } from "react-native";
import { ThemedScreen } from "@/components/ThemedScreen";
import { ThemedButton } from "@/components/ThemedButton";
import { ThemedRadio } from "@/components/ThemedRadio";
import { ThemedInput } from "@/components/ThemedInput";
import { router, useLocalSearchParams } from "expo-router";
import { submitAcquisitionSurvey } from "@/src/api/python/acquisition-survey";
import { getStoredUserInfo } from "@/src/api/directus/user";

const AcquisitionSurveyScreen = () => {
  const [selectedOption, setSelectedOption] = useState<any>(null);
  const [otherText, setOtherText] = useState("");
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    const fetchUserInfo = async () => {
      try {
        const userInfo = await getStoredUserInfo();
        if (userInfo) {
          setUserId(userInfo.id);
        } else {
          throw new Error("User information not found");
        }
      } catch (error: any) {
        Alert.alert("Error", error.message);
      }
    };

    fetchUserInfo();
  }, []);

  const options = [
    { value: 'word_of_mouth', text: 'Word of Mouth' },
    { value: 'instagram', text: 'Instagram' },
    { value: 'bilibili', text: 'Bilibili' },
    { value: 'google_ads', text: 'Online Ads' },
    { value: 'hsk_courses', text: 'HSK Courses' },
    { value: 'app_store', text: 'App Store' },
    { value: 'google_play', text: 'Google Play' },
    { value: 'google_search', text: 'Web Search' },
    { value: 'youtube', text: 'YouTube' },
    { value: 'other', text: 'Other (Please specify)' },
  ];

  const handleSelectOption = (option: any) => {
    setSelectedOption(option);
    if (option.value !== "other") setOtherText("");
  };

  const handleSubmit = async () => {
    if (!selectedOption) return;
    try {
      const acquisitionDetails = selectedOption?.value === 'other' ? otherText : null;
      await submitAcquisitionSurvey(userId, selectedOption.value, acquisitionDetails);
      router.push("select-l2");
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
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
            label={option.text}
            isSelected={selectedOption?.value === option.value}
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
        onPress={handleSubmit}
        style={{ marginTop: 20 }}
        disabled={!selectedOption}
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
