// @/components/YouTubeVideoList.tsx

import React, { ReactElement } from "react";
import { FlatList, View, ViewStyle } from "react-native";
import { YouTubeVideoCard } from '@/components/YouTubeVideoCard';
import { useThemeColor } from "@/hooks/useThemeColor";
import { YouTubeVideo } from '@/types';

interface YouTubeVideoListProps {
  videos: Array<YouTubeVideo>;
  header?: ReactElement | null;
  style?: ViewStyle;
  onEndReached?: () => void;
  onEndReachedThreshold?: number;
  ListFooterComponent?: React.ComponentType<any> | React.ReactElement | null;
  variant?: 'vertical' | 'horizontal';
  showDetails?: boolean;
  currentVideoId?: string;
  queueType?: 'recommended' | 'tvShow' | 'search';
  tvShow?: {id: string, title: string, episodes: YouTubeVideo[]};
  searchTerm?: string;
  onVideoPress?: () => void;
}

export const YouTubeVideoList: React.FC<YouTubeVideoListProps> = ({
  videos,
  header,
  style = {},
  onEndReached,
  onEndReachedThreshold,
  ListFooterComponent,
  variant = 'vertical',
  showDetails = true,
  currentVideoId,
  queueType = 'recommended',
  tvShow,
  searchTerm,
  onVideoPress
}) => {
  const primaryBackgroundColor = useThemeColor({}, 'primaryBackground');

  const renderVideoCard = ({ item, index }: { item: YouTubeVideo, index: number }) => (
    <View style={[style, variant === 'horizontal' && { marginBottom: 4 }]}>
      <YouTubeVideoCard 
        key={index} 
        video={item} 
        videos={videos} 
        variant={variant} 
        isCurrentVideo={item.youtube_id === currentVideoId}
        showDetails={showDetails}
        queueType={queueType}
        tvShow={tvShow}
        searchTerm={searchTerm}
        onPress={onVideoPress}
      />
    </View>
  );

  return (
    <FlatList
      data={videos}
      renderItem={renderVideoCard}
      ListHeaderComponent={header}
      keyExtractor={(item, index) => item.youtube_id || index.toString()}
      onEndReached={onEndReached}
      onEndReachedThreshold={onEndReachedThreshold}
      ListFooterComponent={ListFooterComponent}
      scrollEnabled={variant === 'vertical'}
    />
  );
};