import { apiClient } from './client';
import type { YouTubeVideo, SubtitleLine, LemmatizeResponse } from '@langplayer/shared';

/** Hash table from /lemmatize-video-normalized: md5(line) → { tokens: [...] } */
export type VideoTokenCache = Record<string, LemmatizeResponse>;

export function useVideos() {
  return {
    /** Search videos by title query. */
    searchByTitle: (params: {
      q: string;
      l2: string;
      limit?: number;
      page?: number;
    }) => apiClient.get<YouTubeVideo[]>('/search-videos', { params }),

    /** Get a single video with its subtitles. */
    getById: (id: string) => apiClient.get<YouTubeVideo>(`/videos/${id}`),

    /** Get subtitles for a video in a specific language. */
    getSubtitles: (videoId: string, lang: string) =>
      apiClient.get<SubtitleLine[]>(`/videos/${videoId}/subtitles/${lang}`),

    /** Get recommended videos for a user's level. */
    getRecommendations: (lang: string, level: number) =>
      apiClient.get<YouTubeVideo[]>('/videos/recommendations', {
        params: { lang, level },
      }),

    /** Get live TV channels for a language. */
    getLiveTV: (lang: string) =>
      apiClient.get<YouTubeVideo[]>('/videos/live-tv', { params: { lang } }),

    /** Report a video issue (wrong subtitles, etc.). */
    report: (videoId: string, reason: string) =>
      apiClient.post<void>(`/videos/${videoId}/report`, { reason }),

    /** Get pre-computed, normalized token cache for all subtitle lines of a video. */
    getVideoTokenCache: (videoId: string, lang: string) =>
      apiClient.get<VideoTokenCache>('/lemmatize-video-normalized', {
        params: { video_id: videoId, lang },
      }),
  };
}
