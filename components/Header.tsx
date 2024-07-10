// @/components/Header.tsx

import React, { useCallback, useRef } from 'react';
import { SafeAreaView, View } from 'react-native';
import { router } from 'expo-router';
import Ionicon from 'react-native-vector-icons/Ionicons';
import { ThemedButton } from './ThemedButton';
import { videoWithTranscriptStyles as styles } from '@/src/styles';
import { ThemedRBSheet } from './ThemedRBSheet';
import { ThemedText } from './ThemedText';
import { YouTubeVideoList } from './YouTubeVideoList';
import { useVideoPlayer } from '@/contexts/VideoPlayerContext';

interface HeaderProps {
  minimizePlayer: () => void;
  openQueueSheet: () => void;
  refRBSheet: React.RefObject<typeof ThemedRBSheet>;
}

export const Header: React.FC<HeaderProps> = ({ minimizePlayer }) => {
  const { tvShow, queue, currentVideo } = useVideoPlayer();
  const refRBSheet = useRef<ThemedRBSheet>(null);
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
        <View style={{ flexDirection: 'row' }}>
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
              router.navigate('/settings');
            }}
          />
        </View>
      </View>

      <ThemedRBSheet ref={refRBSheet}>
        <View>
          { tvShow && <ThemedText type="subtitle">{tvShow.title}</ThemedText>}
          
          <YouTubeVideoList videos={queue} variant="horizontal" currentVideoId={ currentVideo ? currentVideo.youtube_id : undefined } showDetails={false}/>
        </View>
      </ThemedRBSheet>
    </SafeAreaView>
  );
};