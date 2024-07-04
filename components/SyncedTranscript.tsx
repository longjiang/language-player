// @/components/SyncedTranscript.tsx

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { ThemedText } from './ThemedText';
import { useVideoWithTranscriptContext } from "@/contexts/VideoWithTranscriptContext"
import { TokenizedText } from './TokenizedText';
import { SyncedLine } from "@/types";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { ProFeatureModal } from './ProFeatureModal';

export const SyncedTranscript = () => {
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
    if (!isProUser() && currentLineIndex >= 10 && !hasShownModalRef.current) {
      setShowProModal(true);
      hasShownModalRef.current = true;
    }
  }, [currentLineIndex, isProUser]);

  const closeProModal = useCallback(() => {
    setShowProModal(false);
  }, []);

  const renderContent = () => {
    if (!isProUser() && currentLineIndex >= 10) {
      return <ThemedText>You've reached the limit for free users.</ThemedText>;
    }

    return (
      <>
        {currentLine?.l2Line && (
          <TokenizedText 
            text={currentLine.l2Line} 
            translation={currentLine.l1Line} 
            textScale={1.5} 
            textWeight="bold" 
            align='center' 
          />
        )}
        {currentLine?.l1Line && (
          <ThemedText 
            style={styles.subtitle} 
            type="default" 
            variant="secondary"
          >
            {currentLine.l1Line}
          </ThemedText>
        )}
      </>
    );
  };

  return (
    <View style={styles.container}>
      {renderContent()}
      <ProFeatureModal
        visible={showProModal}
        onClose={closeProModal}
        upgradeText="Upgrade to Pro to view the full transcript!"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    textAlign: 'center',
  },
  subtitle: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
});