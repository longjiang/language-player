'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Loader2,
  ListVideo,
  Plus,
  Trash2,
  ArrowLeft,
} from 'lucide-react';
import { useLanguage } from '@/providers/language-provider';
import { useUserLibraryContext } from '@/providers/user-library-provider';
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
import type { Playlist } from '@langplayer/shared';

export default function PlaylistsPage() {
  const { l1, l2 } = useLanguage();
  const t = useT();
  const l2Code = baseCode(l2.code);
  const {
    loaded,
    isSignedIn,
    getPlaylists,
    createPlaylist,
    deletePlaylist,
  } = useUserLibraryContext();

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | number | null>(null);

  const playlists = getPlaylists(l2Code);

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    const playlist = await createPlaylist(l2Code, trimmed);
    setCreating(false);
    if (playlist) {
      setName('');
      setCreateOpen(false);
    }
  };

  const handleDelete = async (playlist: Playlist) => {
    if (!window.confirm(t('msg.confirm_delete_playlist', { title: playlist.title }))) return;
    setDeletingId(playlist.id);
    await deletePlaylist(l2Code, playlist.id);
    setDeletingId(null);
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <Link
            href={`/${l1.code}/${l2.code}/profile`}
            className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {t('title.profile')}
          </Link>
          <h1 className="flex items-center gap-2 text-3xl font-bold">
            <ListVideo className="h-7 w-7 text-primary" />
            {t('title.playlists')}
          </h1>
        </div>
        {isSignedIn && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            {t('action.new_playlist')}
          </Button>
        )}
      </div>

      {!isSignedIn ? (
        <div className="rounded-2xl border-2 border-dashed border-border p-12 text-center">
          <ListVideo className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-muted-foreground">{t('msg.not_authenticated')}</p>
          <Link href="/login" className="mt-3 inline-block text-sm font-medium text-primary hover:underline">
            {t('action.log_in')}
          </Link>
        </div>
      ) : !loaded ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : playlists.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border p-12 text-center">
          <ListVideo className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-muted-foreground">{t('msg.no_playlists')}</p>
          <Button className="mt-4" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            {t('action.new_playlist')}
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {playlists.map((playlist) => {
            const first = playlist.videos[0];
            return (
              <div
                key={playlist.id}
                className="group relative overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-primary/30 hover:shadow-lg"
              >
                <Link
                  href={`/${l1.code}/${l2.code}/playlists/${playlist.id}`}
                  className="block"
                >
                  <div className="relative aspect-video overflow-hidden bg-muted">
                    {first?.youtube_id ? (
                      <img
                        src={youtubeThumbnail(first.youtube_id)}
                        alt=""
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <ListVideo className="h-10 w-10 text-muted-foreground/40" />
                      </div>
                    )}
                    <span className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-xs font-medium text-white">
                      {t('msg.playlist_video_count', { count: playlist.videos.length })}
                    </span>
                  </div>
                  <div className="p-3">
                    <h2 className="line-clamp-2 text-sm font-medium leading-snug group-hover:text-primary">
                      {playlist.title}
                    </h2>
                  </div>
                </Link>
                <button
                  type="button"
                  onClick={() => handleDelete(playlist)}
                  disabled={deletingId === playlist.id}
                  className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-destructive disabled:opacity-50"
                  aria-label={t('action.delete_playlist')}
                  title={t('action.delete_playlist')}
                >
                  {deletingId === playlist.id ? (
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

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('action.new_playlist')}</DialogTitle>
            <DialogDescription>{t('msg.enter_playlist_name')}</DialogDescription>
          </DialogHeader>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleCreate();
            }}
            placeholder={t('label.playlist_name')}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:ring-2 focus:ring-ring"
            autoFocus
          />
          <DialogFooter showCloseButton>
            <Button onClick={handleCreate} disabled={creating || !name.trim()}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : t('action.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
