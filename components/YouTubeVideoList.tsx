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
  currentVideoId?: string;
}

export const YouTubeVideoList: React.FC<YouTubeVideoListProps> = ({
  videos,
  header,
  style = {},
  onEndReached,
  onEndReachedThreshold,
  ListFooterComponent,
  variant = 'vertical',
  currentVideoId
}) => {
  const primaryBackgroundColor = useThemeColor({}, 'primaryBackground');

  const renderVideoCard = ({ item, index }: { item: any, index: number }) => (
    <View style={[style, variant === 'horizontal' && { marginBottom: 8 }]}>
      <YouTubeVideoCard 
        key={index} 
        video={item} 
        videos={videos} 
        variant={variant} 
        isCurrentVideo={item.youtube_id === currentVideoId}
      />
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
      scrollEnabled={variant === 'vertical'}
    />
  );
};