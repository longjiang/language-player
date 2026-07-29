import React, { useCallback } from 'react';
import { View, Text, Pressable, ActivityIndicator, useWindowDimensions } from 'react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useT } from '@/hooks/use-t';
import { useEpub } from '@/hooks/use-epub';
import { useEpubPagination } from '@/hooks/use-epub-pagination';
import { EpubChapterSidebar } from '@/components/reader/epub-chapter-sidebar';
import { EpubCover } from '@/components/reader/EpubCover';
import { PaginatedReader } from '@/components/reader/PaginatedReader';
import { BookOpen, Upload, X } from 'lucide-react-native';
import { ICON_MUTED } from '@/lib/theme-colors';

export default function EpubReaderScreen() {
  const { l1Lang, l2Lang } = useLanguage();
  const { display, updateDisplay } = useSettingsContext();
  const t = useT();
  const [text, setText] = React.useState('');
  const [sidebarOpen, setSidebarOpen] = React.useState(false);

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
    initialAnchor: epub.initialAnchor,
    onAnchorChange: epub.saveAnchor,
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
        <Pressable onPress={() => setSidebarOpen(!sidebarOpen)} className="rounded p-1 active:bg-muted">
          <BookOpen size={20} color={ICON_MUTED} />
        </Pressable>
      </View>

      {/* Content — sidebar overlays when open */}
      <View className="flex-1 pt-2">
        <PaginatedReader
          blocks={pagination.blocks}
          visibleBlocks={pagination.visibleBlocks}
          page={pagination.page}
          totalPages={pagination.totalPages}
          hasMeasured={pagination.hasMeasured}
          loadingTokens={pagination.loadingTokens}
          tokenCache={pagination.tokenCache}
          blockTranslations={pagination.blockTranslations}
          prevPage={pagination.prevPage}
          nextPage={pagination.nextPage}
          handleMeasureBlock={pagination.handleMeasureBlock}
          contentWidth={pagination.contentWidth}
          l2Code={l2Lang.code}
          l1Code={l1Lang.code}
          showTranslation={display.translation}
          onToggleTranslation={() => updateDisplay({ translation: !display.translation })}
          showTextActions
          t={t}
        />

        {sidebarOpen && (
          <View className="absolute right-0 top-0 bottom-0 z-10" style={{ elevation: 8 }}>
          <EpubChapterSidebar
            toc={epub.toc} chapterHref={epub.chapterHref}
            prevHref={epub.prevHref} nextHref={epub.nextHref}
            onSelect={(href) => { epub.loadChapter(href); setSidebarOpen(false); }}
            onPrev={epub.prevChapter} onNext={epub.nextChapter}
            onClose={() => setSidebarOpen(false)}
          />
          </View>
        )}
      </View>
    </View>
  );
}
