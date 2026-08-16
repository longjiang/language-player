import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, ScrollView, ActivityIndicator } from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import type { PlaylistVideo, YouTubeVideo } from '@langplayer/shared';
import { useT } from '@/hooks/use-t';
import { useLanguage } from '@/contexts/LanguageContext';
import { useUserLibraryContext } from '@/contexts/UserLibraryContext';
import { Check } from 'lucide-react-native';
import { ICON_MUTED, PLACEHOLDER_COLOR } from '@/lib/theme-colors';
import * as Dialog from '@/components/ui/dialog';

interface AddToPlaylistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  video: YouTubeVideo | null;
}

/** Simple checkbox row (web uses <input type="checkbox">; RN has no native one). */
function CheckboxRow({
  checked,
  onPress,
  children,
}: {
  checked: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-lg px-3 py-2 active:bg-muted"
    >
      <View
        className={`h-5 w-5 items-center justify-center rounded border ${
          checked ? 'border-primary bg-primary' : 'border-border'
        }`}
      >
        {checked ? <Check size={14} color="#fff" /> : null}
      </View>
      {children}
    </Pressable>
  );
}

/**
 * Lets the user save the current video into one or more existing playlists
 * and/or a brand-new playlist. Ported from
 * apps/web/src/components/video/add-to-playlist-dialog.tsx: selecting an
 * existing playlist appends the video; deselecting does not remove it.
 */
export function AddToPlaylistDialog({ open, onOpenChange, video }: AddToPlaylistDialogProps) {
  const t = useT();
  const { l2Lang } = useLanguage();
  const l2Code = l2Lang?.code ?? '';
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

  if (!open || !video) return null;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Content>
          <Dialog.Title className="text-base font-bold text-foreground">{t('action.add_to_playlist')}</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground" numberOfLines={1}>
            {video.title ?? t('label.untitled_video')}
          </Dialog.Description>

          {!isSignedIn ? (
            <Text className="py-6 text-center text-sm text-muted-foreground">
              {t('msg.not_authenticated')}
            </Text>
          ) : !loaded ? (
            <View className="items-center justify-center py-8">
              <ActivityIndicator size="small" color={ICON_MUTED} />
            </View>
          ) : (
            <ScrollView className="mt-2 max-h-64">
              {playlists.length === 0 && !createNew ? (
                <Text className="py-2 text-center text-sm text-muted-foreground">
                  {t('msg.no_playlists')}
                </Text>
              ) : null}
              {playlists.map((playlist) => {
                const checked = selected.has(String(playlist.id));
                return (
                  <CheckboxRow
                    key={playlist.id}
                    checked={checked}
                    onPress={() => togglePlaylist(playlist.id)}
                  >
                    <Text className="min-w-0 flex-1 text-sm font-medium text-foreground" numberOfLines={1}>
                      {playlist.title}
                    </Text>
                    <Text className="text-xs text-muted-foreground">{playlist.videos.length}</Text>
                  </CheckboxRow>
                );
              })}

              <CheckboxRow
                checked={createNew}
                onPress={() => {
                  setCreateNew(!createNew);
                  setNameError(false);
                }}
              >
                <View className="min-w-0 flex-1">
                  <Text className="text-sm font-medium text-foreground">{t('action.new_playlist')}</Text>
                  {createNew ? (
                    <TextInput
                      value={newName}
                      onChangeText={(text) => {
                        setNewName(text);
                        setNameError(false);
                      }}
                      placeholder={t('label.playlist_name')}
                      placeholderTextColor={PLACEHOLDER_COLOR}
                      autoFocus
                      className={`mt-1.5 rounded-md border bg-background px-3 py-1.5 text-sm text-foreground ${
                        nameError ? 'border-destructive' : 'border-border'
                      }`}
                    />
                  ) : null}
                  {nameError ? (
                    <Text className="mt-1 text-xs text-destructive">
                      {t('msg.playlist_name_required')}
                    </Text>
                  ) : null}
                </View>
              </CheckboxRow>
            </ScrollView>
          )}

          <View className="mt-4 flex-col gap-2">
            <Dialog.Close className="w-full items-center rounded-lg px-4 py-2.5">
              <Text className="text-sm text-muted-foreground">{t('action.cancel')}</Text>
            </Dialog.Close>
            <Pressable
              onPress={() => void handleSave()}
              disabled={!isSignedIn || !loaded || saving || (!createNew && selected.size === 0)}
              className="w-full flex-row items-center justify-center rounded-lg bg-primary px-4 py-2.5 disabled:opacity-50"
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text className="text-sm font-bold text-primary-foreground">{t('action.add')}</Text>
              )}
            </Pressable>
          </View>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
