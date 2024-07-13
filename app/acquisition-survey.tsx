// @/app/acquisition-survey.tsx

import React, { useState, useEffect } from "react";
import { StyleSheet, View, Alert } from "react-native";
import { ThemedScreen } from "@/components/ThemedScreen";
import { ThemedButton } from "@/components/ThemedButton";
import { ThemedRadio } from "@/components/ThemedRadio";
import { ThemedInput } from "@/components/ThemedInput";
import { router } from "expo-router";
import { submitAcquisitionSurvey } from "@/src/api/python/acquisition-survey";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";

const AcquisitionSurveyScreen = () => {
  const { t } = useLanguage();
  const [selectedOption, setSelectedOption] = useState<any>(null);
  const [otherText, setOtherText] = useState("");
  const [userId, setUserId] = useState(null);
  const { getStoredUserInfo } = useAuth();

  useEffect(() => {
    const fetchUserInfo = async () => {
      try {
        const userInfo = await getStoredUserInfo();
        if (userInfo) {
          setUserId(userInfo.id);
        } else {
          throw new Error(t('error.user_info_not_found'));
        }
      } catch (error: any) {
        Alert.alert(t('error.generic'), error.message);
      }
    };

    fetchUserInfo();
  }, []);

  const options = [
    { value: 'word_of_mouth', text: t('option.word_of_mouth') },
    { value: 'instagram', text: t('option.instagram') },
    { value: 'bilibili', text: t('option.bilibili') },
    { value: 'google_ads', text: t('option.google_ads') },
    { value: 'hsk_courses', text: t('option.hsk_courses') },
    { value: 'app_store', text: t('option.app_store') },
    { value: 'google_play', text: t('option.google_play') },
    { value: 'google_search', text: t('option.google_search') },
    { value: 'youtube', text: t('option.youtube') },
    { value: 'other', text: t('option.other') },
  ];

  const handleSelectOption = (option: any) => {
    setSelectedOption(option);
    if (option.value !== "other") setOtherText("");
  };

  const handleSubmit = async () => {
    if (!selectedOption || !userId) return;
    try {
      const acquisitionDetails = selectedOption?.value === 'other' ? otherText : null;
      await submitAcquisitionSurvey(userId, selectedOption.value, acquisitionDetails);
      router.push("select-l2");
    } catch (error: any) {
      Alert.alert(t('error.generic'), error.message);
    }
  };

  return (
    <ThemedScreen
      title={t('title.how_did_you_hear')}
      onBackPress={() => router.navigate("/register")}
      imageHeight={150}
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
        {selectedOption?.value === "other" && (
          <ThemedInput
            style={styles.input}
            value={otherText}
            onChangeText={setOtherText}
            placeholder={t('placeholder.please_specify')}
          />
        )}
      </View>
      <ThemedButton
        title={t('action.start_learning')}
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