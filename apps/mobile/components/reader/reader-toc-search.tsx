import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import { useT } from '@/hooks/use-t';
import { ICON_MUTED } from '@/lib/theme-colors';
import { X } from 'lucide-react-native';
import { ReaderHeadingToc, extractHeadings, type ReaderHeading } from '@/components/reader/ReaderHeadingToc';
import { EpubSearchPanel } from '@/components/reader/EpubSearchPanel';
import type { ContentBlock } from '@/lib/parse-markdown';

/** Active search-match highlight (block + char range). */
export interface ReaderHighlight {
  blockIndex: number;
  start: number;
  end: number;
}

interface UseReaderTocSearchArgs {
  /** The reader's block stream. */
  blocks: ContentBlock[] | null;
  /** Jump the reader straight to a global block index. */
  goToBlock: (blockIndex: number) => void;
  /** Current global block index (first text block on the visible page). */
  currentBlockIndex?: number | null;
}

/** Heading TOC + search state and handlers, shared by the notes and web readers. */
export function useReaderTocSearch({ blocks, goToBlock, currentBlockIndex }: UseReaderTocSearchArgs) {
  const headings = useMemo(() => extractHeadings(blocks), [blocks]);
  const [tocOpen, setTocOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [highlight, setHighlight] = useState<ReaderHighlight | null>(null);

  const openToc = useCallback(() => setTocOpen(true), []);
  const openSearch = useCallback(() => setSearchOpen(true), []);

  const handleTocSelect = useCallback((heading: ReaderHeading) => {
    setTocOpen(false);
    setHighlight(null);
    goToBlock(heading.blockIndex);
  }, [goToBlock]);

  const handleSearchSelect = useCallback((match: ReaderHighlight) => {
    setSearchOpen(false);
    setHighlight(match);
    goToBlock(match.blockIndex);
  }, [goToBlock]);

  return {
    headings,
    tocOpen,
    setTocOpen,
    searchOpen,
    setSearchOpen,
    highlight,
    openToc,
    openSearch,
    handleTocSelect,
    handleSearchSelect,
    currentBlockIndex,
  };
}

interface ReaderTocSearchOverlaysProps {
  headings: ReaderHeading[];
  tocOpen: boolean;
  onTocClose: () => void;
  onTocSelect: (heading: ReaderHeading) => void;
  searchOpen: boolean;
  onSearchClose: () => void;
  onSearchSelect: (match: ReaderHighlight) => void;
  /** The reader's block stream (searched). */
  blocks: ContentBlock[] | null;
  /** Optional TOC icon visible in the bottom bar (not rendered here). */
  activeIndex?: number | null;
}

/** Renders the TOC + Search modals for the notes/web readers (native parity). */
export function ReaderTocSearchOverlays({
  headings,
  tocOpen,
  onTocClose,
  onTocSelect,
  searchOpen,
  onSearchClose,
  onSearchSelect,
  blocks,
  activeIndex,
}: ReaderTocSearchOverlaysProps) {
  const t = useT();
  return (
    <>
      {/* ── TOC modal (heading-derived, nested) ── */}
      {headings.length > 0 && (
        <Modal
          visible={tocOpen}
          transparent
          animationType="fade"
          onRequestClose={onTocClose}
        >
          <View className="flex-1 items-center justify-center bg-black/40 px-6">
            <View className="max-h-[85%] w-full max-w-md overflow-hidden rounded-xl border border-border bg-card shadow-lg">
              <View className="flex-row items-center gap-2 border-b border-border px-4 py-3">
                <Text className="flex-1 text-base font-semibold text-foreground" numberOfLines={1}>
                  {t('action.table_of_contents')}
                </Text>
                <Pressable
                  onPress={onTocClose}
                  className="rounded p-1 active:bg-muted"
                  accessibilityLabel={t('action.close')}
                >
                  <X size={18} color={ICON_MUTED} />
                </Pressable>
              </View>
              <ReaderHeadingToc headings={headings} activeIndex={activeIndex} onSelect={onTocSelect} />
            </View>
          </View>
        </Modal>
      )}

      {/* ── Search modal (block navigation + term highlight) ── */}
      <Modal
        visible={searchOpen}
        transparent
        animationType="fade"
        onRequestClose={onSearchClose}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1"
        >
          <View className="flex-1 items-center justify-center bg-black/40 px-6">
            <View className="h-[70%] w-full max-w-md overflow-hidden rounded-xl border border-border bg-card shadow-lg">
              <View className="flex-row items-center justify-between border-b border-border px-4 py-3">
                <Text className="flex-1 text-base font-semibold text-foreground">{t('action.search')}</Text>
                <Pressable
                  onPress={onSearchClose}
                  className="rounded p-1 active:bg-muted"
                  accessibilityLabel={t('action.close')}
                >
                  <X size={18} color={ICON_MUTED} />
                </Pressable>
              </View>
              <View className="flex-1">
                <EpubSearchPanel blocks={blocks} onSelect={onSearchSelect} />
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}
