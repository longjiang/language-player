import React from "react";
import { StyleSheet, TouchableOpacity, View, Text } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { ThemedInput } from "./ThemedInput";
import { FlatList, GestureHandlerRootView } from "react-native-gesture-handler";
import { Image } from "react-native";
import { parseSubtitles } from "@/src/subs";

export const SubsSearchResultsList = ({ results }) => {
  const handleSubtitlePress = (item) => {
    // Handle press
  }


  const findLine = (line) => {
    if (line.l2Line.includes(term)) {
      // We need to find the index of the line in the playlist
      const foundLine = syncedLines.find((item) => item.l2Line?.includes(term));

      if (foundLine) {
        // If the term is found, proceed
        const { starttime, l1Line, l2Line } = foundLine;

      }
    }
  }

  // Parse lines in the results
  // Ideally this can be done before results are loaded
  // But React complains that nested objects can't be react child
  // So we have to keep them as csv strings until we need them



  return (
    <GestureHandlerRootView style={styles.fullContainer}>
      {results && results.length > 0 && (
        <View style={styles.fullContainer}>
          <ThemedText>{results.length} results</ThemedText>
          <ThemedInput placeholder="Search..." icon="magnify" style={{marginBottom: 26}}/>
          <FlatList
            data={results}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.item} onPress={() => handleSubtitlePress(item)}>
                <Image
                  source={{
                    uri: `https://img.youtube.com/vi/${item.youtube_id}/0.jpg`,
                  }}
                  style={[styles.thumbnail]}
                />
                <ThemedText style={{ width: '100%', textAlign: 'left', paddingLeft: 16, paddingRight: 50 }}>{item.title}</ThemedText>
              </TouchableOpacity>
            )}
            keyExtractor={(item, index) => index.toString()}
          />
        </View>
      )}
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  thumbnail: {
    width: 75, // Makes the image fill the container
    aspectRatio: 16 / 9, // Maintains a 16:9 aspect ratio
    borderRadius: 4,
  },
  fullContainer: {
    flex: 1, // This will make the container fill the entire space of its parent
  },
  item: {
    paddingBottom: 26,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
});