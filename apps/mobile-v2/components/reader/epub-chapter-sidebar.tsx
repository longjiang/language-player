import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { ChevronLeft, ChevronRight, PanelLeftClose } from 'lucide-react-native';
import { ICON_MUTED } from '@/lib/theme-colors';
import type { TocItem } from '@/lib/epub-parser';

interface EpubChapterSidebarProps {
  toc: TocItem[];
  chapterHref: string | null;
  prevHref: string | null;
  nextHref: string | null;
  onSelect: (href: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}

/** Matches Next.js's epub-chapter-sidebar: togglable panel with TOC + prev/next. */
export function EpubChapterSidebar({
  toc, chapterHref, prevHref, nextHref,
  onSelect, onPrev, onNext, onClose,
}: EpubChapterSidebarProps) {
  return (
    <View className="w-56 border-l border-border bg-card">
      <View className="flex-row items-center justify-between border-b border-border px-3 py-2">
        <View className="flex-row gap-1">
          <Pressable onPress={onPrev} className="rounded p-1 active:bg-muted" disabled={!prevHref}>
            <ChevronLeft size={14} color={prevHref ? ICON_MUTED : '#555'} />
          </Pressable>
          <Pressable onPress={onNext} className="rounded p-1 active:bg-muted" disabled={!nextHref}>
            <ChevronRight size={14} color={nextHref ? ICON_MUTED : '#555'} />
          </Pressable>
        </View>
        <Pressable onPress={onClose} className="rounded p-1 active:bg-muted">
          <PanelLeftClose size={16} color={ICON_MUTED} />
        </Pressable>
      </View>
      <ScrollView className="flex-1">
        {toc.map((item, idx) => (
          <Pressable
            key={idx}
            onPress={() => onSelect(item.href)}
            className={`px-3 py-2 active:bg-muted ${chapterHref === item.href ? 'bg-primary/10' : ''}`}
          >
            <Text
              className={`text-sm truncate ${chapterHref === item.href ? 'font-medium text-primary' : 'text-foreground'}`}
              numberOfLines={1}
            >
              {item.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
