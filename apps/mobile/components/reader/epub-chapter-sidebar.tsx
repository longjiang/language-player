import React from 'react';
import { View, Text } from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import type { TocItem } from '@/lib/epub-parser';

interface EpubChapterSidebarProps {
  toc: TocItem[];
  chapterHref: string | null;
  onSelect: (href: string) => void;
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

/** Matches Next.js's epub-chapter-sidebar: content-only TOC tree. */
export function EpubChapterSidebar({
  toc, chapterHref, onSelect,
}: EpubChapterSidebarProps) {
  return (
    <View className="p-2">
      <TocTree
        items={toc}
        currentHref={chapterHref}
        onSelect={onSelect}
      />
    </View>
  );
}
