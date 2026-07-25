import React, { useCallback } from 'react';
import { View, Text, Pressable, Image, ActivityIndicator, useWindowDimensions } from 'react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useT } from '@/hooks/use-t';
import { useEpub } from '@/hooks/use-epub';
import { useEpubPagination } from '@/hooks/use-epub-pagination';
import { TokenizedText } from '@/components/TokenizedText';
import { EpubChapterSidebar } from '@/components/reader/epub-chapter-sidebar';
import { EpubCover } from '@/components/reader/EpubCover';
import type { TextBlock } from '@/lib/parse-markdown';
import { BookOpen, Upload, X, Languages, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react-native';
import { ICON_MUTED, ICON_PRIMARY } from '@/lib/theme-colors';

export default function EpubReaderScreen() {
  const { l1Lang, l2Lang } = useLanguage();
  const { display, updateDisplay } = useSettingsContext();
  const t = useT();
  const [text, setText] = React.useState('');
  const [sidebarOpen, setSidebarOpen] = React.useState(true);

  const onChapterChange = useCallback((chapterText: string, _title: string) => {
    setText(chapterText);
  }, []);
  const epub = useEpub(onChapterChange);

  const pagination = useEpubPagination({
    text,
    l1Code: l1Lang.code,
    l2Code: l2Lang.code,
    showTranslation: display.translation,
    resetKey: epub.fileName,
  });

  const { height: windowHeight } = useWindowDimensions();

  // ── Upload state ──
  if (!epub.fileName && !epub.loading) {
    return (
      <View className="flex-1 bg-background">
        <View className="px-4 py-5"><Text className="text-xl font-bold text-foreground">{t('title.epub_reader')}</Text></View>
        <View className="mx-4 flex-1 items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/30 p-10">
          <BookOpen size={48} color={ICON_MUTED} style={{ marginBottom: 16 }} />
          <Text className="mb-2 text-sm text-muted-foreground">{t('msg.drop_epub_here')}</Text>
          <Pressable onPress={epub.pickFile} className="mt-4 flex-row items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2 active:bg-muted">
            <Upload size={16} color={ICON_MUTED} />
            <Text className="text-sm text-foreground">{t('action.browse')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Loading ──
  if (epub.loading && (!epub.fileName || (!epub.coverUrl && !epub.coverTapped))) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color={ICON_MUTED} />
      </View>
    );
  }

  // ── Cover ──
  if (!epub.coverTapped && epub.fileName) {
    return <EpubCover epub={epub} windowHeight={windowHeight} t={t} />;
  }

  // ── Error ──
  if (epub.error) {
    return (
      <View className="flex-1 bg-background">
        <View className="px-4 py-5 flex-row items-center justify-between">
          <Text className="text-xl font-bold text-foreground">{epub.fileName}</Text>
          <Pressable onPress={epub.close} className="rounded p-1 active:bg-muted">
            <X size={18} color={ICON_MUTED} />
          </Pressable>
        </View>
        <View className="mx-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
          <Text className="text-sm text-destructive">{epub.error}</Text>
        </View>
      </View>
    );
  }

  // ── Reader ──
  const { blocks, visibleBlocks, page, totalPages, hasMeasured, loadingTokens, tokenCache, blockTranslations, isTranslating, prevPage, nextPage, handleMeasureBlock, contentWidth } = pagination;

  return (
    <View className="flex-1 bg-background">
      <View className="px-4 py-5 flex-row items-center gap-3">
        <View className="flex-1 min-w-0">
          <Text className="text-xl font-bold text-foreground" numberOfLines={1}>
            {epub.chapterTitle || epub.fileName || t('title.epub_reader')}
          </Text>
          <Text className="text-xs text-muted-foreground">{l2Lang.name} → {l1Lang.name}</Text>
        </View>
        <Pressable onPress={epub.close} className="flex-row items-center gap-1 rounded px-2 py-1 active:bg-muted">
          <X size={14} color={ICON_MUTED} /><Text className="text-xs text-muted-foreground">{t('action.close')}</Text>
        </Pressable>
        <Pressable onPress={() => updateDisplay({ translation: !display.translation })} className="rounded p-1 active:bg-muted">
          <Languages size={20} color={display.translation ? ICON_PRIMARY : ICON_MUTED} />
        </Pressable>
        <Pressable onPress={() => setSidebarOpen(!sidebarOpen)} className="rounded p-1 active:bg-muted">
          <BookOpen size={20} color={ICON_MUTED} />
        </Pressable>
      </View>

      <View className="flex-1 flex-row">
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
                {visibleBlocks.map((block, bi) => renderBlock(block, bi, blocks, visibleBlocks, tokenCache, blockTranslations, display.translation, l2Lang.code, contentWidth))}
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

          {/* ── Hidden measuring view ── */}
          {blocks && (
            <View style={{ position: 'absolute', left: 0, right: 0, top: 0, opacity: 0 }} pointerEvents="none" className="px-4">
              {blocks.map((block, bi) => renderMeasuringBlock(block, bi, handleMeasureBlock, display.translation, l2Lang.code, contentWidth))}
            </View>
          )}
        </View>

        {sidebarOpen && (
          <EpubChapterSidebar
            toc={epub.toc} chapterHref={epub.chapterHref}
            prevHref={epub.prevHref} nextHref={epub.nextHref}
            onSelect={(href) => epub.loadChapter(href)}
            onPrev={epub.prevChapter} onNext={epub.nextChapter}
            onClose={() => setSidebarOpen(false)}
          />
        )}
      </View>
    </View>
  );
}

// ── Block rendering helpers ──

import type { ContentBlock } from '@/lib/parse-markdown';
import type { LemmatizedToken } from '@langplayer/shared';

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

  const visibleTextBlocks = visibleBlocks.filter((b): b is TextBlock => b.kind === 'text' && (b.type === 'paragraph' || b.type === 'blockquote' || b.type === 'list-item'));
  const localIdx = visibleTextBlocks.indexOf(block as TextBlock);
  const translation = localIdx >= 0 ? blockTranslations[localIdx] : undefined;
  const globalIdx = allBlocks.indexOf(block);
  const cachedTokens = tokenCache[globalIdx];

  return (
    <View key={bi} className="mb-3">
      {block.type === 'heading' && (
        <Text className={`mb-2 font-bold text-foreground ${block.depth === 1 ? 'text-xl' : 'text-lg'}`}>{block.text}</Text>
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
      {block.type === 'heading' && <Text className={`mb-2 font-bold text-foreground ${block.depth === 1 ? 'text-xl' : 'text-lg'}`}>{block.text}</Text>}
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
