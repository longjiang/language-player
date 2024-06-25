import React from "react";
import { FlatList, View, StyleSheet, ViewStyle } from "react-native";
import { YouTubeVideoCard } from '@/components/YouTubeVideoCard';
import { useThemeColor } from "@/hooks/useThemeColor";


interface YouTubeVideoListProps {
  videos: Array<any>;
  header: React.ReactNode;
  style?: ViewStyle;
}

export const YouTubeVideoList: React.FC<YouTubeVideoListProps> = ({ videos, header, style = {} }) => {
  const primaryBackgroundColor = useThemeColor({}, 'primaryBackground');

  const renderVideoCard = ({ item, index }: { item: any, index: number }) => (
    <View style={style}>
      <YouTubeVideoCard key={index} video={item} />
    </View>
  );

  return (
    <FlatList
      style={{ backgroundColor: primaryBackgroundColor }}
      data={videos}
      renderItem={renderVideoCard}
      keyExtractor={(item, index) => index.toString()}
    />
  );
};
