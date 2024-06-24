import React from 'react';
import { View, Text } from 'react-native';
import { useVideoWithTranscriptContext } from "@/contexts/VideoWithTranscriptContext";
import { VideoWithTranscript } from './VideoWithTranscript';

export const SubsSearchResults = ({term}: {term: string}) => {
  const { video, syncedLines,  playlist, updateStartTime } = useVideoWithTranscriptContext()
  
  // We need to skip to the line containing the `term`
  // We watch change of `video`, then find the l2 line containing the result
  // Then set startTime

  syncedLines.find((line) => {
    if (line.l2Line.includes(term)) {
      // We need to find the index of the line in the playlist
      const foundLine = syncedLines.find((item) => item.l2Line?.includes(term));

      if (foundLine) {
        // If the term is found, proceed with your logic
        const { starttime, l1Line, l2Line } = foundLine;
        updateStartTime(starttime);
      } else {
        // Handle the case where the term is not found
        console.log(`Term "${term}" not found in synced lines.`);
        // You can also set a default state or perform other actions here
      }
    }
  })

  return (
    <VideoWithTranscript isMini={false} showHeader={false} />
  );
};