import React, {useState, useEffect} from 'react';
import {View, Text, StyleSheet} from 'react-native';
import Papa from 'papaparse';
import { ThemedText } from './ThemedText';
import { VideoWithTranscriptProvider, useVideoWithTranscriptContext } from "@/contexts/VideoWithTranscriptContext"
import { Line, SyncedLine } from '@/types';
import { TokenizedText } from './TokenizedText';

export const SyncedTranscript = ({video}) => {
  
  const { playbackState, currentTime, syncedLines, currentLine } = useVideoWithTranscriptContext();

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