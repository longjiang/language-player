// @/components/SyncedTranscript.tsx

import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { ThemedText } from './ThemedText';
import { useVideoWithTranscriptContext } from "@/contexts/VideoWithTranscriptContext"
import { TokenizedText } from './TokenizedText';
import { SyncedLine } from "@/types";

export const SyncedTranscript = () => {
  
  const { syncedLines, currentLine } = useVideoWithTranscriptContext();
  const currentLineIndex = syncedLines.findIndex(
    (line: SyncedLine) => 
      line.starttime === currentLine?.starttime &&
      line.l1Line === currentLine?.l1Line &&
      line.l2Line === currentLine?.l2Line
  );

  return (
      <View style={styles.container}>
        {currentLine?.l2Line && <TokenizedText text={currentLine?.l2Line} translation={currentLine?.l1Line} textScale={1.5} textWeight="bold" align='center' />}
        {currentLine?.l1Line && <ThemedText style={styles.subtitle} type="default" variant="secondary" >{currentLine?.l1Line}</ThemedText>}
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