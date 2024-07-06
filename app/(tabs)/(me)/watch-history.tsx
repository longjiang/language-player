// @/app/watch-history.tsx
import React, { useEffect, useState } from "react";
import { ThemedScreen } from "@/components/ThemedScreen";
import { router } from "expo-router";
import { YouTubeVideoList } from "@/components/YouTubeVideoList";
import { getUserWatchHistory } from "@/src/api/python/user";
import { View, Text, ActivityIndicator } from "react-native";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";

const WatchHistoryScreen = () => {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { l2Lang, t } = useLanguage();
  const { getStoredUserInfo } = useAuth();
  
  if (!l2Lang) {
    return <View><Text>{t('error.language_not_selected')}</Text></View>;
  }

  useEffect(() => {
    const fetchVideos = async () => {
      const userInfo = await getStoredUserInfo();
      if (!userInfo) {
        router.navigate("/login");
        return;
      }
      try {
        const userId = userInfo.id;
        const langCode = l2Lang.code;
        console.log('userId', userId);
        console.log('langCode', langCode);
        const response = await getUserWatchHistory(userId, langCode);
        const uniqueVideos = response.data.reduce((acc: any[], video: { youtube_id: any; }) => {
          if (!acc.find((v) => v.youtube_id === video.youtube_id)) {
            acc.push(video);
          }
          return acc;
        }, []);
        setVideos(uniqueVideos);
        setLoading(false);
      } catch (err) {
        console.error(err);
        setError(t('error.failed_fetch_videos'));
        setLoading(false);
      }
    };

    fetchVideos();
  }, []);

  if (loading) {
    return <ActivityIndicator size="large" color="#0000ff" />;
  }

  if (error) {
    return <View><Text>{error}</Text></View>;
  }

  return (
    <ThemedScreen
      title={t('title.watch_history')}
      onBackPress={() => router.navigate('/(tabs)/(me)')}
    >
      <YouTubeVideoList videos={videos} />
    </ThemedScreen>
  );
};

export default WatchHistoryScreen;