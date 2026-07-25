import React from 'react';
import { FlatList, View, Text, ActivityIndicator } from 'react-native';
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
      numColumns={2}
      columnWrapperStyle={{ gap: 8, paddingHorizontal: 8 }}
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
