// @/src/api/directus/user-watch-history.ts

import { postCollectionItem } from ".";
import { format } from 'date-fns';

interface WatchHistoryItem {
  date: string;
  l2: number;
  video_id: number;
  last_position: number;
}

export const addToWatchHistory = async (
  // The user id is inferred from the auth token
  l2Lang: number,
  videoId: number,
  lastPosition: number,
  authToken?: string
): Promise<WatchHistoryItem> => {
  const date = format(new Date(), 'yyyy-MM-dd HH:mm:ss');
  const item: WatchHistoryItem = {
    date,
    l2: l2Lang,
    video_id: videoId,
    last_position: lastPosition,
  };
  return await postCollectionItem<WatchHistoryItem>('user_watch_history', item, authToken);
};
