import React from "react";
import { View } from "react-native";
import { VideoWithTranscriptFull } from "./full";
import { VideoWithTranscriptMini } from "./mini";
import { ProModal } from "@/components/ProModal"; // Import the new ProModal component

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
      <ProModal />
    </View>
  );
};
