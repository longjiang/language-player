import React, { useState } from 'react';
import { View, Text, Image, FlatList, ActivityIndicator, Alert } from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { router } from 'expo-router';
import { useLanguage } from '@/contexts/LanguageContext';
import { useUserLibraryContext } from '@/contexts/UserLibraryContext';
import { useT } from '@/hooks/use-t';
import { useResponsive } from '@/hooks/use-responsive';
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
  const { width } = useResponsive();

  const l2Code = l2Lang?.code ?? '';
  const playlists = getPlaylists(l2Code);
  const numColumns = width < 640 ? 1 : width < 1024 ? 2 : 3;

  const [createOpen, setCreateOpen] = useState(false);
  const [listWidth, setListWidth] = useState(0);
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
    <Button
      onPress={openCreate}
      variant="default"
    >
      <Plus size={16} color="#fff" />
      <Text className="text-sm font-bold text-primary-foreground">{t('action.new_playlist')}</Text>
    </Button>
  );

  // Exact card width keeps incomplete last rows at normal size (no flex:1 stretch).
  const cardWidth =
    numColumns > 1 && listWidth > 0
      ? Math.floor((listWidth - 32 - 12 * (numColumns - 1)) / numColumns)
      : undefined;

  const createDialog = (
    <Dialog.Root open={createOpen} onOpenChange={setCreateOpen}>
      <Dialog.Portal>
        <Dialog.Content>
          <Dialog.Title className="text-base font-bold text-foreground">{t('action.new_playlist')}</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground">
            {t('msg.enter_playlist_name')}
          </Dialog.Description>
          <Input
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
            <Button
              onPress={() => void handleCreate()}
              disabled={creating || !name.trim()}
              variant="default"
            >
              {creating ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text className="text-sm font-bold text-primary-foreground">{t('action.create')}</Text>
              )}
            </Button>
          </View>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );

  // ── Not authenticated ──
  if (!isSignedIn) {
    return (
      <PageContainer maxWidth="5xl">
        <Text className="px-4 py-5 mb-4 text-xl font-bold text-foreground">{t('title.playlists')}</Text>
        <View className="flex-1 items-center justify-center px-8">
          <ListVideo size={40} color={ICON_MUTED} style={{ marginBottom: 12 }} />
          <Text className="text-center text-muted-foreground">{t('msg.not_authenticated')}</Text>
        </View>
        {createDialog}
      </PageContainer>
    );
  }

  // ── Loading ──
  if (!loaded) {
    return (
      <PageContainer maxWidth="5xl">
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
      <PageContainer maxWidth="5xl">
        <View className="flex-row items-center justify-between px-4 py-5">
          <Text className="text-xl font-bold text-foreground">{t('title.playlists')}</Text>
          {renderNewButton()}
        </View>
        <View className="flex-1 items-center justify-center px-8">
          <ListVideo size={40} color={ICON_MUTED} style={{ marginBottom: 12 }} />
          <Text className="text-center text-muted-foreground">{t('msg.no_playlists')}</Text>
          <View className="mt-4">{renderNewButton()}</View>
        </View>
        {createDialog}
      </PageContainer>
    );
  }

  // ── List ──
  return (
    <PageContainer maxWidth="5xl">
      <View className="flex-row items-center justify-between px-4 py-5">
        <Text className="text-xl font-bold text-foreground">{t('title.playlists')}</Text>
        {renderNewButton()}
      </View>
      <View className="flex-1" onLayout={(e) => setListWidth(e.nativeEvent.layout.width)}>
        <FlatList
          data={playlists}
          keyExtractor={(item) => String(item.id)}
          key={`playlists-${numColumns}`}
          numColumns={numColumns}
          columnWrapperStyle={numColumns > 1 ? { gap: 12 } : undefined}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }}
          renderItem={({ item }) => {
            const first = item.videos[0];
            return (
            <View
              key={item.id}
              className="mb-2 overflow-hidden rounded-xl border border-border bg-card"
              style={numColumns > 1 ? { width: cardWidth } : undefined}
            >
              <Pressable
                onPress={() => router.push(`/(tabs)/(me)/playlists/${item.id}` as any)}
                className="active:bg-muted"
              >
                {/* Thumbnail or placeholder */}
                <View className="relative aspect-video w-full bg-muted">
                  {first?.youtube_id ? (
                    <Image source={{ uri: youtubeThumbnail(first.youtube_id) }} className="h-full w-full" />
                  ) : (
                    <View className="flex-1 items-center justify-center">
                      <ListVideo size={24} color={ICON_MUTED} style={{ opacity: 0.4 }} />
                    </View>
                  )}
                  <View className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5">
                    <Text className="text-xs text-white">
                      {t('msg.playlist_video_count', { count: item.videos.length })}
                    </Text>
                  </View>
                </View>

                {/* Info */}
                <View className="p-3">
                  <Text className="text-sm font-medium text-foreground" numberOfLines={2}>
                    {item.title}
                  </Text>
                </View>
              </Pressable>

              {/* Delete */}
              <Pressable
                onPress={() => handleDelete(item)}
                disabled={deletingId === item.id}
                className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg bg-black/60 active:bg-destructive/80"
                hitSlop={8}
              >
                {deletingId === item.id ? (
                  <Loader2 size={16} color="#fff" />
                ) : (
                  <Trash2 size={16} color="#fff" />
                )}
              </Pressable>
            </View>
            );
          }}
        />
      </View>

      {createDialog}
    </PageContainer>
  );
}
