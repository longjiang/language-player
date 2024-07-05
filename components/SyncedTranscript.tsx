// @/components/SyncedTranscript/index.tsx

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { ThemedText } from './ThemedText';
import { useVideoWithTranscriptContext } from "@/contexts/VideoWithTranscriptContext";
import { TokenizedText } from './TokenizedText';
import { useLanguage } from "@/contexts/LanguageContext";

interface SyncedTranscriptProps {
  transcriptLimitReached?: boolean;
}

export const SyncedTranscript: React.FC<SyncedTranscriptProps> = ({ transcriptLimitReached = false }) => {
  const { video, syncedLines, currentLine } = useVideoWithTranscriptContext();
  const { t } = useLanguage();
  const renderContent = () => {
    if (transcriptLimitReached) {
      return (
        <ThemedText style={styles.limitReachedText} type="subtitle" variant="secondary">
          {t('msg.pro_transcript_limit_reached')}
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
    padding: 26,
    textAlign: 'center',
  },
});

export default SyncedTranscript;
