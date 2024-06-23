import React, {useState, useEffect} from 'react';
import {View, Text, StyleSheet} from 'react-native';
import Papa from 'papaparse';
import { ThemedText } from './ThemedText';
import { VideoWithTranscriptProvider, useVideoWithTranscriptContext } from "@/contexts/VideoWithTranscriptContext"
import { Line, SyncedLine } from '@/types';

export const SyncedTranscript = ({video}) => {
  
  const { playbackState, currentTime, syncedLines, currentLine } = useVideoWithTranscriptContext();

  return (
      <View style={styles.container}>
        <ThemedText style={styles.subtitle} type="title">{currentLine?.l2Line}</ThemedText>
        <ThemedText style={styles.subtitle} type="default" variant="secondary" >{currentLine?.l1Line}</ThemedText>
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