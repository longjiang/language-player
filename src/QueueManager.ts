// @/src/QueueManager.ts

import { YouTubeVideo } from "@/types/videoTypes";

type TVShow = {
  id: string;
  title: string;
  episodes: YouTubeVideo[];
};

type QueueType = 'recommended' | 'tvShow' | 'search';

export class QueueManager {
  private _currentVideo: YouTubeVideo | undefined;
  private _queue: YouTubeVideo[];
  private _queueType: QueueType;
  private _tvShow: TVShow | undefined;
  private _searchTerm: string | undefined;

  constructor(initialVideo?: YouTubeVideo, initialQueue: YouTubeVideo[] = [], queueType: QueueType = 'recommended') {
    this._currentVideo = initialVideo;
    this._queue = initialQueue;
    this._queueType = queueType;
  }

  get currentVideo(): YouTubeVideo | undefined {
    return this._currentVideo;
  }

  get queue(): YouTubeVideo[] {
    return [...this._queue];
  }

  get queueType(): QueueType {
    return this._queueType;
  }

  get tvShow(): TVShow | undefined {
    return this._tvShow;
  }

  get searchTerm(): string | undefined {
    return this._searchTerm;
  }

  get currentVideoIndex(): number {
    return this._currentVideo ? this._queue.findIndex(v => v.youtube_id === this._currentVideo?.youtube_id) : -1;
  }

  setVideoAndQueue(newVideo: YouTubeVideo | undefined, newQueue: YouTubeVideo[], queueType: QueueType, metadata?: TVShow | string): void {
    this._currentVideo = newVideo;
    this._queue = newQueue;
    this._queueType = queueType;

    if (queueType === 'tvShow' && metadata && typeof metadata !== 'string') {
      this._tvShow = metadata;
    } else if (queueType === 'search' && typeof metadata === 'string') {
      this._searchTerm = metadata;
    } else {
      this._tvShow = undefined;
      this._searchTerm = undefined;
    }
  }

  skipToVideo(index: number): void {
    if (index >= 0 && index < this._queue.length) {
      this._currentVideo = this._queue[index];
    }
  }

  skipToPreviousVideo(): void {
    const prevIndex = this.currentVideoIndex - 1;
    if (prevIndex >= 0) {
      this._currentVideo = this._queue[prevIndex];
    }
  }

  skipToNextVideo(): void {
    const nextIndex = this.currentVideoIndex + 1;
    if (nextIndex < this._queue.length) {
      this._currentVideo = this._queue[nextIndex];
    }
  }
}