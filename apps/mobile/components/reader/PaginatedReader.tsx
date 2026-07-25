import React from 'react';
import { View, Text, Pressable, Image, ActivityIndicator } from 'react-native';
import { TokenizedText } from '@/components/TokenizedText';
import type { ContentBlock, TextBlock } from '@/lib/parse-markdown';
import type { LemmatizedToken } from '@langplayer/shared';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react-native';
import { ICON_MUTED } from '@/lib/theme-colors';

interface PaginatedReaderProps {
  blocks: ContentBlock[] | null;
  visibleBlocks: ContentBlock[] | null;
  page: number;
  totalPages: number;
  hasMeasured: boolean;
  loadingTokens: boolean;
  tokenCache: Record<number, LemmatizedToken[]>;
  blockTranslations: Record<number, string>;
  prevPage: () => void;
  nextPage: () => void;
  handleMeasureBlock: (index: number, height: number) => void;
  contentWidth: number;
  l2Code: string;
  showTranslation: boolean;
  t: (key: string) => string;
}

export function PaginatedReader({
  blocks, visibleBlocks, page, totalPages, hasMeasured, loadingTokens,
  tokenCache, blockTranslations, prevPage, nextPage, handleMeasureBlock,
  contentWidth, l2Code, showTranslation, t,
}: PaginatedReaderProps) {
  return (
    <View className="flex-1 flex-col">
      {blocks && !hasMeasured && (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="small" color={ICON_MUTED} />
        </View>
      )}

      {blocks && hasMeasured && visibleBlocks && (
        <View className="flex-1 flex-col">
          {loadingTokens && (
            <View className="flex-row items-center justify-center gap-2 py-2">
              <Loader2 size={12} color={ICON_MUTED} />
              <Text className="text-xs text-muted-foreground">{t('msg.making_words_interactive')}</Text>
            </View>
          )}

          <View className="flex-1 px-4">
            {visibleBlocks.map((block, bi) =>
              renderBlock(block, bi, blocks, visibleBlocks, tokenCache, blockTranslations, showTranslation, l2Code, contentWidth),
            )}
          </View>

          <View className="flex-shrink-0 flex-row items-center justify-center gap-4 border-t border-border py-2">
            <Pressable onPress={prevPage} disabled={page === 0} className={`rounded p-1 ${page === 0 ? 'opacity-30' : 'active:bg-muted'}`}>
              <ChevronLeft size={18} color={ICON_MUTED} />
            </Pressable>
            <Text className="text-xs text-muted-foreground">{page + 1} / {totalPages}</Text>
            <Pressable onPress={nextPage} disabled={page >= totalPages - 1} className={`rounded p-1 ${page >= totalPages - 1 ? 'opacity-30' : 'active:bg-muted'}`}>
              <ChevronRight size={18} color={ICON_MUTED} />
            </Pressable>
          </View>
        </View>
      )}

      {/* Hidden measuring view — only needed during measurement phase */}
      {blocks && !hasMeasured && (
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, opacity: 0 }} pointerEvents="none" className="px-4">
          {blocks.map((block, bi) =>
            renderMeasuringBlock(block, bi, handleMeasureBlock, showTranslation, l2Code, contentWidth),
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
  l2Code: string, contentWidth: number,
) {
  if (block.kind === 'image') {
    return (
      <View key={bi} className="my-3 items-center">
        <Image source={{ uri: block.uri }} style={{ width: '100%', height: contentWidth * 0.6 }} resizeMode="contain" />
      </View>
    );
  }

  const visibleTextBlocks = visibleBlocks.filter(
    (b): b is TextBlock => b.kind === 'text' && (b.type === 'paragraph' || b.type === 'blockquote' || b.type === 'list-item'),
  );
  const localIdx = visibleTextBlocks.indexOf(block as TextBlock);
  const translation = localIdx >= 0 ? blockTranslations[localIdx] : undefined;
  const globalIdx = allBlocks.indexOf(block);
  const cachedTokens = tokenCache[globalIdx];

  return (
    <View key={bi} className="mb-3">
      {block.type === 'heading' && (
        <Text className={`mb-2 font-bold text-foreground ${block.depth === 1 ? 'text-xl' : block.depth === 2 ? 'text-lg' : 'text-base'}`}>{block.text}</Text>
      )}
      {block.type === 'paragraph' && (
        <View>
          <TokenizedText text={block.text} l2Code={l2Code} tokens={cachedTokens} />
          {showTranslation && translation && <Text className="mt-1 text-sm leading-relaxed text-muted-foreground">{translation}</Text>}
        </View>
      )}
      {block.type === 'blockquote' && (
        <View className="border-l-2 border-muted-foreground/30 pl-3">
          <TokenizedText text={block.text} l2Code={l2Code} tokens={cachedTokens} />
          {showTranslation && translation && <Text className="mt-1 text-sm leading-relaxed text-muted-foreground">{translation}</Text>}
        </View>
      )}
      {block.type === 'list-item' && (
        <View>
          <View className="flex-row"><Text className="mr-2 text-muted-foreground">•</Text>
            <View className="flex-1"><TokenizedText text={block.text} l2Code={l2Code} tokens={cachedTokens} /></View>
          </View>
          {showTranslation && translation && <Text className="ml-4 mt-1 text-sm leading-relaxed text-muted-foreground">{translation}</Text>}
        </View>
      )}
    </View>
  );
}

function renderMeasuringBlock(
  block: ContentBlock, bi: number,
  handleMeasureBlock: (i: number, h: number) => void,
  showTranslation: boolean, l2Code: string, contentWidth: number,
) {
  if (block.kind === 'image') {
    return (
      <View key={`m-${bi}`} onLayout={(e) => handleMeasureBlock(bi, e.nativeEvent.layout.height)} className="mb-3">
        <Image source={{ uri: block.uri }} style={{ width: contentWidth, height: contentWidth * 0.6 }} resizeMode="contain" />
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
