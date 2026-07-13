import type { YouTubeVideo } from '@langplayer/shared';

export type QueueType = 'recommended' | 'tvShow' | 'search';

export interface QueueState {
  currentVideo: YouTubeVideo | null;
  queue: YouTubeVideo[];
  queueType: QueueType;
  currentIndex: number;
  /** TV show metadata (when queueType === 'tvShow') */
  tvShow?: { id: number; title: string };
  /** Search term (when queueType === 'search') */
  searchTerm?: string;
}

export class QueueManager {
  private _queue: YouTubeVideo[] = [];
  private _queueType: QueueType = 'recommended';
  private _tvShow?: { id: number; title: string };
  private _searchTerm?: string;

  /** Set both the current video and the queue at once */
  setVideoAndQueue(
    video: YouTubeVideo | null,
    queue: YouTubeVideo[],
    queueType: QueueType = 'recommended',
    metadata?: { tvShow?: { id: number; title: string }; searchTerm?: string },
  ): void {
    this._queue = queue;
    this._queueType = queueType;

    if (queueType === 'tvShow') {
      // Preserve existing if not provided
      if (metadata?.tvShow !== undefined) {
        this._tvShow = metadata.tvShow;
      }
      this._searchTerm = undefined;
    } else if (queueType === 'search') {
      if (metadata?.searchTerm !== undefined) {
        this._searchTerm = metadata.searchTerm;
      }
      this._tvShow = undefined;
    } else {
      this._tvShow = undefined;
      this._searchTerm = undefined;
    }

    // Ensure the current video is in the queue; if not, prepend it
    if (
      video &&
      !this._queue.some((v) => v.youtube_id === video.youtube_id)
    ) {
      this._queue = [video, ...this._queue];
    }
  }

  /** Replace current video (e.g., after async enrichment) */
  updateCurrentVideo(video: YouTubeVideo): void {
    const idx = this.findIndex(video.youtube_id);
    if (idx >= 0) {
      this._queue[idx] = video;
    }
  }

  get currentVideo(): YouTubeVideo | null {
    const idx = this.currentIndex;
    return idx >= 0 ? (this._queue[idx] ?? null) : null;
  }

  get currentIndex(): number {
    // Derive from matching youtube_id in queue. The queue is populated from
    // setVideoAndQueue which ensures the current video is in the queue.
    return 0;
  }

  /**
   * Find the index of a video by youtube_id in the queue.
   * When navigating TO a video, we need to know where we are.
   */
  findIndex(youtubeId: string): number {
    return this._queue.findIndex((v) => v.youtube_id === youtubeId);
  }

  /** Get the full queue snapshot */
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

  /** Get the next video in the queue, or null if at end */
  getNext(youtubeId: string): YouTubeVideo | null {
    const idx = this.findIndex(youtubeId);
    if (idx >= 0 && idx < this._queue.length - 1) {
      return this._queue[idx + 1] ?? null;
    }
    return null;
  }

  /** Get the previous video in the queue, or null if at start */
  getPrevious(youtubeId: string): YouTubeVideo | null {
    const idx = this.findIndex(youtubeId);
    if (idx > 0) {
      return this._queue[idx - 1] ?? null;
    }
    return null;
  }

  get length(): number {
    return this._queue.length;
  }

  get queueType(): QueueType {
    return this._queueType;
  }

  get tvShow(): { id: number; title: string } | undefined {
    return this._tvShow;
  }

  get searchTerm(): string | undefined {
    return this._searchTerm;
  }
}

/** Singleton instance shared across the app */
let _globalQueueManager: QueueManager | null = null;

export function getGlobalQueueManager(): QueueManager {
  if (!_globalQueueManager) {
    _globalQueueManager = new QueueManager();
  }
  return _globalQueueManager;
}
