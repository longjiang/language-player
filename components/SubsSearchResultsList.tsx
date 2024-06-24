import React from "react";
import { StyleSheet, TouchableOpacity, View, Text } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { ThemedInput } from "./ThemedInput";
import { FlatList, GestureHandlerRootView } from "react-native-gesture-handler";
import { Image } from "react-native";

export const SubsSearchResultsList = ({ results, term }) => {
  const handleSubtitlePress = (item) => {
    // Handle press
  }


  results.forEach(item => {
    const targetLineIndex = item.subs_l2.findIndex(sub => {
      return typeof sub.line === 'string' && sub.line.includes(term);
    });
    item.targetLineIndex = targetLineIndex;
  })


  return (
    <GestureHandlerRootView style={styles.fullContainer}>
      {results && results.length > 0 && (
        <View style={styles.fullContainer}>
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
                <ThemedText style={{ width: '100%', textAlign: 'left', paddingLeft: 16, paddingRight: 50 }}>{item.subs_l2[item.targetLineIndex]?.line}</ThemedText>
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