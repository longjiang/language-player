// @/app/(tabs)/(media)/index.tsx
import React from "react";
import { SafeAreaView, Dimensions, View, Text, Image, TouchableOpacity, StyleSheet } from "react-native";
import { ThemedButton } from "@/components/ThemedButton";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { VideoHero } from "@/components/VideoHero";
import { ThemedText } from '@/components/ThemedText';
import CountryFlag from "react-native-country-flag";
import { router } from "expo-router";
import { YouTubeVideoList } from "@/components/YouTubeVideoList";
import videoData from '@/data/recommended-videos.json'; // Importing the JSON data
import { parseDuration } from '@/src/utils';
import { YouTubeVideo } from '@/types';

const normalizeVideoData = (data: any[]): YouTubeVideo[] => {
  return data.map((video) => {
    return {
      ...video,
      duration: parseDuration(video.duration),
    };
  });
}

const videos = normalizeVideoData(videoData);

const MediaHomeScreen = () => {
  const videoHeight = 300;
  const padding = 26;
  const videoWidth = videoHeight * 1.777777777777778;
  const screenWidth = Dimensions.get('window').width;
  const headerWidth = screenWidth - padding * 2;

  const headerComponent = (
    <View>
      <View
        style={{
          width: videoWidth,
          alignSelf: "center",
          height: videoHeight,
          marginTop: -50,
        }}
      >
        <VideoHero
          youtubeId="t6fPzVNIEB0"
          title="As Long As You Love Me"
          height={videoHeight}
        />
      </View>
      <SafeAreaView style={[styles.header, { width: headerWidth }]}>
        <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'center'}}>
          <Image
            source={require('@/assets/images/language-player-logo-64.png')}
            style={styles.logo}
          />
          <ThemedText style={styles.headerTitle} type="defaultBold">Language Player</ThemedText>
        </View>
        <View style={styles.iconsContainer}>
          <ThemedButton type="ghost" size="large" leadingIcon={<Icon name="magnify" />} onPress={ () => { router.navigate('/search') }} />
          <TouchableOpacity onPress={() => { router.navigate('/select-l2') }}>
            <CountryFlag isoCode="cn" size={16} style={{ marginLeft: 10, borderRadius: 3 }} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
      <View style={styles.container}>
        <ThemedButton
          title="TV Shows"
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

  return (
    <YouTubeVideoList videos={videos} header={headerComponent} style={{ marginHorizontal: 26, marginBottom: 26 }} />
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 26
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    position: 'absolute',
    top: 0,
    left: 26,
  },
  logo: {
    width: 32,
    height: 32
  },
  headerTitle: {
    marginLeft: 10,
  },
  iconsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  }
});

export default MediaHomeScreen;
