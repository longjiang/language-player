import React from 'react';
import { SafeAreaView, View } from 'react-native';
import { ThemedButton } from './ThemedButton';
import { YouTubeVideo } from './YouTubeVideo';
import { VideoControlBar } from './VideoControlBar';
import { SyncedTranscript } from './SyncedTranscript';
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { router } from "expo-router";
import { Dimensions } from 'react-native';
import { VideoWithTranscriptProvider } from '@/contexts/VideoWithTranscriptContext';

interface YouTubeVideo {
  youtube_id: string; // The ID of the video on YouTube
  id?: string; // The ID in our own database
  title?: string;
  subs_l2?: string; // The transcript of the video in the second language in CSV format
}

interface VideoWithTranscriptProps {
  router: any; // Adjust the type according to your router's type
  video: YouTubeVideo;
}

export const VideoWithTranscript: React.FC<VideoWithTranscriptProps> = ({ video }) => {
  if (!video) return null;

  const screenWidth = Dimensions.get('window').width;
  const videoHeight = screenWidth * 0.5625; // 16:9 aspect ratio

  return (
    

    <VideoWithTranscriptProvider>
    
      <SafeAreaView
        style={{ flexDirection: "row", justifyContent: "space-between" }}
      >
        <View>
          <ThemedButton
            type="ghost"
            trailingIcon={<Icon name="chevron-down" />}
            onPress={() => router.push("../")}
          />
        </View>
        <View style={{ flexDirection: "row" }}>
          <ThemedButton
            type="ghost"
            trailingIcon={<Icon name="text-long" />}
            onPress={() => router.push("/(tabs)/(media)/youtube-video")}
          />
          <ThemedButton
            type="ghost"
            trailingIcon={<Icon name="cog-outline" />}
            onPress={() => router.push("/(tabs)/(media)/youtube-video")}
          />
        </View>
      </SafeAreaView>
      <View style={{ marginBottom: 26 }}>
        <YouTubeVideo youtubeId={video.youtube_id} height={videoHeight} controls={false} />
        <VideoControlBar />
      </View>
      <SyncedTranscript video={video} />
    </VideoWithTranscriptProvider>
  );
};