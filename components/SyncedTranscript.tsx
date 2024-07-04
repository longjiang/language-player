// @/components/SyncedTranscript/index.tsx

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { ThemedText } from './ThemedText';
import { useVideoWithTranscriptContext } from "@/contexts/VideoWithTranscriptContext";
import { TokenizedText } from './TokenizedText';

interface SyncedTranscriptProps {
  transcriptLimitReached?: boolean;
}

export const SyncedTranscript: React.FC<SyncedTranscriptProps> = ({ transcriptLimitReached = false }) => {
  const { video, syncedLines, currentLine } = useVideoWithTranscriptContext();
  if (syncedLines?.[1]) console.log('tsakjs', 'syncedLines[1].l2Line=', syncedLines[1].l2Line, 'video=', video);
  const renderContent = () => {
    if (transcriptLimitReached) {
      return (
        <ThemedText style={styles.limitReachedText} type="default">
          Transcript limit reached. Please upgrade to Pro to access more transcripts.
        </ThemedText>
      );
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
  limitReachedText: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    textAlign: 'center',
    color: '#FF0000', // Example color for emphasis, adjust as needed
  },
});

export default SyncedTranscript;
