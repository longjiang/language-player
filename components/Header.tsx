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

interface HeaderProps {
  minimizePlayer: () => void;
  openQueueSheet: () => void;
  refRBSheet: React.RefObject<typeof ThemedRBSheet>;
}

export const Header: React.FC<HeaderProps> = ({ minimizePlayer }) => {
  const { tvShow, searchTerm, queue, queueType, currentVideo } = useVideoPlayer();
  const refRBSheet = useRef<ThemedRBSheet>(null);
  const secondaryBrandColor = useThemeColor({}, 'secondaryBrand');
  const openQueueSheet = useCallback(() => {
    refRBSheet.current?.open();
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
              minimizePlayer();
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
                <ThemedText style={{ marginLeft: 8, color: secondaryBrandColor }} type="defaultBold">TV Show</ThemedText>
              </View>
              <ThemedText type="subtitle" style={{ marginBottom: 26 }}>{tvShow.title}</ThemedText>'
            </>
          )}
          {queueType === "recommended" && (
            <>
              <View style={{ flexDirection: 'row', marginBottom: 8 }}>
                <Ionicon name="sparkles" size={20} color={secondaryBrandColor} />
                <ThemedText style={{ marginLeft: 8, color: secondaryBrandColor }} type="defaultBold">Recommended</ThemedText>
              </View>
              <ThemedText type="subtitle" style={{ marginBottom: 26 }}>Content Tailored to You</ThemedText>
            </>
          )}
          {queueType === "search" && searchTerm && (
            <>
              <View style={{ flexDirection: 'row', marginBottom: 8 }}>
                <Ionicon name="search" size={20} color={secondaryBrandColor} />
                <ThemedText style={{ marginLeft: 8, color: secondaryBrandColor }} type="defaultBold">Search Results</ThemedText>
              </View>
              <ThemedText type="subtitle" style={{ marginBottom: 26 }}>Videos matching "{searchTerm}"</ThemedText>
            </>
          )}

          <YouTubeVideoList
            videos={queue}
            variant="horizontal"
            currentVideoId={currentVideo ? currentVideo.youtube_id : undefined}
            showDetails={false}
          />
        </ScrollView>
      </ThemedRBSheet>
    </SafeAreaView>
  );
};