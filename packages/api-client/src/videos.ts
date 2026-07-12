import { apiClient } from './client';
import type { YouTubeVideo, SubtitleLine } from '@langplayer/shared';

export function useVideos() {
  return {
    /** Search videos by query, language, and difficulty. */
    search: (params: {
      q?: string;
      lang?: string;
      level?: number;
      page?: number;
      pageSize?: number;
    }) => apiClient.get<YouTubeVideo[]>('/videos/search', { params }),

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
  };
}
