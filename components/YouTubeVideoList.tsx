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
  variant?: 'vertical' | 'horizontal';
}

export const YouTubeVideoList: React.FC<YouTubeVideoListProps> = ({
  videos,
  header,
  style = {},
  onEndReached,
  onEndReachedThreshold,
  ListFooterComponent,
  variant = 'vertical'
}) => {
  const primaryBackgroundColor = useThemeColor({}, 'primaryBackground');

  const renderVideoCard = ({ item, index }: { item: any, index: number }) => (
    <View style={[style, { marginBottom: 16 }]}>
      <YouTubeVideoCard key={index} video={item} videos={videos} variant={variant} />
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