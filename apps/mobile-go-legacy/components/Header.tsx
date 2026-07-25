// @/components/Header.tsx

import React, { useCallback, useRef } from 'react';
import { SafeAreaView, View, ScrollView } from 'react-native';
import { router } from 'expo-router';
import Ionicon from 'react-native-vector-icons/Ionicons';
import { ThemedButton } from './ThemedButton';
import { videoWithTranscriptStyles as styles } from '@/src/styles';
import { ThemedRBSheet } from './ThemedRBSheet';
import { ThemedText } from './ThemedText';
import { YouTubeVideoList } from './YouTubeVideoList';
import { useVideoPlayer } from '@/contexts/VideoPlayerContext';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useLanguage } from '@/contexts/LanguageContext';
import { useT } from '@/hooks/use-t';

interface HeaderProps {
  minimizePlayer: () => void;
}

export const Header: React.FC<HeaderProps> = ({ minimizePlayer }) => {
  const { tvShow, searchTerm, queue, queueType, currentVideo } = useVideoPlayer();
  const refRBSheet = useRef<ThemedRBSheet>(null);
  const secondaryBrandColor = useThemeColor({}, 'secondaryBrand');
  const t = useT();

  const openQueueSheet = useCallback(() => {
    refRBSheet.current?.open();
  }, []);

  const closeQueueSheet = useCallback(() => {
    refRBSheet.current?.close();
  }, []);

  const handleVideoPress = useCallback(() => {
    closeQueueSheet();
    // Any other actions you want to perform when a video is selected
  }, []);

  return (
    <SafeAreaView>
      <View style={styles.header}>
        <View>
          <ThemedButton
            type="ghost"
            style={styles.headerButton}
            trailingIcon={<Ionicon name="chevron-down" />}
            onPress={minimizePlayer}
          />
        </View>
        <View style={{ flexDirection: "row" }}>
          <ThemedButton
            type="ghost"
            style={styles.headerButton}
            trailingIcon={<Ionicon name="list" />}
            onPress={openQueueSheet}
          />
          <ThemedButton
            type="ghost"
            style={styles.headerButton}
            trailingIcon={<Ionicon name="cog" />}
            onPress={() => {
              router.navigate("/settings");
            }}
          />
        </View>
      </View>

      <ThemedRBSheet ref={refRBSheet} height={600}>
        <ScrollView>
          {queueType === "tvShow" && tvShow && (
            <>
              <View style={{ flexDirection: 'row', marginBottom: 8 }}>
                <Ionicon name="tv-outline" size={20} color={secondaryBrandColor} />
                <ThemedText style={{ marginLeft: 8, color: secondaryBrandColor }} type="defaultBold">{t('title.tv_show')}</ThemedText>
              </View>
              <ThemedText type="subtitle" style={{ marginBottom: 26 }}>{tvShow.title}</ThemedText>
            </>
          )}
          {queueType === "recommended" && (
            <>
              <View style={{ flexDirection: 'row', marginBottom: 8 }}>
                <Ionicon name="sparkles" size={20} color={secondaryBrandColor} />
                <ThemedText style={{ marginLeft: 8, color: secondaryBrandColor }} type="defaultBold">{t('title.recommended')}</ThemedText>
              </View>
              <ThemedText type="subtitle" style={{ marginBottom: 26 }}>{t('msg.content_tailored')}</ThemedText>
            </>
          )}
          {queueType === "search" && searchTerm && (
            <>
              <View style={{ flexDirection: 'row', marginBottom: 8 }}>
                <Ionicon name="search" size={20} color={secondaryBrandColor} />
                <ThemedText style={{ marginLeft: 8, color: secondaryBrandColor }} type="defaultBold">{t('title.search_results')}</ThemedText>
              </View>
              <ThemedText type="subtitle" style={{ marginBottom: 26 }}>{t('msg.videos_matching', { searchTerm })}</ThemedText>
            </>
          )}

          <YouTubeVideoList
            videos={queue}
            variant="horizontal"
            currentVideoId={currentVideo ? currentVideo.youtube_id : undefined}
            showDetails={false}
            queueType={queueType}
            tvShow={tvShow}
            searchTerm={searchTerm}
            onVideoPress={handleVideoPress}
          />
        </ScrollView>
      </ThemedRBSheet>
    </SafeAreaView>
  );
};