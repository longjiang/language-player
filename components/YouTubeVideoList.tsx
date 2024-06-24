import React from "react";
import { FlatList, View, StyleSheet } from "react-native";
import { YouTubeVideoCard } from '@/components/YouTubeVideoCard';
import { useThemeColor } from "@/hooks/useThemeColor";

export const YouTubeVideoList = ({ videos, header, style = {} }) => {
  const primaryBackgroundColor = useThemeColor({}, 'primaryBackground');

  const renderVideoCard = ({ item, index }) => (
    <View style={style}>
      <YouTubeVideoCard key={index} video={item} />
    </View>
  );

  return (
    <FlatList
      style={{ backgroundColor: primaryBackgroundColor }}
      ListHeaderComponent={header}
      data={videos}
      renderItem={renderVideoCard}
      keyExtractor={(item, index) => index.toString()}
    />
  );
};
