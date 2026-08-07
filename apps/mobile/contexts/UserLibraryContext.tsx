import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useUserLibrary } from '@langplayer/api-client';
import type { LikedVideo, Playlist, PlaylistVideo } from '@langplayer/shared';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { logwarn } from '@/lib/logger';

type LikeTarget = {
  id?: string | number;
  youtube_id?: string;
  title?: string;
};

interface UserLibraryContextValue {
  /** True once the current L2's likes/playlists have been fetched (or failed). */
  loaded: boolean;
  isSignedIn: boolean;
  getLikedVideos: (l2Code: string) => LikedVideo[];
  isLiked: (l2Code: string, video: LikeTarget) => boolean;
  likeVideo: (video: LikeTarget) => Promise<boolean>;
  unlikeVideo: (video: LikeTarget) => Promise<boolean>;
  toggleLike: (video: LikeTarget) => Promise<boolean>;
  getPlaylists: (l2Code: string) => Playlist[];
  getPlaylist: (l2Code: string, playlistId: number | string) => Promise<Playlist | null>;
  createPlaylist: (l2Code: string, title: string, videos?: PlaylistVideo[]) => Promise<Playlist | null>;
  renamePlaylist: (l2Code: string, playlistId: number | string, title: string) => Promise<boolean>;
  deletePlaylist: (l2Code: string, playlistId: number | string) => Promise<boolean>;
  addVideoToPlaylist: (l2Code: string, playlistId: number | string, video: PlaylistVideo) => Promise<boolean>;
  removeVideoFromPlaylist: (l2Code: string, playlistId: number | string, video: PlaylistVideo) => Promise<boolean>;
  isVideoInPlaylist: (playlist: Playlist, video: PlaylistVideo) => boolean;
}

const UserLibraryContext = createContext<UserLibraryContextValue | undefined>(undefined);

function sameVideo(a: PlaylistVideo, b: PlaylistVideo): boolean {
  if (a.id != null && b.id != null && String(a.id) === String(b.id)) return true;
  if (a.youtube_id && b.youtube_id && a.youtube_id === b.youtube_id) return true;
  return false;
}

function likeMatchesVideo(like: LikedVideo, video: LikeTarget): boolean {
  if (video.id != null && String(like.id) === String(video.id)) return true;
  if (video.youtube_id && like.youtube_id && like.youtube_id === video.youtube_id) return true;
  return false;
}

function normalizePlaylist(playlist: Playlist): Playlist {
  return {
    ...playlist,
    videos: Array.isArray(playlist.videos) ? playlist.videos : [],
  };
}

/**
 * Loads and caches the authenticated user's likes + playlists for the current
 * L2 and exposes optimistic mutations on top of the Flask row APIs.
 *
 * Ported from apps/web/src/providers/user-library-provider.tsx.
 */
export function UserLibraryProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { l2Lang } = useLanguage();
  const api = useUserLibrary();

  const userId = user?.id ?? null;
  const l2Code = l2Lang?.code ?? '';
  const isSignedIn = !authLoading && !!userId;

  const [likesByL2, setLikesByL2] = useState<Record<string, LikedVideo[]>>({});
  const [playlistsByL2, setPlaylistsByL2] = useState<Record<string, Playlist[]>>({});
  const [loaded, setLoaded] = useState(false);

  // Hydrate on auth/L2 change.
  useEffect(() => {
    if (authLoading) return;
    if (!userId || !l2Code) {
      setLikesByL2({});
      setPlaylistsByL2({});
      setLoaded(true);
      return;
    }

    let cancelled = false;
    setLoaded(false);

    (async () => {
      try {
        const [likesRes, playlistsRes] = await Promise.all([
          api.getLikes(),
          api.getPlaylists(l2Code),
        ]);
        if (cancelled) return;

        setLikesByL2((prev) => ({
          ...prev,
          [l2Code]: (likesRes.likes ?? []).filter(
            (like) => like.l2Code === l2Code || like.l2 === l2Code,
          ),
        }));
        setPlaylistsByL2((prev) => ({
          ...prev,
          [l2Code]: (playlistsRes.playlists ?? []).map(normalizePlaylist),
        }));
      } catch (err) {
        logwarn('[LP Mobile] Failed to load likes/playlists:', err);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();

    return () => { cancelled = true; };
  }, [api, authLoading, l2Code, userId]);

  const getLikedVideos = useCallback((code: string): LikedVideo[] => {
    return [...(likesByL2[code] ?? [])].sort((a, b) =>
      (b.created_on ?? b.createdOn ?? '').localeCompare(a.created_on ?? a.createdOn ?? ''),
    );
  }, [likesByL2]);

  const isLiked = useCallback((code: string, video: LikeTarget): boolean => {
    return (likesByL2[code] ?? []).some((like) => likeMatchesVideo(like, video));
  }, [likesByL2]);

  const likeVideo = useCallback(async (video: LikeTarget): Promise<boolean> => {
    const id = video.id;
    if (id == null || !String(id).trim()) return false;
    const numericId = Number(id);
    if (!Number.isFinite(numericId)) return false;
    try {
      await api.likeVideo(numericId, l2Code);
      setLikesByL2((prev) => {
        const current = prev[l2Code] ?? [];
        if (current.some((like) => likeMatchesVideo(like, video))) return prev;
        const now = new Date().toISOString();
        const like: LikedVideo = {
          id,
          videoId: id,
          video_id: id,
          l2: l2Code,
          l2Code,
          youtube_id: video.youtube_id ?? '',
          title: video.title,
          created_on: now,
          createdOn: now,
        };
        return { ...prev, [l2Code]: [...current, like] };
      });
      return true;
    } catch (err) {
      logwarn('[LP Mobile] Like failed:', err);
      return false;
    }
  }, [api, l2Code]);

  const unlikeVideo = useCallback(async (video: LikeTarget): Promise<boolean> => {
    const current = likesByL2[l2Code] ?? [];
    const like = current.find((item) => likeMatchesVideo(item, video));
    const id = like?.id ?? video.id;
    if (id == null || !String(id).trim()) return false;
    const numericId = Number(id);
    if (!Number.isFinite(numericId)) return false;

    // Optimistically remove, then roll back if the API call fails.
    setLikesByL2((prev) => ({
      ...prev,
      [l2Code]: (prev[l2Code] ?? []).filter((item) => !likeMatchesVideo(item, video)),
    }));
    const deleteL2 = like?.l2Code ?? like?.l2 ?? l2Code;
    try {
      await api.unlikeVideo(String(deleteL2), numericId);
      return true;
    } catch (err) {
      logwarn('[LP Mobile] Unlike failed:', err);
      setLikesByL2((prev) => ({
        ...prev,
        [l2Code]: current,
      }));
      return false;
    }
  }, [api, l2Code, likesByL2]);

  const toggleLike = useCallback(async (video: LikeTarget): Promise<boolean> => {
    if (isLiked(l2Code, video)) return unlikeVideo(video);
    return likeVideo(video);
  }, [isLiked, l2Code, likeVideo, unlikeVideo]);

  const getPlaylists = useCallback((code: string): Playlist[] => {
    return playlistsByL2[code] ?? [];
  }, [playlistsByL2]);

  const getPlaylist = useCallback(async (code: string, playlistId: number | string): Promise<Playlist | null> => {
    const cached = (playlistsByL2[code] ?? []).find((p) => String(p.id) === String(playlistId));
    if (cached) return cached;
    try {
      const res = await api.getPlaylist(playlistId);
      const playlist = normalizePlaylist(res.playlist);
      setPlaylistsByL2((prev) => ({
        ...prev,
        [code]: [
          ...(prev[code] ?? []).filter((p) => String(p.id) !== String(playlist.id)),
          playlist,
        ],
      }));
      return playlist;
    } catch (err) {
      logwarn('[LP Mobile] Failed to load playlist:', err);
      return null;
    }
  }, [api, playlistsByL2]);

  const createPlaylist = useCallback(async (code: string, title: string, videos: PlaylistVideo[] = []): Promise<Playlist | null> => {
    try {
      const res = await api.createPlaylist(title, code, videos);
      const playlist: Playlist = { id: res.id, title, l2: code, videos };
      setPlaylistsByL2((prev) => ({
        ...prev,
        [code]: [...(prev[code] ?? []), playlist],
      }));
      return playlist;
    } catch (err) {
      logwarn('[LP Mobile] Failed to create playlist:', err);
      return null;
    }
  }, [api]);

  const updatePlaylistState = useCallback((code: string, playlist: Playlist) => {
    setPlaylistsByL2((prev) => ({
      ...prev,
      [code]: (prev[code] ?? []).map((p) =>
        String(p.id) === String(playlist.id) ? playlist : p,
      ),
    }));
  }, []);

  const renamePlaylist = useCallback(async (code: string, playlistId: number | string, title: string): Promise<boolean> => {
    const playlist = (playlistsByL2[code] ?? []).find((p) => String(p.id) === String(playlistId));
    if (!playlist) return false;
    try {
      await api.updatePlaylist(playlistId, { title });
      updatePlaylistState(code, { ...playlist, title });
      return true;
    } catch (err) {
      logwarn('[LP Mobile] Failed to rename playlist:', err);
      return false;
    }
  }, [api, playlistsByL2, updatePlaylistState]);

  const deletePlaylist = useCallback(async (code: string, playlistId: number | string): Promise<boolean> => {
    try {
      await api.deletePlaylist(playlistId);
      setPlaylistsByL2((prev) => ({
        ...prev,
        [code]: (prev[code] ?? []).filter((p) => String(p.id) !== String(playlistId)),
      }));
      return true;
    } catch (err) {
      logwarn('[LP Mobile] Failed to delete playlist:', err);
      return false;
    }
  }, [api]);

  const addVideoToPlaylist = useCallback(async (code: string, playlistId: number | string, video: PlaylistVideo): Promise<boolean> => {
    const playlist = (playlistsByL2[code] ?? []).find((p) => String(p.id) === String(playlistId));
    if (!playlist) return false;
    if (playlist.videos.some((v) => sameVideo(v, video))) return true;
    try {
      const videos = [...playlist.videos, video];
      await api.updatePlaylist(playlistId, { videos });
      updatePlaylistState(code, { ...playlist, videos });
      return true;
    } catch (err) {
      logwarn('[LP Mobile] Failed to add video to playlist:', err);
      return false;
    }
  }, [api, playlistsByL2, updatePlaylistState]);

  const removeVideoFromPlaylist = useCallback(async (code: string, playlistId: number | string, video: PlaylistVideo): Promise<boolean> => {
    const playlist = (playlistsByL2[code] ?? []).find((p) => String(p.id) === String(playlistId));
    if (!playlist) return false;
    const videos = playlist.videos.filter((v) => !sameVideo(v, video));
    if (videos.length === playlist.videos.length) return true;
    try {
      await api.updatePlaylist(playlistId, { videos });
      updatePlaylistState(code, { ...playlist, videos });
      return true;
    } catch (err) {
      logwarn('[LP Mobile] Failed to remove video from playlist:', err);
      return false;
    }
  }, [api, playlistsByL2, updatePlaylistState]);

  const isVideoInPlaylist = useCallback((playlist: Playlist, video: PlaylistVideo): boolean => {
    return playlist.videos.some((v) => sameVideo(v, video));
  }, []);

  const value = useMemo<UserLibraryContextValue>(() => ({
    loaded,
    isSignedIn,
    getLikedVideos,
    isLiked,
    likeVideo,
    unlikeVideo,
    toggleLike,
    getPlaylists,
    getPlaylist,
    createPlaylist,
    renamePlaylist,
    deletePlaylist,
    addVideoToPlaylist,
    removeVideoFromPlaylist,
    isVideoInPlaylist,
  }), [
    loaded,
    isSignedIn,
    getLikedVideos,
    isLiked,
    likeVideo,
    unlikeVideo,
    toggleLike,
    getPlaylists,
    getPlaylist,
    createPlaylist,
    renamePlaylist,
    deletePlaylist,
    addVideoToPlaylist,
    removeVideoFromPlaylist,
    isVideoInPlaylist,
  ]);

  return (
    <UserLibraryContext.Provider value={value}>
      {children}
    </UserLibraryContext.Provider>
  );
}

export function useUserLibraryContext(): UserLibraryContextValue {
  const ctx = useContext(UserLibraryContext);
  if (!ctx) {
    throw new Error('useUserLibraryContext must be used within <UserLibraryProvider>');
  }
  return ctx;
}
