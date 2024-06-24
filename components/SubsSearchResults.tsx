import React from "react";
import { View, Text } from "react-native";
import { useVideoWithTranscriptContext } from "@/contexts/VideoWithTranscriptContext";
import { VideoWithTranscript } from "./VideoWithTranscript";
import { ThemedText } from "./ThemedText";
import { ThemedButton } from "./ThemedButton";
import Icon from "react-native-vector-icons/FontAwesome";

export const SubsSearchResults = ({ term }: { term: string }) => {
  const { video, syncedLines, playlist, updateStartTime, currentVideoIndex } =
    useVideoWithTranscriptContext();

  // We need to skip to the line containing the `term`
  // We watch change of `video`, then find the l2 line containing the result
  // Then set startTime

  syncedLines.find((line) => {
    if (line.l2Line.includes(term)) {
      // We need to find the index of the line in the playlist
      const foundLine = syncedLines.find((item) => item.l2Line?.includes(term));

      if (foundLine) {
        // If the term is found, proceed
        const { starttime, l1Line, l2Line } = foundLine;
        updateStartTime(starttime);
      } else {
        // Handle the case where the term is not found
        console.log(`Term "${term}" not found in synced lines.`);
      }
    }
  });

  const openModal = () => {};

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: "space-between", paddingHorizontal: 26, paddingBottom: 16 }}>
        <ThemedText>
          {currentVideoIndex + 1} of {playlist.length}
        </ThemedText>
        <ThemedButton
          type="ghost"
          size="small"
          title="List All"
          trailingIcon={<Icon name="caret-down" />}
          onPress={openModal}
          style={{ fontWeight: "regular" }}
        />
      </View>
      <VideoWithTranscript isMini={false} showHeader={false} />
    </View>
  );
};
