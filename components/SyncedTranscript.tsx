import React, {useState, useEffect} from 'react';
import {View, Text, StyleSheet} from 'react-native';
import Papa from 'papaparse';
import { ThemedText } from './ThemedText';
import { VideoWithTranscriptProvider, useVideoWithTranscriptContext } from "@/contexts/VideoWithTranscriptContext"
import { Line, SyncedLine } from '@/types';

function syncLines(l1Lines: Line[], l2Lines: Line[]): SyncedLine[] {
  // Convert starttime to numbers and sort both arrays
  l1Lines = l1Lines.map(line => ({ ...line, starttime: parseFloat(line.starttime) })).sort((a, b) => a.starttime - b.starttime);
  l2Lines = l2Lines.map(line => ({ ...line, starttime: parseFloat(line.starttime) })).sort((a, b) => a.starttime - b.starttime);

  const syncedLines: SyncedLine[] = [];
  const usedIndexes = new Set<number>(); // To track used l2Lines

  // Find the closest l2Line for each l1Line
  l1Lines.forEach(l1Line => {
    let closestIndex = -1;
    let smallestDifference = Infinity;

    for (let i = 0; i < l2Lines.length; i++) {
      if (!usedIndexes.has(i)) {
        const timeDifference = Math.abs(l1Line.starttime - l2Lines[i].starttime);
        if (timeDifference < smallestDifference) {
          smallestDifference = timeDifference;
          closestIndex = i;
        }
      }
    }

    if (closestIndex !== -1) {
      usedIndexes.add(closestIndex);
      syncedLines.push({
        starttime: l1Line.starttime,
        l1Line: l1Line.line,
        l2Line: l2Lines[closestIndex].line
      });
    }
  });

  return syncedLines;
}

const parseSubtitles = (csvData) => {
  return Papa.parse(csvData, {
    header: true,
    dynamicTyping: true,
  }).data;
};

const findSubtitle = (currentTime, syncedLines) => {
  // Find the nearest subtitle
  let nearestSubtitle = '';
  for (let i = 0; i < syncedLines.length; i++) {
    if (currentTime >= syncedLines[i].starttime) {
      nearestSubtitle = syncedLines[i];
      // Continue searching until finding the last subtitle that meets the condition
      if (i + 1 < syncedLines.length && currentTime >= syncedLines[i + 1].starttime) {
        continue;
      } else {
        break;
      }
    }
  }
  return nearestSubtitle;
}

export const SyncedTranscript = ({video}) => {
  
  const [currentLine, setCurrentLine] = useState(null);
  const [syncedLines, setSyncedLines] = useState([]);

  const { playbackState, currentTime } = useVideoWithTranscriptContext();

  // Handle currentTime changes
  useEffect(() => {
    // console.log("ST ", currentTime);
    const subtitle = findSubtitle(currentTime, syncedLines);

    if (subtitle) {
      setCurrentLine(subtitle);
    } else {
      setCurrentLine(null);
    }
  }, [currentTime]);

  useEffect(() => {
    if (!video?.subs_l2) return;
    const l1Lines = parseSubtitles(video.subs_l1);
    const l2Lines = parseSubtitles(video.subs_l2);
    const syncedLines = syncLines(l1Lines, l2Lines);
    setSyncedLines(syncedLines);
  }, [video]);


  return (
      <View style={styles.container}>
        <ThemedText style={styles.subtitle} type="subtitle">{currentLine?.l2Line}</ThemedText>
        <ThemedText style={styles.subtitle} type="default" variant="secondary" >{currentLine?.l1Line}</ThemedText>
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