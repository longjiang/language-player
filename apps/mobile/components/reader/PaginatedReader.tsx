import React, { useCallback } from 'react';
import { View, Text, Pressable, Image, ActivityIndicator, ScrollView, Alert, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TokenizedText } from '@/components/TokenizedText';
import { TextActionMenu } from '@/components/TextActionMenu';
import { Root as Switch } from '@/components/ui/switch';
import type { ContentBlock, TextBlock } from '@/lib/parse-markdown';
import type { LemmatizedToken } from '@langplayer/shared';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react-native';
import { ICON_MUTED } from '@/lib/theme-colors';

interface PaginatedReaderProps {
  blocks: ContentBlock[] | null;
  /** Target language code for TokenizedText + TextActionMenu. */
  l2Code: string;
  /** Native language code for TextActionMenu translate target. */
  l1Code: string;
  t: (key: string) => string;

  // ── Rendering options ──
  /** Wrap body blocks in TextActionMenu (copy/speak/explain/translate). Default false. */
  showTextActions?: boolean;
  /** Show L1 translation below each body block. Default false. */
  showTranslation?: boolean;
  /** Called when the translate toggle button is pressed. Parent controls the state. */
  onToggleTranslation?: () => void;

  // ── Scroll mode (non-paginated) ──
  /** When true, renders all blocks in a scrollable container without page nav. Default false. */
  scrollMode?: boolean;

  // ── Pagination mode props (ignored in scrollMode) ──
  visibleBlocks?: ContentBlock[] | null;
  page?: number;
  totalPages?: number;
  hasMeasured?: boolean;
  loadingTokens?: boolean;
  tokenCache?: Record<number, LemmatizedToken[]>;
  blockTranslations?: Record<number, string>;
  prevPage?: () => void;
  nextPage?: () => void;
  goToPage?: (page: number) => void;
  handleMeasureBlock?: (index: number, height: number) => void;
  contentWidth?: number;
  /** Number of blocks currently mounted in the hidden measuring view (whole-book chunking). */
  measuredWindow?: number;
  /** Follow an in-book link (SPEC-049 §9.7) — passed to linked tokens. */
  onOpenLink?: (href: string) => void;
  /** Active search-match highlight (block + char range), if any. */
  highlight?: { blockIndex: number; start: number; end: number } | null;
}

export function PaginatedReader({
  blocks, visibleBlocks: visibleBlocksProp, page = 0, totalPages = 1,
  hasMeasured: hasMeasuredProp, loadingTokens: loadingTokensProp,
  tokenCache = {}, blockTranslations = {},
  prevPage, nextPage, goToPage, handleMeasureBlock,
  contentWidth: contentWidthProp = 300,
  measuredWindow,
  onOpenLink,
  highlight,
  l2Code, l1Code, showTranslation = false, onToggleTranslation,
  showTextActions = false, scrollMode = false, t,
}: PaginatedReaderProps) {
  const handlePageNumberTap = useCallback(() => {
    if (!goToPage) return;
    if (Platform.OS === 'ios') {
      Alert.prompt(
        t('action.go_to_page'),
        '',
        (value) => {
          const n = parseInt(value, 10);
          if (!isNaN(n) && n >= 1) goToPage(n - 1);
        },
        'plain-text',
        '',
        'number-pad',
      );
    }
  }, [goToPage, t]);
  const visibleBlocks = scrollMode ? blocks : visibleBlocksProp;
  const hasMeasured = scrollMode ? true : hasMeasuredProp;
  const contentWidth = scrollMode ? 300 : contentWidthProp;
  const loadingTokens = scrollMode ? false : (loadingTokensProp ?? false);
  const insets = useSafeAreaInsets();

  // ── Scroll mode: simple block list ──
  if (scrollMode) {
    if (!blocks) return null;
    return (
      <View className="flex-1">
        <View className="px-4">
          {blocks.map((block, bi) =>
            renderBlock(block, bi, blocks, blocks, tokenCache, blockTranslations, showTranslation, l2Code, l1Code, contentWidth, showTextActions, onOpenLink, highlight),
          )}
        </View>
        {onToggleTranslation && (
          <View className="flex-row items-center justify-end gap-2 border-t border-border px-4" style={{ paddingBottom: insets.bottom, paddingTop: 8 }}>
            <Text className="text-xs text-muted-foreground">{t('action.translation')}</Text>
            <Switch checked={showTranslation} onCheckedChange={onToggleTranslation} />
          </View>
        )}
      </View>
    );
  }

  // ── Paginated mode ──
  return (
    <View className="flex-1 flex-col">
      {blocks && !hasMeasured && (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="small" color={ICON_MUTED} />
        </View>
      )}

      {blocks && hasMeasured && visibleBlocks && (
        <View className="flex-1 flex-col">
          {/* Loading indicator */}
          {loadingTokens && (
            <View className="flex-row items-center justify-center gap-2 py-2">
              <Loader2 size={12} color={ICON_MUTED} />
              <Text className="text-xs text-muted-foreground">{t('msg.making_words_interactive')}</Text>
            </View>
          )}

          <ScrollView className="flex-1 px-4">
            {visibleBlocks.map((block, bi) =>
              renderBlock(block, bi, blocks, visibleBlocks, tokenCache, blockTranslations, showTranslation, l2Code, l1Code, contentWidth, showTextActions, onOpenLink, highlight),
            )}
          </ScrollView>

          {/* Page navigation + translation switch, with safe area padding */}
          <View className="flex-shrink-0 flex-row items-center justify-center border-t border-border px-4 gap-3" style={{ paddingBottom: insets.bottom, paddingTop: 8 }}>
            <Pressable onPress={prevPage} disabled={page === 0 || !prevPage} className={`rounded p-1 ${page === 0 || !prevPage ? 'opacity-30' : 'active:bg-muted'}`}>
              <ChevronLeft size={18} color={ICON_MUTED} />
            </Pressable>
            <Pressable onPress={handlePageNumberTap} disabled={!goToPage} className={`rounded px-2 py-0.5 ${!goToPage ? 'opacity-50' : 'active:bg-muted'}`}>
              <Text className="text-xs text-muted-foreground">{page + 1} / {totalPages}</Text>
            </Pressable>
            <Pressable onPress={nextPage} disabled={page >= totalPages - 1 || !nextPage} className={`rounded p-1 ${page >= totalPages - 1 || !nextPage ? 'opacity-30' : 'active:bg-muted'}`}>
              <ChevronRight size={18} color={ICON_MUTED} />
            </Pressable>
            {onToggleTranslation && (
              <View className="flex-row items-center gap-1.5 ml-3 pl-3 border-l border-border">
                <Text className="text-xs text-muted-foreground">{t('action.translation')}</Text>
                <Switch checked={showTranslation} onCheckedChange={onToggleTranslation} />
              </View>
            )}
          </View>
        </View>
      )}

      {/* Hidden measuring view — only needed during measurement phase */}
      {blocks && !hasMeasured && handleMeasureBlock && (
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, opacity: 0 }} pointerEvents="none" className="px-4">
          {blocks.slice(0, measuredWindow ?? blocks.length).map((block, bi) =>
            renderMeasuringBlock(block, bi, handleMeasureBlock, showTranslation, l2Code, l1Code, contentWidth, showTextActions),
          )}
        </View>
      )}
    </View>
  );
}

// ── Block rendering helpers ──

function renderBlock(
  block: ContentBlock, bi: number, allBlocks: ContentBlock[],
  visibleBlocks: ContentBlock[], tokenCache: Record<number, LemmatizedToken[]>,
  blockTranslations: Record<number, string>, showTranslation: boolean,
  l2Code: string, l1Code: string, contentWidth: number,
  showTextActions: boolean, onOpenLink?: (href: string) => void,
  highlight?: { blockIndex: number; start: number; end: number } | null,
) {
  if (block.kind === 'image') {
    return (
      <View key={bi} className="my-3 items-center">
        <Image source={{ uri: block.uri }} style={{ width: '100%', height: contentWidth * 0.6 }} resizeMode="contain" />
      </View>
    );
  }

  const globalIdx = allBlocks.indexOf(block);

  if (block.kind === 'table') {
    return (
      <View key={bi} className="mb-3 overflow-hidden rounded-lg border border-border">
        {/* Header row */}
        <View className="flex-row bg-muted/50">
          {block.header.map((cell, ci) => (
            <View key={ci} className={`px-2 py-1.5 ${ci < block.header.length - 1 ? 'border-r border-border' : ''}`} style={{ flex: 1 }}>
              <Text className="text-xs font-semibold text-foreground"><TokenizedText text={cell} l2Code={l2Code} tokens={tokenCache[globalIdx] ? tokenCache[globalIdx] : undefined} /></Text>
            </View>
          ))}
        </View>
        {/* Data rows */}
        {block.rows.map((row, ri) => (
          <View key={ri} className={`flex-row ${ri < block.rows.length - 1 ? 'border-b border-border' : ''}`}>
            {row.map((cell, ci) => (
              <View key={ci} className={`px-2 py-1.5 ${ci < row.length - 1 ? 'border-r border-border' : ''}`} style={{ flex: 1 }}>
                <TokenizedText text={cell} l2Code={l2Code} tokens={tokenCache[globalIdx] ? tokenCache[globalIdx] : undefined} />
              </View>
            ))}
          </View>
        ))}
      </View>
    );
  }

  const visibleTextBlocks = visibleBlocks.filter(
    (b): b is TextBlock => b.kind === 'text' && (b.type === 'paragraph' || b.type === 'blockquote' || b.type === 'list-item'),
  );
  const localIdx = visibleTextBlocks.indexOf(block as TextBlock);
  const translation = localIdx >= 0 ? blockTranslations[localIdx] : undefined;
  const cachedTokens = tokenCache[globalIdx];

  // ── Body block content (tokenized text + optional translation) ──
  const bodyContent = (type: 'paragraph' | 'blockquote' | 'list-item') => {
    const formats = block.formats ?? [];
    const effectiveFormats =
      highlight && block.kind === 'text' && highlight.blockIndex === globalIdx
        ? [...formats, { start: highlight.start, end: highlight.end, type: 'highlight' as const }]
        : formats;
    const tokenEl = (
      <TokenizedText
        text={block.text}
        l2Code={l2Code}
        tokens={cachedTokens}
        formats={effectiveFormats}
        onOpenLink={onOpenLink}
      />
    );
    const transEl = showTranslation && translation ? (
      <Text className="mt-1 text-sm leading-relaxed text-muted-foreground">{translation}</Text>
    ) : null;

    switch (type) {
      case 'paragraph':
        return <><View>{tokenEl}{transEl}</View></>;
      case 'blockquote':
        return <><View className="border-l-2 border-muted-foreground/30 pl-3">{tokenEl}{transEl}</View></>;
      case 'list-item':
        return (
          <View>
            <View className="flex-row"><Text className="mr-2 text-muted-foreground">•</Text>
              <View className="flex-1">{tokenEl}</View>
            </View>
            {transEl}
          </View>
        );
    }
  };

  return (
    <View key={bi} className="mb-3">
      {block.type === 'heading' && (
        <Text className={`mb-2 font-bold text-foreground ${block.depth === 1 ? 'text-xl' : block.depth === 2 ? 'text-lg' : 'text-base'}`}>{block.text}</Text>
      )}
      {block.type === 'paragraph' && (
        showTextActions ? (
          <TextActionMenu text={block.text} l2Code={l2Code} l1Code={l1Code}>
            {bodyContent('paragraph')}
          </TextActionMenu>
        ) : bodyContent('paragraph')
      )}
      {block.type === 'blockquote' && (
        showTextActions ? (
          <TextActionMenu text={block.text} l2Code={l2Code} l1Code={l1Code}>
            {bodyContent('blockquote')}
          </TextActionMenu>
        ) : bodyContent('blockquote')
      )}
      {block.type === 'list-item' && (
        showTextActions ? (
          <TextActionMenu text={block.text} l2Code={l2Code} l1Code={l1Code}>
            {bodyContent('list-item')}
          </TextActionMenu>
        ) : bodyContent('list-item')
      )}
    </View>
  );
}

function renderMeasuringBlock(
  block: ContentBlock, bi: number,
  handleMeasureBlock: (i: number, h: number) => void,
  showTranslation: boolean, l2Code: string, l1Code: string, contentWidth: number,
  showTextActions: boolean,
) {
  if (block.kind === 'image') {
    return (
      <View key={`m-${bi}`} onLayout={(e) => handleMeasureBlock(bi, e.nativeEvent.layout.height)} className="mb-3">
        <Image source={{ uri: block.uri }} style={{ width: contentWidth, height: contentWidth * 0.6 }} resizeMode="contain" />
      </View>
    );
  }

  if (block.kind === 'table') {
    // Approximate height: header + rows * rowHeight
    const rowCount = block.rows.length + 1;
    const estimatedHeight = rowCount * 32 + 16;
    return (
      <View key={`m-${bi}`} onLayout={(e) => handleMeasureBlock(bi, e.nativeEvent.layout.height)} className="mb-3">
        <View className="rounded-lg border border-border">
          <View className="flex-row bg-muted/50">
            {block.header.map((cell, ci) => (
              <View key={ci} style={{ flex: 1 }}>
                <Text className="px-2 py-1.5 text-xs">{cell}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View key={`m-${bi}`} onLayout={(e) => handleMeasureBlock(bi, e.nativeEvent.layout.height)} className="mb-3">
      {block.type === 'heading' && <Text className={`mb-2 font-bold text-foreground ${block.depth === 1 ? 'text-xl' : block.depth === 2 ? 'text-lg' : 'text-base'}`}>{block.text}</Text>}
      {block.type === 'paragraph' && (
        <View>
          <TokenizedText text={block.text} l2Code={l2Code} tokens={[]} />
          {showTranslation && <Text className="mt-1 text-sm leading-relaxed text-muted-foreground">{' '}</Text>}
        </View>
      )}
      {block.type === 'blockquote' && (
        <View className="border-l-2 border-muted-foreground/30 pl-3">
          <TokenizedText text={block.text} l2Code={l2Code} tokens={[]} />
          {showTranslation && <Text className="mt-1 text-sm leading-relaxed text-muted-foreground">{' '}</Text>}
        </View>
      )}
      {block.type === 'list-item' && (
        <View>
          <View className="flex-row"><Text className="mr-2 text-muted-foreground">•</Text>
            <View className="flex-1"><TokenizedText text={block.text} l2Code={l2Code} tokens={[]} /></View>
          </View>
          {showTranslation && <Text className="ml-4 mt-1 text-sm leading-relaxed text-muted-foreground">{' '}</Text>}
        </View>
      )}
    </View>
  );
}
