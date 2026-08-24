import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, Pressable } from 'react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useT } from '@/hooks/use-t';
import { useEpubPagination } from '@/hooks/use-epub-pagination';
import { ICON_MUTED } from '@/lib/theme-colors';
import { PaginatedReader } from '@/components/reader/PaginatedReader';
import { loadSampleContent, nativeLanguageName, flagEmoji } from '@langplayer/shared';
import { bootLogger, logwarn } from '@/lib/logger';
import { useResponsive } from '@/hooks/use-responsive';

const { log: appLog } = bootLogger;

/**
 * One language's tokenization test in the tokenizer test page.
 *
 * The card is mounted lazily by the parent FlatList (windowed), and only then
 * imports the language's sample chunk. Same lazy-load contract as the web
 * tokenizer page.
 */
export function TokenizerLanguageCard({ code, height, longSample }: { code: string; height: number; longSample: boolean }) {
  const { l1Lang } = useLanguage();
  const { display } = useSettingsContext();
  const { isMd } = useResponsive();
  const t = useT();

  const [sample, setSample] = useState<{ text: string; title: string } | null>(null);
  // SPEC-087 diagnostic: font overrides (Script = the language's own font,
  // System = the system font) + base-yellow / ruby-cyan space visualization.
  const [baseSystem, setBaseSystem] = useState(false);
  const [rubySystem, setRubySystem] = useState(false);

  useEffect(() => {
    let cancelled = false;
    appLog(`tokenizer card loading l2=${code} long=${longSample}`);
    loadSampleContent(code)
      .then((c) => {
        if (cancelled) return;
        // Short by default; long sample when the toggle is on (falls back to
        // the short paragraph when the language has no long sample authored).
        const text = longSample ? (c.long ?? c.short) : c.short;
        appLog(`tokenizer card sample loaded l2=${code} long=${longSample} chars=${text.length}`);
        setSample({ text, title: c.title });
      })
      .catch(() => {
        logwarn(`tokenizer card sample load failed l2=${code}`);
      });
    return () => {
      cancelled = true;
    };
  }, [code, longSample]);

  const sampleMarkdown = sample?.text ?? '';
  const samplePagination = useEpubPagination({
    text: sampleMarkdown,
    l1Code: l1Lang.code,
    l2Code: code,
    showTranslation: display.translation,
    resetKey: `${code}:${longSample ? 'long' : 'short'}:${sample ? 'ready' : 'loading'}`,
  });

  return (
    <View style={{ height, flex: 1 }} className="overflow-hidden rounded-lg border border-border bg-card">
      <View className="flex-row items-center gap-2 border-b border-border px-4 py-3">
        <Text className="text-base font-semibold text-foreground">
          {flagEmoji(code)} {nativeLanguageName(code)}
        </Text>
        <View className="ml-auto flex-row items-center gap-2">
          <Pressable onPress={() => setBaseSystem((v) => !v)} className="rounded border border-border px-2 py-1">
            <Text className="text-xs text-muted-foreground">{t('label.base_font')}: {baseSystem ? 'System' : 'Script'}</Text>
          </Pressable>
          <Pressable onPress={() => setRubySystem((v) => !v)} className="rounded border border-border px-2 py-1">
            <Text className="text-xs text-muted-foreground">{t('label.ruby_font')}: {rubySystem ? 'System' : 'Script'}</Text>
          </Pressable>
        </View>
      </View>
      <View className="flex-1">
        {sample ? (
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
            showTranslation={display.translation}
            translationSideBySide={isMd}
            debugFontFamily={baseSystem ? '__system__' : null}
            debugRubyFontFamily={rubySystem ? '__system__' : null}
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
