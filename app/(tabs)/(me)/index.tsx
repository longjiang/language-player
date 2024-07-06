// @/app/(tabs)/(me)/index.tsx
import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { ThemedButton } from "@/components/ThemedButton";
import { ThemedScreen } from "@/components/ThemedScreen";
import { ThemedText } from "@/components/ThemedText";
import Icon from "react-native-vector-icons/MaterialIcons";
import { router } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { UPDATE_INTERVAL, useUserData } from "@/contexts/UserDataContext";
import LevelButton from "@/components/LevelButton";
import { useLanguage } from "@/contexts/LanguageContext";

const LanguageProgressScreen = () => {
  const { handleLogout } = useAuth();
  const { progress, getTimeFromStorage } = useUserData();
  const { l2Lang } = useLanguage();
  const [currentTime, setCurrentTime] = useState(0);

  if (!l2Lang) return null;
  const l2Progress = progress[l2Lang.code] || { level: '1', time: 0 };

  const formatTime = (milliseconds: number) => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    return `${hrs} hours ${mins} min ${secs} sec`;
  };

  useEffect(() => {
    const fetchTime = async () => {
      const time = await getTimeFromStorage();
      setCurrentTime(time);
    };
    
    const interval = setInterval(fetchTime, UPDATE_INTERVAL);
    fetchTime(); // Initial fetch

    return () => clearInterval(interval);
  }, [getTimeFromStorage]);

  const handleLogoutPress = async () => {
    await handleLogout();
    router.navigate("/");
  };

  const onSelect = (level: number) => {
    router.navigate("/select-level");
  };

  return (
    <ThemedScreen
      title="My Progress"
      showFlag={true}
    >
      <View style={{ flexDirection: "column" }}>
        <View style={{ flexDirection: "column", justifyContent: "space-between", alignItems: 'center', marginTop: 14, marginBottom: 42 }}>
          <ThemedText type="xlarge">{formatTime(l2Progress.time + currentTime)}</ThemedText>
          <ThemedText style={{ marginTop: 8}}>Spent learning Chinese in Language Player</ThemedText>
        </View>
        <LevelButton
          key={l2Progress.level}
          level={Number(l2Progress.level)}
          onPress={onSelect}
          style={{ marginBottom: 8 }}
          size="large"
          type="accent"
        />
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
          onPress={handleLogoutPress}
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
