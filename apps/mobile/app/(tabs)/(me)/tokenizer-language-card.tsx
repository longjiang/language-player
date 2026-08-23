import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useT } from '@/hooks/use-t';
import { useEpubPagination } from '@/hooks/use-epub-pagination';
import { ICON_MUTED } from '@/lib/theme-colors';
import { PaginatedReader } from '@/components/reader/PaginatedReader';
import { loadSampleContent, nativeLanguageName, flagEmoji } from '@langplayer/shared';
import { bootLogger, logwarn } from '@/lib/logger';

const { log: appLog } = bootLogger;

/**
 * One language's tokenization test in the tokenizer test page.
 *
 * The card is mounted lazily by the parent FlatList (windowed), and only then
 * imports the language's sample chunk. Same lazy-load contract as the web
 * tokenizer page.
 */
export function TokenizerLanguageCard({ code, height }: { code: string; height: number }) {
  const { l1Lang } = useLanguage();
  const { display } = useSettingsContext();
  const t = useT();

  const [longSample, setLongSample] = useState<{ text: string; title: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    appLog(`tokenizer card loading l2=${code}`);
    loadSampleContent(code)
      .then((c) => {
        if (cancelled) return;
        const text = c.long ?? c.short;
        appLog(`tokenizer card sample loaded l2=${code} chars=${text.length}`);
        setLongSample({ text, title: c.title });
      })
      .catch(() => {
        logwarn(`tokenizer card sample load failed l2=${code}`);
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  const sampleMarkdown = longSample?.text ?? '';
  const samplePagination = useEpubPagination({
    text: sampleMarkdown,
    l1Code: l1Lang.code,
    l2Code: code,
    showTranslation: display.translation,
    resetKey: `${code}:${longSample ? 'long' : 'loading'}`,
  });

  return (
    <View style={{ height, flex: 1 }} className="overflow-hidden rounded-lg border border-border bg-card">
      <View className="flex-row items-center gap-2 border-b border-border px-4 py-3">
        <Text className="text-base font-semibold text-foreground">
          {flagEmoji(code)} {nativeLanguageName(code)}
        </Text>
      </View>
      <View className="flex-1">
        {longSample ? (
          <PaginatedReader
            blocks={samplePagination.blocks}
            visibleBlocks={samplePagination.visibleBlocks}
            page={samplePagination.page}
            totalPages={samplePagination.totalPages}
            hasMeasured={samplePagination.hasMeasured}
            loadingTokens={samplePagination.loadingTokens}
            tokenCache={samplePagination.tokenCache}
            blockTranslations={samplePagination.blockTranslations}
            isTranslating={samplePagination.isTranslating}
            prevPage={samplePagination.prevPage}
            nextPage={samplePagination.nextPage}
            goToPage={samplePagination.goToPage}
            handleMeasureBlock={samplePagination.handleMeasureBlock}
            onVisibleBlocksChange={samplePagination.onVisibleBlocksChange}
            contentWidth={samplePagination.contentWidth}
            onViewportLayout={samplePagination.handleViewportLayout}
            measuredWindow={samplePagination.measuredWindow}
            measureStart={samplePagination.measureStart}
            measureEnd={samplePagination.measureEnd}
            measureNonce={samplePagination.measureNonce}
            hasPrev={samplePagination.hasPrev}
            hasNext={samplePagination.hasNext}
            flipping={samplePagination.flipping}
            measuring={samplePagination.measuring}
            l2Code={code}
            l1Code={l1Lang.code}
            showTextActions
            t={t}
          />
        ) : (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="small" color={ICON_MUTED} />
            <Text className="mt-2 text-sm text-muted-foreground">{t('msg.loading')}</Text>
          </View>
        )}
      </View>
    </View>
  );
}
