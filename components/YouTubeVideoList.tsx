// @/components/YouTubeVideoList.tsx

import React, { ReactElement } from "react";
import { FlatList, View, ViewStyle } from "react-native";
import { YouTubeVideoCard } from '@/components/YouTubeVideoCard';
import { useThemeColor } from "@/hooks/useThemeColor";

interface YouTubeVideoListProps {
  videos: Array<any>;
  header?: ReactElement | null;
  style?: ViewStyle;
  onEndReached?: () => void;
  onEndReachedThreshold?: number;
  ListFooterComponent?: React.ComponentType<any> | React.ReactElement | null;
}

export const YouTubeVideoList: React.FC<YouTubeVideoListProps> = ({
  videos,
  header,
  style = {},
  onEndReached,
  onEndReachedThreshold,
  ListFooterComponent
}) => {
  const primaryBackgroundColor = useThemeColor({}, 'primaryBackground');

  const renderVideoCard = ({ item, index }: { item: any, index: number }) => (
    <View style={style}>
      <YouTubeVideoCard key={index} video={item} videos={videos} />
    </View>
  );

  return (
    <FlatList
      style={{ backgroundColor: primaryBackgroundColor }}
      data={videos}
      renderItem={renderVideoCard}
      ListHeaderComponent={header}
      keyExtractor={(item, index) => index.toString()}
      onEndReached={onEndReached}
      onEndReachedThreshold={onEndReachedThreshold}
      ListFooterComponent={ListFooterComponent}
    />
  );
};