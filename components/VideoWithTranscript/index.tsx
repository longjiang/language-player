// @/components/VideoWithTranscript/index.tsx

import React, { useState, useEffect, useRef, useCallback } from "react";
import { View } from "react-native";
import { VideoWithTranscriptFull } from "./full";
import { VideoWithTranscriptMini } from "./mini";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { ProFeatureModal } from '../ProFeatureModal';
import { SyncedTranscript } from '../SyncedTranscript';  // Ensure the correct import here
import { useVideoWithTranscriptContext } from "@/contexts/VideoWithTranscriptContext"
import { ThemedText } from '../ThemedText';
import { SyncedLine } from "@/types";

interface VideoWithTranscriptProps {
  isMini: boolean;
  showHeader?: boolean;
  isProCheckEnabled?: boolean;
}

export const VideoWithTranscript: React.FC<VideoWithTranscriptProps> = ({ 
  isMini, 
  showHeader = false,
  isProCheckEnabled = true
}) => {
  const { syncedLines, currentLine } = useVideoWithTranscriptContext();
  const { isProUser } = useSubscription();
  const [showProModal, setShowProModal] = useState(false);
  const hasShownModalRef = useRef(false);

  const currentLineIndex = syncedLines.findIndex(
    (line: SyncedLine) => 
      line.starttime === currentLine?.starttime &&
      line.l1Line === currentLine?.l1Line &&
      line.l2Line === currentLine?.l2Line
  );

  useEffect(() => {
    if (isProCheckEnabled && !isProUser() && currentLineIndex > 2 && !hasShownModalRef.current) {
      setShowProModal(true);
      hasShownModalRef.current = true;
    }
  }, [currentLineIndex, isProCheckEnabled, isProUser]);

  const closeProModal = useCallback(() => {
    setShowProModal(false);
  }, []);

  const renderTranscriptContent = () => {
    if (isProCheckEnabled && !isProUser() && currentLineIndex > 2) {
      return <ThemedText>You've reached the limit for free users.</ThemedText>;
    }

    return <SyncedTranscript />;
  };

  return (
    <View>
      {!isMini ? (
        <VideoWithTranscriptFull showHeader={showHeader} />
      ) : (
        <VideoWithTranscriptMini />
      )}
      {renderTranscriptContent()}
      <ProFeatureModal
        visible={showProModal}
        onClose={closeProModal}
        upgradeText="Upgrade to Pro to view the full transcript!"
      />
    </View>
  );
};
