import React, {useState, useEffect} from 'react';
import {View, Text, StyleSheet} from 'react-native';
import Papa from 'papaparse';
import { ThemedText } from './ThemedText';
import { VideoWithTranscriptProvider, useVideoWithTranscriptContext } from "@/contexts/VideoWithTranscriptContext"

const parseSubtitles = (csvData) => {
  return Papa.parse(csvData, {
    header: true,
    dynamicTyping: true,
  }).data;
};

export const SyncedTranscript = ({video}) => {
  if (!video?.subs_l2) return

  const [currentSubtitle, setCurrentSubtitle] = useState('');
  const [subtitles, setSubtitles] = useState([]);

  const { playbackState, currentTime } = useVideoWithTranscriptContext();

  const findSubtitle = (currentTime) => {
    // Find the nearest subtitle
    let nearestSubtitle = '';
    for (let i = 0; i < subtitles.length; i++) {
      if (currentTime >= subtitles[i].starttime) {
        nearestSubtitle = subtitles[i];
        // Continue searching until finding the last subtitle that meets the condition
        if (i + 1 < subtitles.length && currentTime >= subtitles[i + 1].starttime) {
          continue;
        } else {
          break;
        }
      }
    }
    return nearestSubtitle;
  }

  useEffect(() => {
    const parsedSubtitles = parseSubtitles(video.subs_l2);
    setSubtitles(parsedSubtitles);
    setCurrentSubtitle(parsedSubtitles[0].line)
  }, [video.subs_l2]);

  // Handle currentTime changes
  useEffect(() => {
    // console.log("ST ", currentTime);
    const subtitle = findSubtitle(currentTime);
    if (subtitle) {
      setCurrentSubtitle(subtitle.line);
    } else {
      setCurrentSubtitle('');
    }
  }, [currentTime]);

  return (
      <View style={styles.container}>
        <ThemedText style={styles.subtitle} type="subtitle">{currentSubtitle}</ThemedText>
        <ThemedText style={styles.subtitle} type="default" variant="secondary" >{currentSubtitle}</ThemedText>
      </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  subtitle: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
});