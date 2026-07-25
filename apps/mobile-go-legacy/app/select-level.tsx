// @/app/select-level.tsx

import React, { useRef } from "react";
import { useT } from '@/hooks/use-t';
import { StyleSheet, View } from "react-native";
import { ThemedScreen } from "@/components/ThemedScreen";
import { router } from "expo-router";
import { useLanguage } from "@/contexts/LanguageContext";
import { ThemedText } from "@/components/ThemedText";
import LevelButton from "@/components/LevelButton";
import { useUserData } from "@/contexts/UserDataContext";
import LevelResetSheet from "@/components/LevelResetSheet";
import RBSheet from "react-native-raw-bottom-sheet";

const SelectLevelScreen = () => {
  const t = useT();
  const { l2Lang } = useLanguage();
  const { userData, updateProgress } = useUserData();
  const refRBSheet = useRef<RBSheet>(null);
  const selectedLevelRef = useRef<number | null>(null);

  if (!l2Lang) return null;

  const levels = [1, 2, 3, 4, 5, 6, 7];

  const onSelect = async (level: number) => {
    selectedLevelRef.current = level;
    const currentProgress = userData?.progress?.[l2Lang.code];
    const hasProgress = currentProgress?.time && currentProgress.time > 0;
    
    if (hasProgress) {
      refRBSheet.current?.open();
    } else {
      await handleConfirm(false);
    }
  };

  const handleConfirm = async (resetTime: boolean) => {
    if (selectedLevelRef.current !== null) {
      try {
        const currentProgress = userData?.progress?.[l2Lang.code];
        const newTime = resetTime ? 0 : currentProgress?.time || 0;
        await updateProgress(l2Lang.code, { level: String(selectedLevelRef.current), time: newTime });
        router.navigate("/(tabs)/(media)");
      } catch (error) {
        console.error(t('error.updating_progress'), error);
      }
    }
    refRBSheet.current?.close();
  };

  return (
    <ThemedScreen
      title={t('title.current_level', { language: t('lang.' + l2Lang.code) })}
      onBackPress={() => router.navigate("/select-l1")}
    >
      <View>
        {levels.map(level => (
          <LevelButton
            key={level}
            level={level}
            onPress={() => onSelect(level)}
            style={styles.item}
            size="large"
          />
        ))}
      </View>
      <ThemedText style={{ marginTop: 20, textAlign: "center" }}>
        {t('msg.hsk_explanation')}
      </ThemedText>
      <LevelResetSheet ref={refRBSheet} onConfirm={handleConfirm} />
    </ThemedScreen>
  );
};

const styles = StyleSheet.create({
  item: {
    paddingVertical: 4,
    paddingHorizontal: 16,
    borderRadius: 10,
  }
});

export default SelectLevelScreen;