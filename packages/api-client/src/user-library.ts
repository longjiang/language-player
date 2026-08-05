import { apiClient } from './client';
import type { LikedVideo, Playlist, PlaylistVideo } from '@langplayer/shared';

/**
 * Row-level API for user likes and playlists (SPEC-039 5.3).
 *
 * All methods go through the shared apiClient, so the access token is attached
 * and responses are already unwrapped (no `.data`).
 */

const _getLikes = () => apiClient.get<{ likes: LikedVideo[] }>('/likes');

const _likeVideo = (videoId: number | string, l2: string) =>
  apiClient.put<{ success: boolean; id: string | number }>('/likes', {
    videoId: Number(videoId),
    l2,
  });

const _unlikeVideo = (l2: string, videoId: number | string) =>
  apiClient.delete<{ success: boolean }>(
    `/likes/${encodeURIComponent(l2)}/${encodeURIComponent(videoId)}`,
  );

const _getPlaylists = (l2?: string) =>
  apiClient.get<{ playlists: Playlist[] }>('/playlists', {
    params: l2 ? { l2 } : undefined,
  });

const _getPlaylist = (playlistId: number | string) =>
  apiClient.get<{ playlist: Playlist }>(`/playlists/${playlistId}`);

const _createPlaylist = (
  title: string,
  l2: string,
  videos: PlaylistVideo[] = [],
) =>
  apiClient.post<{ success: boolean; id: string | number }>('/playlists', {
    title,
    l2,
    videos,
  });

const _updatePlaylist = (
  playlistId: number | string,
  payload: { title?: string; l2?: string; videos?: PlaylistVideo[] },
) =>
  apiClient.put<{ success: boolean }>(`/playlists/${playlistId}`, payload);

const _deletePlaylist = (playlistId: number | string) =>
  apiClient.delete<{ success: boolean }>(`/playlists/${playlistId}`);

const _stableReturn = {
  getLikes: _getLikes,
  likeVideo: _likeVideo,
  unlikeVideo: _unlikeVideo,
  getPlaylists: _getPlaylists,
  getPlaylist: _getPlaylist,
  createPlaylist: _createPlaylist,
  updatePlaylist: _updatePlaylist,
  deletePlaylist: _deletePlaylist,
} as const;

export function useUserLibrary() {
  return _stableReturn;
}
