// @/app/search.tsx
import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { ThemedButton, ThemedScreen, ThemedInput, ThemedText, YouTubeVideoCard } from "@/components";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { router } from "expo-router";
import { getCollectionItems } from "@/src/api/directus";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";
import { ActivityIndicator } from 'react-native';
import { useThemeColor } from "@/hooks";
import { YouTubeVideo } from "@/types/videoTypes";
import { normalizeVideoData } from "@/src/api/directus/youtube-video";
import { useLanguage } from "@/contexts/LanguageContext";
import { useVideoPlayer } from "@/contexts/VideoPlayerContext";
// New import for YouTubeVideoList
import { YouTubeVideoList } from "@/components/YouTubeVideoList";

const SearchScreen = () => {
  const [items, setItems] = useState<YouTubeVideo[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const primaryBrandColor = useThemeColor({}, "primaryBrand");
  const { t, l2Lang } = useLanguage();
  const { setVideoPlayerState } = useVideoPlayer();
  if (!l2Lang) return null;

  useEffect(() => {
    if (searchQuery) {
      loadItems();
    }
  }, [searchQuery]);

  const handleInputChange = (text: string) => {
    setSearchQuery(text);
    const youtubeId = extractYouTubeID(text);
    if (youtubeId) {
      setVideoPlayerState(state => ({
        ...state,
        isMini: false,
        video: { youtube_id: youtubeId },
      }));
    }
  };

  const extractYouTubeID = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const handleSearch = () => {
    loadItems();
  };

  const loadItems = async () => {
    setItems([]);
    setIsLoading(true);
    try {
      const data = await getCollectionItems("youtube_videos_4", {
        filter: { title: { contains: searchQuery } },
        fields: 'id,l2,title,youtube_id,tv_show,talk,date,lex_div,word_freq,difficulty,views,tags,category,locale,duration,made_for_kids,views,likes,comments,type'
      });
      if (data) setItems(data.map(item => normalizeVideoData(item)));
    } catch (error) {
      console.error("Failed to load items:", error);
    }
    setIsLoading(false);
  };

  const l2Name = t('lang.' + l2Lang.code);

  // New header component for YouTubeVideoList
  const ListHeader = () => (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        <ThemedButton
          type="ghost"
          size="medium"
          trailingIcon={<Icon name="chevron-left" />}
          onPress={() => router.navigate("/(tabs)/(media)")}
        />
        <ThemedInput
          placeholder={t('placeholder.search_all_content', { language: l2Name })}
          style={{ flex: 1, marginRight: 8 }}
          size="small"
          icon="magnify"
          onChangeText={handleInputChange}
          onSubmitEditing={handleSearch}
          value={searchQuery}
        />
        <ThemedButton
          type="ghost"
          size="medium"
          trailingIcon={<Icon name="dots-horizontal-circle" />}
          onPress={() => router.navigate("/(tabs)/(media)")}
        />
      </View>
    </View>
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {items.length === 0 && (
        <ThemedScreen
          title={t('title.search')}
          onBackPress={() => router.back()}
          showFlag={true}
        >
          <ThemedInput
            placeholder={t('placeholder.search_all_content', { language: l2Name })}
            style={{ marginBottom: 20 }}
            icon="magnify"
            onChangeText={handleInputChange}
            onSubmitEditing={handleSearch}
            value={searchQuery}
          />
          <ThemedText type="default" variant="secondary">
            {t('msg.paste_youtube_url')}
          </ThemedText>
          {isLoading && (
            <View style={styles.spinnerContainer}>
              <ActivityIndicator size="large" color="#a772d0" />
            </View>
          )}
        </ThemedScreen>
      )}
      {items.length > 0 && (
        <SafeAreaView style={styles.resultsContainer}>
          {/* Replace FlatList with YouTubeVideoList */}
          <YouTubeVideoList
            videos={items}
            header={<ListHeader />}
            style={{ padding: 12 }}
          />
          {isLoading && (
            <View style={styles.spinnerContainer}>
              <ActivityIndicator size="large" color={primaryBrandColor} />
            </View>
          )}
        </SafeAreaView>
      )}
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  resultsContainer: {
    flex: 1,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    marginBottom: 20,
    marginLeft: -15,
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 26,
  },
  spinnerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 100,
  },
});

export default SearchScreen;