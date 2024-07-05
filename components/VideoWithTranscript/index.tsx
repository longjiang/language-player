// @/components/VideoWithTranscript/index.tsx

import React, { useState, useEffect, useRef, useCallback } from "react";
import { View } from "react-native";
import { VideoWithTranscriptFull } from "./full";
import { VideoWithTranscriptMini } from "./mini";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { ProFeatureModal } from '../ProFeatureModal';
import { useVideoWithTranscriptContext } from "@/contexts/VideoWithTranscriptContext"
import { SyncedLine } from "@/types";
import { useLanguage } from "@/contexts/LanguageContext";

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
  const { t } = useLanguage();
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

  return (
    <View>
      {!isMini ? (
        <VideoWithTranscriptFull showHeader={showHeader} transcriptLimitReached={isProCheckEnabled && !isProUser() && currentLineIndex > 2} />
      ) : (
        <VideoWithTranscriptMini />
      )}
      <ProFeatureModal
        visible={showProModal}
        onClose={closeProModal}
        upgradeText={t('msg.pro_transcript')}
      />
    </View>
  );
};
