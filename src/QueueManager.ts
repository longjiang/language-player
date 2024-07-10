// @/src/QueueManager.ts

import { YouTubeVideo } from "@/types/videoTypes";

export class QueueManager {
  private _queue: YouTubeVideo[] = [];
  private _currentIndex: number = -1;

  get currentVideo(): YouTubeVideo | undefined {
    return this._currentIndex >= 0 ? this._queue[this._currentIndex] : undefined;
  }

  get queue(): YouTubeVideo[] {
    return [...this._queue];
  }

  get currentVideoIndex(): number {
    return this._currentIndex;
  }

  setQueue(videos: YouTubeVideo[], currentVideo?: YouTubeVideo) {
    this._queue = videos;
    if (currentVideo) {
      this._currentIndex = this._queue.findIndex(v => v.youtube_id === currentVideo.youtube_id);
    } else {
      this._currentIndex = 0;
    }
  }

  skipToVideo(index: number): YouTubeVideo | undefined {
    if (index >= 0 && index < this._queue.length) {
      this._currentIndex = index;
      return this.currentVideo;
    }
    return undefined;
  }

  skipToNextVideo(): YouTubeVideo | undefined {
    return this.skipToVideo(this._currentIndex + 1);
  }

  skipToPreviousVideo(): YouTubeVideo | undefined {
    return this.skipToVideo(this._currentIndex - 1);
  }

  updateCurrentVideo(video: YouTubeVideo) {
    if (this._currentIndex >= 0) {
      this._queue[this._currentIndex] = video;
    }
  }

  reorderQueueForTVShow(newVideo: YouTubeVideo, showEpisodes: YouTubeVideo[]) {
    const currentIndex = showEpisodes.findIndex(ep => ep.youtube_id === newVideo.youtube_id);
    if (currentIndex !== -1) {
      const beforeCurrent = showEpisodes.slice(0, currentIndex);
      const afterCurrent = showEpisodes.slice(currentIndex + 1);
      this._queue = [...afterCurrent, newVideo, ...beforeCurrent];
      this._currentIndex = 0;
    } else {
      this._queue = [newVideo, ...showEpisodes];
      this._currentIndex = 0;
    }
  }
}