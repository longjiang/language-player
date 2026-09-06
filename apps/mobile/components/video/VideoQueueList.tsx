import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useVideoPlayer } from '@/contexts/VideoPlayerContext';
import { VideoCard } from './VideoCard';
import { useT } from '@/hooks/use-t';

interface VideoQueueListProps {
  currentYoutubeId: string;
}

export function VideoQueueList({ currentYoutubeId }: VideoQueueListProps) {
  const t = useT();
  const { queueState } = useVideoPlayer();
  const { queue, queueType, tvShow } = queueState;

  if (queue.length === 0) return null;
  if (queue.length <= 1 && queueType !== 'tvShow') return null;

  return (
    <ScrollView className="flex-1">
      {/* TV show header */}
      {queueType === 'tvShow' && tvShow && (
        <View className="mb-2 rounded-lg bg-muted/50 px-3 py-2">
          <Text className="text-sm font-medium text-foreground">{tvShow.title}</Text>
          <Text className="text-xs text-muted-foreground">
            ({queue.length} {t('title.episodes')})
          </Text>
        </View>
      )}

      {queue.map((video) => (
        <View key={video.youtube_id} className="mb-1">
          <VideoCard
            video={video}
            videos={queue}
            queueType={queueType}
            layout="list"
            isActive={video.youtube_id === currentYoutubeId}
            showActionsMenu={queueType !== 'tvShow'}
          />
        </View>
      ))}
    </ScrollView>
  );
}
