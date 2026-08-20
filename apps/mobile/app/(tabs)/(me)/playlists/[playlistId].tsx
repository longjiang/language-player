import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Image, FlatList, ActivityIndicator, Alert } from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import { Button, buttonTextClass } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLocalSearchParams, router } from 'expo-router';
import { useLanguage } from '@/contexts/LanguageContext';
import { useUserLibraryContext } from '@/contexts/UserLibraryContext';
import { useVideoPlayer } from '@/contexts/VideoPlayerContext';
import { useT } from '@/hooks/use-t';
import { ListVideo, Clock, Pencil, Play, Trash2, Loader2 } from 'lucide-react-native';
import { ICON_MUTED, ICON_DESTRUCTIVE, PLACEHOLDER_COLOR } from '@/lib/theme-colors';
import type { Playlist, PlaylistVideo, YouTubeVideo } from '@langplayer/shared';
import * as Dialog from '@/components/ui/dialog';
import { PageContainer } from '@/components/layout/PageContainer';

function youtubeThumbnail(id: string): string {
  return `https://img.youtube.com/vi/${id}/mqdefault.jpg`;
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

function formatDuration(duration: number | string | undefined): string {
  const seconds = parseDurationSeconds(duration);
  if (seconds == null || seconds < 0) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function PlaylistDetailScreen() {
  const params = useLocalSearchParams<{ playlistId: string }>();
  const { l2Lang } = useLanguage();
  const { loaded, isSignedIn, getPlaylist, renamePlaylist, deletePlaylist, removeVideoFromPlaylist } = useUserLibraryContext();
  const { playVideo } = useVideoPlayer();
  const t = useT();

  const l2Code = l2Lang?.code ?? '';
  const playlistId = params.playlistId;

  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [removingKey, setRemovingKey] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  const handleRemove = (video: PlaylistVideo) => {
    if (!playlist) return;
    Alert.alert(
      t('action.remove_from_playlist'),
      t('msg.confirm_remove_video'),
      [
        { text: t('action.cancel'), style: 'cancel' },
        {
          text: t('action.remove_from_playlist'),
          style: 'destructive',
          onPress: async () => {
            setRemovingKey(video.youtube_id);
            await removeVideoFromPlaylist(l2Code, playlist.id, video);
            setPlaylist((prev) => prev ? { ...prev, videos: prev.videos.filter((v) => v.youtube_id !== video.youtube_id) } : prev);
            setRemovingKey(null);
          },
        },
      ],
    );
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

  const handleDelete = () => {
    if (!playlist) return;
    Alert.alert(
      t('action.delete_playlist'),
      t('msg.confirm_delete_playlist', { title: playlist.title }),
      [
        { text: t('action.cancel'), style: 'cancel' },
        {
          text: t('action.delete_playlist'),
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            await deletePlaylist(l2Code, playlist.id);
            setDeleting(false);
            router.back();
          },
        },
      ],
    );
  };

  // ── Not authenticated ──
  if (!isSignedIn) {
    return (
      <PageContainer maxWidth="4xl">
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-center text-base text-muted-foreground">{t('msg.not_authenticated')}</Text>
        </View>
      </PageContainer>
    );
  }

  // ── Loading ──
  if (!loaded || (!playlist && !notFound)) {
    return (
      <PageContainer maxWidth="4xl">
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" className="text-primary" />
        </View>
      </PageContainer>
    );
  }

  // ── Not found ──
  if (notFound || !playlist) {
    return (
      <PageContainer maxWidth="4xl">
        <View className="flex-1 items-center justify-center px-8">
          <ListVideo size={40} color={ICON_MUTED} style={{ marginBottom: 12 }} />
          <Text className="text-center text-base text-muted-foreground">{t('msg.playlist_not_found')}</Text>
          <Button
            onPress={() => router.push('/(tabs)/(me)/playlists' as any)}
            variant="link"
            className="mt-3"
          >
            <Text className={buttonTextClass('link')}>{t('title.playlists')}</Text>
          </Button>
        </View>
      </PageContainer>
    );
  }

  // ── Empty ──
  if (playlist.videos.length === 0) {
    return (
      <PageContainer maxWidth="4xl">
        <View className="px-4 py-5">
          <Text className="text-3xl font-bold text-foreground" numberOfLines={1}>{playlist.title}</Text>
          <Text className="mt-1 text-sm text-muted-foreground">
            {t('msg.playlist_video_count', { count: playlist.videos.length })}
          </Text>
        </View>
        <View className="flex-1 items-center justify-center px-8">
          <ListVideo size={40} color={ICON_MUTED} style={{ marginBottom: 12 }} />
          <Text className="text-center text-base text-muted-foreground">{t('msg.playlist_empty')}</Text>
        </View>
      </PageContainer>
    );
  }

  // ── List ──
  return (
    <PageContainer maxWidth="4xl">
      {/* Header */}
      <View className="flex-row items-center justify-between gap-3 px-4 py-5">
        <View className="flex-1 min-w-0">
          <Text className="text-3xl font-bold text-foreground" numberOfLines={1}>{playlist.title}</Text>
          <Text className="mt-1 text-sm text-muted-foreground">
            {t('msg.playlist_video_count', { count: playlist.videos.length })}
          </Text>
        </View>
        <View className="flex-row gap-2">
          <Button
            onPress={() => {
              setRenameValue(playlist.title);
              setRenameOpen(true);
            }}
            variant="outline"
          >
            <Pencil size={14} color={ICON_MUTED} />
            <Text className={buttonTextClass('outline')}>{t('action.rename_playlist')}</Text>
          </Button>
          <Pressable
            onPress={handleDelete}
            disabled={deleting}
            className="flex-row items-center gap-1 rounded-lg border border-destructive/30 px-3 py-2 active:bg-destructive/10"
          >
            {deleting ? (
              <ActivityIndicator size="small" className="text-destructive" />
            ) : (
              <Trash2 size={14} color={ICON_DESTRUCTIVE} />
            )}
            <Text className="text-sm text-destructive">{t('action.delete_playlist')}</Text>
          </Pressable>
        </View>
      </View>

      <FlatList
        data={playlist.videos}
        keyExtractor={(item, index) => `${item.youtube_id}-${index}`}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }}
        renderItem={({ item, index }) => {
          const duration = formatDuration(item.duration);
          return (
            <View className="mb-1 flex-row items-center gap-3 rounded-lg border border-border px-3 py-2">
              {/* Play button / thumbnail */}
              <Pressable onPress={() => handlePlay(item, index)} className="relative h-14 w-24 overflow-hidden rounded bg-muted">
                <Image source={{ uri: youtubeThumbnail(item.youtube_id) }} className="h-full w-full" />
                <View className="absolute inset-0 items-center justify-center">
                  <Play size={18} color="#fff" fill="#fff" />
                </View>
              </Pressable>

              {/* Info */}
              <Pressable onPress={() => handlePlay(item, index)} className="flex-1 min-w-0">
                <Text className="text-sm font-medium text-foreground" numberOfLines={2}>
                  {item.title ?? t('label.untitled_video')}
                </Text>
                {duration ? (
                  <View className="mt-1 flex-row items-center gap-1">
                    <Clock size={12} className="text-muted-foreground" />
                    <Text className="text-xs text-muted-foreground">{duration}</Text>
                  </View>
                ) : null}
              </Pressable>

              {/* Remove */}
              <Pressable
                onPress={() => handleRemove(item)}
                disabled={removingKey === item.youtube_id}
                className="flex h-9 w-9 items-center justify-center rounded-lg active:bg-destructive/10"
                hitSlop={8}
              >
                {removingKey === item.youtube_id ? (
                  <Loader2 size={16} color={ICON_MUTED} />
                ) : (
                  <Trash2 size={16} color={ICON_MUTED} />
                )}
              </Pressable>
            </View>
          );
        }}
      />

      {/* Rename dialog */}
      <Dialog.Root open={renameOpen} onOpenChange={setRenameOpen}>
        <Dialog.Portal>
          <Dialog.Content>
            <Dialog.Title className="text-base font-bold text-foreground">{t('action.rename_playlist')}</Dialog.Title>
            <Dialog.Description className="mt-1 text-sm text-muted-foreground">
              {t('msg.enter_playlist_name')}
            </Dialog.Description>
            <Input
              value={renameValue}
              onChangeText={setRenameValue}
              placeholder={t('label.playlist_name')}
              placeholderTextColor={PLACEHOLDER_COLOR}
              autoFocus
              className="mt-3"
              onSubmitEditing={() => void handleRename()}
              returnKeyType="done"
            />
            <View className="mt-4 flex-row justify-end gap-2">
              <Dialog.Close className="rounded-lg px-4 py-2.5">
                <Text className="text-sm text-muted-foreground">{t('action.cancel')}</Text>
              </Dialog.Close>
              <Button
                onPress={() => void handleRename()}
                disabled={renaming || !renameValue.trim()}
                variant="default"
              >
                {renaming ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text className={buttonTextClass('default')}>{t('action.save')}</Text>
                )}
              </Button>
            </View>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </PageContainer>
  );
}
