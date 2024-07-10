// @/src/QueueManager.ts

import { YouTubeVideo } from "@/types/videoTypes";

export class QueueManager {
  private _currentVideo: YouTubeVideo | undefined;
  private _queue: YouTubeVideo[];

  constructor(initialVideo?: YouTubeVideo, initialQueue: YouTubeVideo[] = []) {
    this._currentVideo = initialVideo;
    this._queue = initialQueue;
  }

  get currentVideo(): YouTubeVideo | undefined {
    return this._currentVideo;
  }

  get queue(): YouTubeVideo[] {
    return [...this._queue];
  }

  get currentVideoIndex(): number {
    return this._currentVideo ? this._queue.findIndex(v => v.youtube_id === this._currentVideo?.youtube_id) : -1;
  }

  setVideoAndQueue(newVideo: YouTubeVideo | undefined, newQueue: YouTubeVideo[]): void {
    this._currentVideo = newVideo;
    this._queue = newQueue;
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