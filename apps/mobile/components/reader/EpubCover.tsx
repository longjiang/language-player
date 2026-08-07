import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, Image } from 'react-native';
import { BookOpen, X } from 'lucide-react-native';
import { ICON_MUTED } from '@/lib/theme-colors';

/** Generate a deterministic dark color from a string (for generated covers). */
function hashColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
    hash = hash & hash;
  }
  const h = Math.abs(hash % 360);
  const s = 40 + (Math.abs(hash >> 8) % 31);
  const l = 15 + (Math.abs(hash >> 16) % 21);
  return `hsl(${h}, ${s}%, ${l}%)`;
}

interface EpubCoverProps {
  fileName: string | null;
  epubTitle: string;
  epubAuthor: string;
  coverUrl: string | null;
  onClose: () => void;
  onOpen: () => void;
  windowHeight: number;
  t: (key: string) => string;
}

export function EpubCover({ fileName, epubTitle, epubAuthor, coverUrl, onClose, onOpen, windowHeight, t }: EpubCoverProps) {
  const [coverLoadError, setCoverLoadError] = useState(false);
  useEffect(() => { setCoverLoadError(false); }, [coverUrl]);

  const bgColor = hashColor(epubTitle || fileName || '');
  const hasCoverImage = !!coverUrl;

  return (
    <View className="flex-1 bg-background">
      <View className="px-4 py-5">
        <View className="flex-row items-center justify-between">
          <Text className="text-xl font-bold text-foreground" numberOfLines={1}>{fileName}</Text>
          <Pressable onPress={onClose} className="rounded p-1 active:bg-muted">
            <X size={18} color={ICON_MUTED} />
          </Pressable>
        </View>
      </View>
      <Pressable onPress={onOpen} className="flex-1 items-center justify-center px-4">
        {hasCoverImage ? (
          coverLoadError ? (
            <View className="items-center gap-3">
              <BookOpen size={48} color={ICON_MUTED} />
              <Text className="text-sm text-muted-foreground">{t('action.open_file')}</Text>
            </View>
          ) : (
            <Image
              source={{ uri: coverUrl ?? undefined }}
              style={{ width: '100%', height: windowHeight * 0.6 }}
              resizeMode="contain"
              onError={() => setCoverLoadError(true)}
            />
          )
        ) : (
          /* Generated cover: colored background with title + author */
          <View
            style={{ width: '100%', height: windowHeight * 0.6, backgroundColor: bgColor }}
            className="items-center justify-center rounded-lg px-6"
          >
            <Text style={{ color: 'white', fontSize: 22, fontWeight: '700', textAlign: 'center', marginBottom: 12 }}>
              {epubTitle || fileName?.replace(/\.epub$/, '')}
            </Text>
            {epubAuthor ? (
              <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 15, textAlign: 'center' }}>
                {epubAuthor}
              </Text>
            ) : null}
          </View>
        )}
        <Text className="mt-4 text-xs text-muted-foreground">{t('msg.tap_to_open')}</Text>
      </Pressable>
    </View>
  );
}
