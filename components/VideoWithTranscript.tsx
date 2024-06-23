import React from 'react';
import { SafeAreaView, View } from 'react-native';
import { ThemedButton } from '@/components/ThemedButton';
import { YouTubeVideo } from '@/components/YouTubeVideo';
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { router } from "expo-router";

interface VideoWithTranscriptProps {
  router: any; // Adjust the type according to your router's type
  youtubeId: string;
}

export const VideoWithTranscript: React.FC<VideoWithTranscriptProps> = ({ youtubeId }) => {
  return (
    <>
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
      <View>
        <YouTubeVideo youtubeId={youtubeId} />
      </View>
    </>
  );
};