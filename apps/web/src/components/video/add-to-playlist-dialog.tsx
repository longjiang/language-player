'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { PlaylistVideo, YouTubeVideo } from '@langplayer/shared';
import { useT } from '@/hooks/use-t';
import { useLanguage } from '@/providers/language-provider';
import { useUserLibraryContext } from '@/providers/user-library-provider';
import { baseCode } from '@/lib/language-data';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface AddToPlaylistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  video: YouTubeVideo | null;
}

/**
 * Lets the user save the current video into one or more existing playlists
 * and/or a brand-new playlist. Mirrors Classic's AddToPlaylist.vue behavior:
 * selecting an existing playlist appends the video; deselecting does not
 * remove it.
 */
export function AddToPlaylistDialog({ open, onOpenChange, video }: AddToPlaylistDialogProps) {
  const t = useT();
  const { l2 } = useLanguage();
  const l2Code = baseCode(l2.code);
  const {
    loaded,
    isSignedIn,
    getPlaylists,
    createPlaylist,
    addVideoToPlaylist,
    isVideoInPlaylist,
  } = useUserLibraryContext();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [createNew, setCreateNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState(false);

  const playlists = useMemo(() => getPlaylists(l2Code), [getPlaylists, l2Code]);

  const videoData = useMemo<PlaylistVideo | null>(() => {
    if (!video) return null;
    return {
      id: video.id ?? undefined,
      youtube_id: video.youtube_id,
      title: video.title,
      duration: video.duration,
    };
  }, [video]);

  // Reset selection whenever the dialog opens or playlists/video change.
  useEffect(() => {
    if (!open || !videoData) return;
    setSelected(new Set(
      playlists
        .filter((playlist) => isVideoInPlaylist(playlist, videoData))
        .map((playlist) => String(playlist.id)),
    ));
    setCreateNew(false);
    setNewName('');
    setNameError(false);
  }, [open, videoData, playlists, isVideoInPlaylist]);

  if (!open || !video) return null;

  const togglePlaylist = (id: string | number) => {
    const key = String(id);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSave = async () => {
    if (!videoData || saving) return;
    const trimmedName = newName.trim();
    if (createNew && !trimmedName) {
      setNameError(true);
      return;
    }

    setSaving(true);
    if (createNew && trimmedName) {
      await createPlaylist(l2Code, trimmedName, [videoData]);
    }

    for (const id of selected) {
      await addVideoToPlaylist(l2Code, id, videoData);
    }

    setSaving(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('action.add_to_playlist')}</DialogTitle>
          <DialogDescription className="line-clamp-1">
            {video.title ?? t('label.untitled_video')}
          </DialogDescription>
        </DialogHeader>

        {!isSignedIn ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t('msg.not_authenticated')}
          </p>
        ) : !loaded ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {playlists.length === 0 && !createNew && (
              <p className="py-2 text-center text-sm text-muted-foreground">
                {t('msg.no_playlists')}
              </p>
            )}
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {playlists.map((playlist) => {
                const checked = selected.has(String(playlist.id));
                return (
                  <label
                    key={playlist.id}
                    className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-muted"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primary"
                      checked={checked}
                      onChange={() => togglePlaylist(playlist.id)}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {playlist.title}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {playlist.videos.length}
                    </span>
                  </label>
                );
              })}

              <label className="flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-muted">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-primary"
                  checked={createNew}
                  onChange={(e) => {
                    setCreateNew(e.target.checked);
                    setNameError(false);
                  }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{t('action.new_playlist')}</span>
                  {createNew && (
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => {
                        setNewName(e.target.value);
                        setNameError(false);
                      }}
                      placeholder={t('label.playlist_name')}
                      className={cn(
                        'mt-1.5 w-full rounded-md border bg-background px-3 py-1.5 text-sm outline-none transition-colors focus:ring-2 focus:ring-ring',
                        nameError ? 'border-destructive' : 'border-border',
                      )}
                      autoFocus
                    />
                  )}
                  {nameError && (
                    <span className="mt-1 block text-xs text-destructive">
                      {t('msg.playlist_name_required')}
                    </span>
                  )}
                </span>
              </label>
            </div>
          </>
        )}

        <DialogFooter showCloseButton>
          <Button
            onClick={handleSave}
            disabled={!isSignedIn || !loaded || saving || (!createNew && selected.size === 0)}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t('action.add')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
