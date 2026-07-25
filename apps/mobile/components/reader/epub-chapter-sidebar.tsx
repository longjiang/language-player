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

/** Recursively render TOC items with indentation (matches web's TocTree). */
function TocTree({
  items,
  currentHref,
  onSelect,
  depth = 0,
}: {
  items: TocItem[];
  currentHref: string | null;
  onSelect: (href: string) => void;
  depth?: number;
}) {
  return (
    <>
      {items.map((item, i) => (
        <View key={`${depth}-${i}`}>
          <Pressable
            onPress={() => onSelect(item.href)}
            className={`px-3 py-1.5 active:bg-muted ${
              currentHref === item.href ? 'bg-primary/10' : ''
            }`}
            style={{ paddingLeft: 12 + depth * 16 }}
          >
            <Text
              className={`text-sm truncate ${
                currentHref === item.href
                  ? 'font-medium text-primary'
                  : 'text-foreground'
              }`}
              numberOfLines={1}
            >
              {item.label}
            </Text>
          </Pressable>
          {item.children && item.children.length > 0 && (
            <TocTree
              items={item.children}
              currentHref={currentHref}
              onSelect={onSelect}
              depth={depth + 1}
            />
          )}
        </View>
      ))}
    </>
  );
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
        <TocTree
          items={toc}
          currentHref={chapterHref}
          onSelect={onSelect}
        />
      </ScrollView>
    </View>
  );
}
