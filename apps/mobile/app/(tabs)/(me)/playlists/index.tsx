import React, { useState } from 'react';
import { View, Text, Pressable, Image, FlatList, ActivityIndicator, Alert, TextInput } from 'react-native';
import { router } from 'expo-router';
import { useLanguage } from '@/contexts/LanguageContext';
import { useUserLibraryContext } from '@/contexts/UserLibraryContext';
import { useT } from '@/hooks/use-t';
import { ListVideo, Plus, Trash2, Loader2 } from 'lucide-react-native';
import { ICON_MUTED, ICON_DESTRUCTIVE, PLACEHOLDER_COLOR } from '@/lib/theme-colors';
import type { Playlist } from '@langplayer/shared';
import * as Dialog from '@/components/ui/dialog';
import { PageContainer } from '@/components/layout/PageContainer';

function youtubeThumbnail(id: string): string {
  return `https://img.youtube.com/vi/${id}/mqdefault.jpg`;
}

export default function PlaylistsScreen() {
  const { l2Lang } = useLanguage();
  const { loaded, isSignedIn, getPlaylists, createPlaylist, deletePlaylist } = useUserLibraryContext();
  const t = useT();

  const l2Code = l2Lang?.code ?? '';
  const playlists = getPlaylists(l2Code);

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | number | null>(null);

  const openCreate = () => {
    setName('');
    setCreateOpen(true);
  };

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

  const handleDelete = (playlist: Playlist) => {
    Alert.alert(
      t('action.delete_playlist'),
      t('msg.confirm_delete_playlist', { title: playlist.title }),
      [
        { text: t('action.cancel'), style: 'cancel' },
        {
          text: t('action.delete_playlist'),
          style: 'destructive',
          onPress: async () => {
            setDeletingId(playlist.id);
            await deletePlaylist(l2Code, playlist.id);
            setDeletingId(null);
          },
        },
      ],
    );
  };

  const renderNewButton = () => (
    <Pressable
      onPress={openCreate}
      className="flex-row items-center gap-1 rounded-lg bg-primary px-3 py-2 active:opacity-90"
    >
      <Plus size={16} color="#fff" />
      <Text className="text-sm font-bold text-primary-foreground">{t('action.new_playlist')}</Text>
    </Pressable>
  );

  // ── Not authenticated ──
  if (!isSignedIn) {
    return (
      <PageContainer>
        <Text className="px-4 py-5 mb-4 text-xl font-bold text-foreground">{t('title.playlists')}</Text>
        <View className="flex-1 items-center justify-center px-8">
          <ListVideo size={40} className="mb-3 text-muted-foreground" />
          <Text className="text-center text-muted-foreground">{t('msg.not_authenticated')}</Text>
        </View>
      </PageContainer>
    );
  }

  // ── Loading ──
  if (!loaded) {
    return (
      <PageContainer>
        <Text className="px-4 py-5 mb-4 text-xl font-bold text-foreground">{t('title.playlists')}</Text>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" className="text-primary" />
        </View>
      </PageContainer>
    );
  }

  // ── Empty ──
  if (playlists.length === 0) {
    return (
      <PageContainer>
        <View className="flex-row items-center justify-between px-4 py-5">
          <Text className="text-xl font-bold text-foreground">{t('title.playlists')}</Text>
          {renderNewButton()}
        </View>
        <View className="flex-1 items-center justify-center px-8">
          <ListVideo size={40} className="mb-3 text-muted-foreground" />
          <Text className="text-center text-muted-foreground">{t('msg.no_playlists')}</Text>
          <View className="mt-4">{renderNewButton()}</View>
        </View>
      </PageContainer>
    );
  }

  // ── List ──
  return (
    <PageContainer>
      <View className="flex-row items-center justify-between px-4 py-5">
        <Text className="text-xl font-bold text-foreground">{t('title.playlists')}</Text>
        {renderNewButton()}
      </View>
      <FlatList
        data={playlists}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }}
        renderItem={({ item }) => {
          const first = item.videos[0];
          return (
            <Pressable
              onPress={() => router.push(`/(tabs)/(me)/playlists/${item.id}` as any)}
              className="mb-2 flex-row items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 active:bg-muted"
            >
              {/* Thumbnail or placeholder */}
              <View className="relative h-14 w-24 overflow-hidden rounded bg-muted">
                {first?.youtube_id ? (
                  <Image source={{ uri: youtubeThumbnail(first.youtube_id) }} className="h-full w-full" />
                ) : (
                  <View className="flex-1 items-center justify-center">
                    <ListVideo size={20} className="text-muted-foreground/40" />
                  </View>
                )}
                <View className="absolute bottom-0.5 right-0.5 rounded bg-black/70 px-1">
                  <Text className="text-[10px] text-white">
                    {t('msg.playlist_video_count', { count: item.videos.length })}
                  </Text>
                </View>
              </View>

              {/* Info */}
              <View className="flex-1 min-w-0">
                <Text className="text-sm font-medium text-foreground" numberOfLines={2}>
                  {item.title}
                </Text>
              </View>

              {/* Delete */}
              <Pressable
                onPress={() => handleDelete(item)}
                disabled={deletingId === item.id}
                className="flex h-9 w-9 items-center justify-center rounded-lg active:bg-destructive/10"
                hitSlop={8}
              >
                {deletingId === item.id ? (
                  <Loader2 size={16} color={ICON_MUTED} />
                ) : (
                  <Trash2 size={16} color={ICON_DESTRUCTIVE} />
                )}
              </Pressable>
            </Pressable>
          );
        }}
      />

      {/* Create dialog */}
      <Dialog.Root open={createOpen} onOpenChange={setCreateOpen}>
        <Dialog.Portal>
          <Dialog.Content>
            <Dialog.Title className="text-base font-bold text-foreground">{t('action.new_playlist')}</Dialog.Title>
            <Dialog.Description className="mt-1 text-sm text-muted-foreground">
              {t('msg.enter_playlist_name')}
            </Dialog.Description>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={t('label.playlist_name')}
              placeholderTextColor={PLACEHOLDER_COLOR}
              autoFocus
              className="mt-3 rounded-lg border border-border bg-background px-3 py-2.5 text-foreground"
              onSubmitEditing={() => void handleCreate()}
              returnKeyType="done"
            />
            <View className="mt-4 flex-row justify-end gap-2">
              <Dialog.Close className="rounded-lg px-4 py-2.5">
                <Text className="text-sm text-muted-foreground">{t('action.cancel')}</Text>
              </Dialog.Close>
              <Pressable
                onPress={() => void handleCreate()}
                disabled={creating || !name.trim()}
                className="flex-row items-center rounded-lg bg-primary px-4 py-2.5 disabled:opacity-50"
              >
                {creating ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text className="text-sm font-bold text-primary-foreground">{t('action.create')}</Text>
                )}
              </Pressable>
            </View>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </PageContainer>
  );
}
