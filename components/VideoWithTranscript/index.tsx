// @/components/VideoWithTranscript/index.tsx

import React from "react";
import { View } from "react-native";
import { VideoWithTranscriptFull } from "./full";
import { VideoWithTranscriptMini } from "./mini";

interface VideoWithTranscriptProps {
  isMini: boolean;
  showHeader?: boolean;
}

export const VideoWithTranscript: React.FC<VideoWithTranscriptProps> = ({ isMini, showHeader = false }) => {
  return (
    <View>
      {!isMini ? (
        <VideoWithTranscriptFull showHeader={showHeader} />
      ) : (
        <VideoWithTranscriptMini />
      )}
    </View>
  );
};
