import type { YouTubeVideo } from '@langplayer/shared';

export type QueueType = 'recommended' | 'tvShow' | 'search';

export interface QueueState {
  currentVideo: YouTubeVideo | null;
  queue: YouTubeVideo[];
  queueType: QueueType;
  currentIndex: number;
  tvShow?: { id: number; title: string };
  searchTerm?: string;
}

export class QueueManager {
  private _queue: YouTubeVideo[] = [];
  private _queueType: QueueType = 'recommended';
  private _tvShow?: { id: number; title: string };
  private _searchTerm?: string;

  setVideoAndQueue(
    video: YouTubeVideo | null,
    queue: YouTubeVideo[],
    queueType: QueueType = 'recommended',
    metadata?: { tvShow?: { id: number; title: string }; searchTerm?: string },
  ): void {
    this._queue = queue;
    this._queueType = queueType;

    if (queueType === 'tvShow') {
      if (metadata?.tvShow !== undefined) this._tvShow = metadata.tvShow;
      this._searchTerm = undefined;
    } else if (queueType === 'search') {
      if (metadata?.searchTerm !== undefined) this._searchTerm = metadata.searchTerm;
      this._tvShow = undefined;
    } else {
      this._tvShow = undefined;
      this._searchTerm = undefined;
    }

    if (video && !this._queue.some((v) => v.youtube_id === video.youtube_id)) {
      this._queue = [video, ...this._queue];
    }
  }

  updateCurrentVideo(video: YouTubeVideo): void {
    const idx = this.findIndex(video.youtube_id);
    if (idx >= 0) this._queue[idx] = video;
  }

  get currentIndex(): number { return 0; }

  findIndex(youtubeId: string): number {
    return this._queue.findIndex((v) => v.youtube_id === youtubeId);
  }

  getSnapshot(youtubeId?: string): QueueState {
    const idx = youtubeId ? this.findIndex(youtubeId) : 0;
    return {
      currentVideo: idx >= 0 ? (this._queue[idx] ?? null) : null,
      queue: this._queue,
      queueType: this._queueType,
      currentIndex: idx,
      tvShow: this._tvShow,
      searchTerm: this._searchTerm,
    };
  }

  getNext(youtubeId: string): YouTubeVideo | null {
    const idx = this.findIndex(youtubeId);
    return idx >= 0 && idx < this._queue.length - 1 ? (this._queue[idx + 1] ?? null) : null;
  }

  getPrevious(youtubeId: string): YouTubeVideo | null {
    const idx = this.findIndex(youtubeId);
    return idx > 0 ? (this._queue[idx - 1] ?? null) : null;
  }

  get queueType(): QueueType { return this._queueType; }
}

let _globalQM: QueueManager | null = null;

export function getGlobalQueueManager(): QueueManager {
  if (!_globalQM) _globalQM = new QueueManager();
  return _globalQM;
}
