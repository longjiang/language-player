import React from 'react';
import { FlatList, View, Text, ActivityIndicator, useWindowDimensions } from 'react-native';
import type { YouTubeVideo } from '@langplayer/shared';
import { VideoCard } from './VideoCard';

interface VideoGridProps {
  videos: YouTubeVideo[];
  loading?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
}

export function VideoGrid({ videos, loading, hasMore, onLoadMore, onRefresh, refreshing }: VideoGridProps) {
  const { width } = useWindowDimensions();
  const numColumns = width < 400 ? 1 : width < 700 ? 2 : width < 1000 ? 3 : 4;

  if (loading && videos.length === 0) {
    return (
      <View className="flex-1 items-center justify-center py-16">
        <ActivityIndicator size="large" className="text-primary" />
      </View>
    );
  }

  if (!loading && videos.length === 0) {
    return (
      <View className="flex-1 items-center justify-center py-16 px-4">
        <Text className="text-center text-muted-foreground">No videos found</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={videos}
      keyExtractor={(item) => item.youtube_id}
      renderItem={({ item }) => <VideoCard video={item} />}
      key={`grid-${numColumns}`}
      numColumns={numColumns}
      columnWrapperStyle={numColumns > 1 ? { gap: 8, paddingHorizontal: 8 } : undefined}
      contentContainerStyle={{ paddingBottom: 16 }}
      onEndReached={hasMore ? onLoadMore : undefined}
      onEndReachedThreshold={0.5}
      onRefresh={onRefresh}
      refreshing={refreshing}
      ListFooterComponent={
        loading ? (
          <View className="py-4">
            <ActivityIndicator size="small" className="text-muted-foreground" />
          </View>
        ) : null
      }
    />
  );
}
