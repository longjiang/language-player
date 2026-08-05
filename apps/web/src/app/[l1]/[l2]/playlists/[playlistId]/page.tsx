'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Clock,
  ListVideo,
  Loader2,
  Pencil,
  Play,
  Trash2,
} from 'lucide-react';
import type { Playlist, PlaylistVideo, YouTubeVideo } from '@langplayer/shared';
import { useLanguage } from '@/providers/language-provider';
import { useUserLibraryContext } from '@/providers/user-library-provider';
import { useVideoPlayer } from '@/providers/video-player-provider';
import { useT } from '@/hooks/use-t';
import { baseCode } from '@/lib/language-data';
import { youtubeThumbnail } from '@/lib/video-service';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

function formatDuration(duration: number | string | undefined): string {
  if (duration == null || duration === '') return '';
  let seconds: number;
  if (typeof duration === 'string') {
    const m = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/);
    seconds = m
      ? (parseInt(m[1] ?? '0', 10) * 3600) + (parseInt(m[2] ?? '0', 10) * 60) + parseFloat(m[3] ?? '0')
      : parseFloat(duration);
    if (isNaN(seconds)) return '';
  } else {
    seconds = duration;
  }
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function parseDurationSeconds(duration: number | string | undefined): number | undefined {
  if (duration == null) return undefined;
  if (typeof duration === 'number') return duration;
  const m = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/);
  const seconds = m
    ? (parseInt(m[1] ?? '0', 10) * 3600) + (parseInt(m[2] ?? '0', 10) * 60) + parseFloat(m[3] ?? '0')
    : parseFloat(duration);
  return isNaN(seconds) ? undefined : seconds;
}

export default function PlaylistDetailPage() {
  const params = useParams<{ playlistId: string }>();
  const router = useRouter();
  const { l1, l2 } = useLanguage();
  const t = useT();
  const l2Code = baseCode(l2.code);
  const {
    loaded,
    isSignedIn,
    getPlaylist,
    renamePlaylist,
    deletePlaylist,
    removeVideoFromPlaylist,
  } = useUserLibraryContext();
  const { playVideo } = useVideoPlayer();

  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [removingKey, setRemovingKey] = useState<string | null>(null);

  const playlistId = params.playlistId;

  useEffect(() => {
    let cancelled = false;
    if (!isSignedIn || !playlistId) return;
    (async () => {
      const found = await getPlaylist(l2Code, playlistId);
      if (cancelled) return;
      if (found) {
        setPlaylist(found);
        setNotFound(false);
      } else {
        setPlaylist(null);
        setNotFound(true);
      }
    })();
    return () => { cancelled = true; };
  }, [getPlaylist, isSignedIn, l2Code, playlistId]);

  const handlePlay = useCallback((video: PlaylistVideo, index: number) => {
    if (!playlist) return;
    const queue: YouTubeVideo[] = playlist.videos.map((v) => ({
      youtube_id: v.youtube_id,
      id: v.id != null ? String(v.id) : undefined,
      title: v.title,
      duration: parseDurationSeconds(v.duration),
    }));
    playVideo(queue[index]!, queue, 'recommended');
  }, [playlist, playVideo]);

  const handleRemove = async (video: PlaylistVideo) => {
    if (!playlist) return;
    if (!window.confirm(t('msg.confirm_remove_video'))) return;
    setRemovingKey(video.youtube_id);
    await removeVideoFromPlaylist(l2Code, playlist.id, video);
    setPlaylist((prev) => prev ? { ...prev, videos: prev.videos.filter((v) => v.youtube_id !== video.youtube_id) } : prev);
    setRemovingKey(null);
  };

  const handleRename = async () => {
    if (!playlist || !renameValue.trim() || renaming) return;
    setRenaming(true);
    const ok = await renamePlaylist(l2Code, playlist.id, renameValue.trim());
    setRenaming(false);
    if (ok) {
      setPlaylist((prev) => prev ? { ...prev, title: renameValue.trim() } : prev);
      setRenameOpen(false);
    }
  };

  const handleDelete = async () => {
    if (!playlist) return;
    if (!window.confirm(t('msg.confirm_delete_playlist', { title: playlist.title }))) return;
    await deletePlaylist(l2Code, playlist.id);
    router.push(`/${l1.code}/${l2.code}/playlists`);
  };

  if (!isSignedIn) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center">
        <p className="text-muted-foreground">{t('msg.not_authenticated')}</p>
        <Link href="/login" className="mt-3 inline-block text-sm font-medium text-primary hover:underline">
          {t('action.log_in')}
        </Link>
      </div>
    );
  }

  if (!loaded || (!playlist && !notFound)) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound || !playlist) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center">
        <ListVideo className="mx-auto h-12 w-12 text-muted-foreground/50" />
        <p className="mt-4 text-muted-foreground">{t('msg.playlist_not_found')}</p>
        <Link href={`/${l1.code}/${l2.code}/playlists`} className="mt-3 inline-block text-sm font-medium text-primary hover:underline">
          {t('title.playlists')}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <Link
        href={`/${l1.code}/${l2.code}/playlists`}
        className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {t('title.playlists')}
      </Link>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-3xl font-bold">
            <ListVideo className="h-7 w-7 shrink-0 text-primary" />
            <span className="truncate">{playlist.title}</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('msg.playlist_video_count', { count: playlist.videos.length })}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setRenameValue(playlist.title);
              setRenameOpen(true);
            }}
          >
            <Pencil className="h-4 w-4" />
            {t('action.rename_playlist')}
          </Button>
          <Button variant="destructive" onClick={handleDelete}>
            <Trash2 className="h-4 w-4" />
            {t('action.delete_playlist')}
          </Button>
        </div>
      </div>

      {playlist.videos.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border p-12 text-center">
          <ListVideo className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-muted-foreground">{t('msg.playlist_empty')}</p>
        </div>
      ) : (
        <div className="space-y-1">
          {playlist.videos.map((video, index) => {
            const duration = formatDuration(video.duration);
            return (
              <div
                key={`${video.youtube_id}-${index}`}
                className="group flex items-center gap-4 rounded-lg px-3 py-2 transition-colors hover:bg-muted/50"
              >
                <button
                  type="button"
                  onClick={() => handlePlay(video, index)}
                  className="relative h-16 w-28 flex-shrink-0 overflow-hidden rounded bg-muted"
                  aria-label={t('a11y.play')}
                >
                  <img
                    src={youtubeThumbnail(video.youtube_id)}
                    alt=""
                    className="h-full w-full object-cover transition-opacity group-hover:opacity-90"
                    loading="lazy"
                  />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/20">
                    <Play className="h-6 w-6 text-white opacity-0 transition-opacity group-hover:opacity-100" fill="white" />
                  </span>
                </button>

                <div className="min-w-0 flex-1">
                  <h3 className="line-clamp-2 text-sm font-medium group-hover:text-primary transition-colors">
                    {video.title ?? t('label.untitled_video')}
                  </h3>
                  {duration && (
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {duration}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => handleRemove(video)}
                  disabled={removingKey === video.youtube_id}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                  aria-label={t('action.remove_from_playlist')}
                  title={t('action.remove_from_playlist')}
                >
                  {removingKey === video.youtube_id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('action.rename_playlist')}</DialogTitle>
            <DialogDescription>{t('msg.enter_playlist_name')}</DialogDescription>
          </DialogHeader>
          <input
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleRename();
            }}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:ring-2 focus:ring-ring"
            autoFocus
          />
          <DialogFooter showCloseButton>
            <Button onClick={handleRename} disabled={renaming || !renameValue.trim()}>
              {renaming ? <Loader2 className="h-4 w-4 animate-spin" /> : t('action.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
