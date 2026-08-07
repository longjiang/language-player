import React from 'react';
import { View, Text } from 'react-native';
import { useVideoPlayer } from '@/contexts/VideoPlayerContext';
import { VideoCard } from './VideoCard';
import { Tv } from 'lucide-react-native';
import { ICON_PRIMARY } from '@/lib/theme-colors';

interface VideoQueueListProps {
  currentYoutubeId: string;
}

export function VideoQueueList({ currentYoutubeId }: VideoQueueListProps) {
  const { queueState } = useVideoPlayer();
  const { queue, queueType, tvShow } = queueState;

  if (queue.length === 0) return null;
  if (queue.length <= 1 && queueType !== 'tvShow') return null;

  return (
    <View>
      {/* TV show header */}
      {queueType === 'tvShow' && tvShow && (
        <View className="mb-2 flex-row items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
          <Tv size={16} color={ICON_PRIMARY} />
          <Text className="text-sm font-medium text-foreground">{tvShow.title}</Text>
          <Text className="text-xs text-muted-foreground">
            ({queue.length} episodes)
          </Text>
        </View>
      )}

      {queue.map((video, idx) => (
        <View key={video.youtube_id} className="flex-row items-center gap-2 mb-1">
          {queueType === 'tvShow' && (
            <Text className="w-6 text-center text-xs font-medium text-muted-foreground">
              {idx + 1}
            </Text>
          )}
          <View className="flex-1 min-w-0">
            <VideoCard
              video={video}
              videos={queue}
              queueType={queueType}
              layout="list"
              isActive={video.youtube_id === currentYoutubeId}
            />
          </View>
        </View>
      ))}
    </View>
  );
}
