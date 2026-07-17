// @/app/search.tsx
// @/app/search.tsx
import React, { useState, useCallback, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { ThemedButton, ThemedScreen, ThemedInput, ThemedText } from "@/components";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ActivityIndicator } from 'react-native';
import { useThemeColor } from "@/hooks";
import { YouTubeVideo } from "@/types/videoTypes";
import { getVideosByL2Code } from "@/src/api/directus/youtube-video";
import { useLanguage } from "@/contexts/LanguageContext";
import { useVideoPlayer } from "@/contexts/VideoPlayerContext";
import { YouTubeVideoList } from "@/components/YouTubeVideoList";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const SearchScreen = () => {
  const [items, setItems] = useState<YouTubeVideo[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const primaryBrandColor = useThemeColor({}, "primaryBrand");
  const { t, l2Lang } = useLanguage();
  const { setVideoAndQueue } = useVideoPlayer();
  const insets = useSafeAreaInsets();

  if (!l2Lang) return null;

  const extractYouTubeID = useCallback((url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  }, []);

  const handleInputChange = useCallback((text: string) => {
    setSearchQuery(text);
    const youtubeId = extractYouTubeID(text);
    if (youtubeId) {
      setVideoAndQueue({ youtube_id: youtubeId }, []);
    }
  }, [setVideoAndQueue, extractYouTubeID]);

  const loadItems = useCallback(async () => {
    setItems([]);
    setIsLoading(true);
    try {
      const data = await getVideosByL2Code(l2Lang, false, {
        filter: { title: { contains: searchQuery } },
      });
      if (data) setItems(data);
    } catch (error) {
      console.error("Failed to load items:", error);
    }
    setIsLoading(false);
  }, [l2Lang, searchQuery]);

  const handleSearch = useCallback(() => {
    if (searchQuery) {
      loadItems();
    }
  }, [searchQuery, loadItems]);

  const l2Name = useMemo(() => t('lang.' + l2Lang.code), [t, l2Lang]);

  const ListHeader = useMemo(() => {
    return () => (
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
            style={{ flex: 1 }}
            size="small"
            icon="magnify"
            onChangeText={handleInputChange}
            onSubmitEditing={handleSearch}
            value={searchQuery}
          />
        </View>
      </View>
    );
  }, []);

  return (
    <View style={{ flex: 1 }}>
      {items.length === 0 && (
        <ThemedScreen
          title={t('title.search')}
          onBackPress={() => router.back()}
          showFlag={true}
        >
          <View style={styles.searchContainer}>
            <ThemedInput
              placeholder={t('placeholder.search_all_content', { language: l2Name })}
              style={{ flex: 1 }}
              icon="magnify"
              onChangeText={handleInputChange}
              onSubmitEditing={handleSearch}
              value={searchQuery}
            />
          </View>
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
        <View style={{ flex: 1, marginTop: insets.top }}>
          <YouTubeVideoList
            videos={items}
            header={<ListHeader />}
            style={{ paddingHorizontal: 26 }}
            queueType="search"
            searchTerm={searchQuery}
          />
          {isLoading && (
            <View style={styles.spinnerContainer}>
              <ActivityIndicator size="large" color={primaryBrandColor} />
            </View>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
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
  },
  spinnerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 100,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
});

export default SearchScreen;