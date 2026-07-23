import { apiClient } from './client';
import type { YouTubeVideo, SubtitleLine, LemmatizeResponse } from '@langplayer/shared';

/** Hash table from /lemmatize-video-normalized: md5(line) → { tokens: [...] } */
export type VideoTokenCache = Record<string, LemmatizeResponse>;

// Module-level stable references — these functions have no dependencies
// on React state, so they're created once and reused across all renders.
// This prevents cascading re-renders when used in useEffect dependency arrays.

const _searchByTitle = (params: {
  q: string;
  l2: string;
  limit?: number;
  page?: number;
}) => apiClient.get<YouTubeVideo[]>('/search-videos', { params });

const _getById = (id: string) => apiClient.get<YouTubeVideo>(`/videos/${id}`);

const _getSubtitles = (videoId: string, lang: string) =>
  apiClient.get<SubtitleLine[]>(`/videos/${videoId}/subtitles/${lang}`);

const _getRecommendations = (params: {
  l2: string;
  level?: number;
  page?: number;
  limit?: number;
  userId?: string;
}) => apiClient.get<YouTubeVideo[]>('/recommend-videos', { params });

const _getLiveTV = (lang: string) =>
  apiClient.get<YouTubeVideo[]>('/videos/live-tv', { params: { lang } });

const _report = (videoId: string, reason: string) =>
  apiClient.post<void>(`/videos/${videoId}/report`, { reason });

const _searchSubs = (params: {
  terms: string;
  l2: string;
  limit?: number;
  context?: number;
}) => apiClient.get<import('@langplayer/shared').SubsSearchVideo[]>('/subs-search', { params });

const _getVideoTokenCache = (videoId: string, lang: string) =>
  apiClient.get<VideoTokenCache>('/lemmatize-video-normalized', {
    params: { video_id: videoId, lang },
  });

const _stableReturn = {
  searchByTitle: _searchByTitle,
  getById: _getById,
  getSubtitles: _getSubtitles,
  getRecommendations: _getRecommendations,
  getLiveTV: _getLiveTV,
  report: _report,
  searchSubs: _searchSubs,
  getVideoTokenCache: _getVideoTokenCache,
} as const;

export function useVideos() {
  return _stableReturn;
}
