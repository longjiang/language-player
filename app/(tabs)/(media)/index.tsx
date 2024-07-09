// @/app/(tabs)/(media)/index.tsx

import React, { useState, useEffect, useMemo } from "react";
import { SafeAreaView, Dimensions, View, Image, TouchableOpacity } from "react-native";
import { ThemedButton } from "@/components/ThemedButton";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { VideoHero } from "@/components/VideoHero";
import { ThemedText } from '@/components/ThemedText';
import CountryFlag from "react-native-country-flag";
import { router } from "expo-router";
import { YouTubeVideoList } from "@/components/YouTubeVideoList";
import { YouTubeVideo } from '@/types';
import { recommendVideos } from "@/src/api/python/video";
import { useLanguage } from "@/contexts/LanguageContext";
import { useUserData } from "@/contexts/UserDataContext";
import { useAuth } from "@/contexts/AuthContext";
import { useTVShows } from "@/contexts/TVShowsContext";
import { mediaHomeScreenStyles as styles } from "@/src/styles";

const MediaHomeScreen = () => {
  const { languages, l2Lang, t } = useLanguage();
  const { progress, lastSignificantChange } = useUserData();
  const { getStoredUserInfo } = useAuth();
  const { shows, isLoading: isLoadingShows } = useTVShows();
  const [items, setItems] = useState<YouTubeVideo[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (l2Lang && progress[l2Lang.code]) {
      loadItems();
    }
  }, [lastSignificantChange, l2Lang, progress]);

  const loadItems = async () => {
    setItems([]);
    setIsLoading(true);
    try {
      const userInfo = await getStoredUserInfo();
      if (!userInfo) throw new Error(t('error.user_info_not_found'));

      const userId = Number(userInfo.id);

      const langCode = l2Lang.code;

      const l2Progress = progress[langCode];
      if (!l2Progress) {
        throw new Error('Progress data not available');
      }

      const level = Number(l2Progress.level);

      const preferredCategories = [];
      const excludeIds = [];
      const madeForKids = 0;
      const limit = 50;

      const fetchedItems = await recommendVideos(
        userId,
        langCode,
        level,
        preferredCategories,
        excludeIds,
        madeForKids,
        limit
      );

      setItems(fetchedItems);
    } catch (error) {
      console.error(t('error.failed_to_load_items'), error);
    }
    setIsLoading(false);
  };

  const videoHeight = 300;
  const padding = 26;
  const videoWidth = videoHeight * 1.777777777777778;
  const screenWidth = Dimensions.get('window').width;
  const headerWidth = screenWidth - padding * 2;
  const country = l2Lang ? languages?.getCountry(l2Lang) : null;

  const randomShow = useMemo(() => {
    if (shows.length > 0) {
      const randomIndex = Math.floor(Math.random() * shows.length);
      return shows[randomIndex];
    }
    return null;
  }, [shows]);

  const headerComponent = (
    <View>
      <View
        style={{
          width: videoWidth,
          alignSelf: "center",
          height: videoHeight,
          marginTop: -50,
          marginBottom: 26
        }}
      >
        {randomShow && (
          <VideoHero
            youtubeId={randomShow.youtube_id}
            title={randomShow.title || ''}
            height={videoHeight}
          />
        )}
      </View>
      <SafeAreaView style={[styles.header, { width: headerWidth }]}>
        <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'center'}}>
          <Image
            source={require('@/assets/images/language-player-logo-64.png')}
            style={styles.logo}
          />
          <ThemedText style={{...styles.headerTitle, color: 'white', width: 100, lineHeight: 20 }} type="defaultBold">Language Player GO</ThemedText>
        </View>
        <View style={styles.iconsContainer}>
          <ThemedButton type="ghost" size="large" leadingIcon={<Icon name="magnify" />} onPress={ () => { router.navigate('/search') }} />
          <TouchableOpacity onPress={() => { router.navigate('/select-l2') }}>
            {(country && <CountryFlag isoCode={country.alpha2Code} size={16} style={{ marginLeft: 10, borderRadius: 3 }} />)}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
      <View style={styles.container}>
        <ThemedButton
          title={t('action.tv_shows')}
          size="medium"
          type="neutral"
          leadingIcon={<Icon name="youtube-tv" />}
          trailingIcon={<Icon name="chevron-right" />}
          style={{ justifyContent: "space-between", marginBottom: 20 }}
          onPress={() => {
            router.navigate('/tv-shows')
          }}
        />
      </View>
    </View>
  );

  if (isLoading || isLoadingShows) {
    return <View style={styles.loadingContainer}><ThemedText>Loading...</ThemedText></View>;
  }

  return (
    <YouTubeVideoList videos={items} header={headerComponent} style={{ marginHorizontal: 26, marginBottom: 26 }} />
  );
};

export default MediaHomeScreen;
