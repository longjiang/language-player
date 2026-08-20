import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Button, buttonTextClass } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useT } from '@/hooks/use-t';
import { useEpubPagination } from '@/hooks/use-epub-pagination';
import { ICON_MUTED } from '@/lib/theme-colors';
import { Sparkles } from 'lucide-react-native';
import { TokenizedText } from '@/components/TokenizedText';
import { PaginatedReader } from '@/components/reader/PaginatedReader';
import { PageContainer } from '@/components/layout/PageContainer';
import { bootLogger, logwarn } from '@/lib/logger';
import { lemmatizeText } from '@/lib/tokenizer';
import { loadSampleContent } from '@langplayer/shared';
import type { LemmatizedToken } from '@langplayer/shared';

const { log: appLog } = bootLogger;

export default function TokenizerScreen() {
  const { l1Lang, l2Lang } = useLanguage();
  const { display, updateDisplay } = useSettingsContext();
  const t = useT();
  const [customText, setCustomText] = useState('');

  // ── Sample: long per-language reader text (lazy-loaded), short text as the
  //    instant fallback while it's loading or when a language lacks one. ──
  const [longSample, setLongSample] = useState<{ text: string; title: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLongSample(null);
    appLog(`[tokenizer-test] loading long sample l2=${l2Lang.code}`);
    loadSampleContent(l2Lang.code)
      .then((content) => {
        if (cancelled) return;
        appLog(`[tokenizer-test] sample loaded l2=${l2Lang.code} title="${content.title}" long=${content.long ? 'yes' : 'no'}`);
        setLongSample({ text: content.long ?? content.short, title: content.title });
      })
      .catch((err) => {
        if (cancelled) return;
        logwarn(`[tokenizer-test] sample load failed l2=${l2Lang.code} — using legacy short fallback`, err);
      });
    return () => {
      cancelled = true;
    };
  }, [l2Lang.code]);

  const sampleMarkdown = longSample?.text ?? '';
  const sampleTitle = longSample?.title ?? l2Lang.name;
  const samplePagination = useEpubPagination({
    text: sampleMarkdown,
    l1Code: l1Lang.code,
    l2Code: l2Lang.code,
    showTranslation: display.translation,
    resetKey: `${l2Lang.code}:${longSample ? 'long' : 'loading'}`,
  });

  // ── Custom text tokenization (on demand) ──
  const [customTokens, setCustomTokens] = useState<LemmatizedToken[] | null>(null);
  const [customLoading, setCustomLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const handleTokenizeCustom = async () => {
    const text = customText.trim();
    if (!text) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setCustomLoading(true);
    setCustomTokens(null);
    try {
      const tokens = await lemmatizeText(text, l2Lang.code, controller.signal);
      if (!controller.signal.aborted) setCustomTokens(tokens);
    } catch {
      // aborted
    } finally {
      if (!controller.signal.aborted) setCustomLoading(false);
    }
  };

  return (
    <PageContainer maxWidth="2xl">
      <ScrollView className="flex-1 px-4 py-5">
        <Text className="text-3xl font-bold text-foreground">
          {t('title.tokenizer_test')}
        </Text>
        <Text className="mt-2 text-base text-muted-foreground">
          {t('msg.tokenizer_desc', { l2: l2Lang.name })}
        </Text>

        {/* ── Sample text (paginated, like reader) ── */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>{sampleTitle} · {t('label.sample')}</CardTitle>
          </CardHeader>
          <CardContent>
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
                prevPage={samplePagination.prevPage}
                nextPage={samplePagination.nextPage}
                goToPage={samplePagination.goToPage}
                handleMeasureBlock={samplePagination.handleMeasureBlock}
                onVisibleBlocksChange={samplePagination.onVisibleBlocksChange}
                contentWidth={samplePagination.contentWidth}
                l2Code={l2Lang.code}
                l1Code={l1Lang.code}
                showTextActions
                t={t}
              />
            ) : (
              <View className="items-center justify-center py-10">
                <ActivityIndicator size="small" color={ICON_MUTED} />
                <Text className="mt-2 text-sm text-muted-foreground">{t('msg.loading')}</Text>
              </View>
            )}
          </CardContent>
        </Card>

        {/* ── Custom text input ── */}
        <View className="mt-6">
          <Text className="mb-2 text-sm font-medium text-foreground">
            {t('label.custom_text')}
          </Text>
          <Textarea
            className="mb-3"
            value={customText}
            onChangeText={setCustomText}
            placeholder={t('placeholder.enter_text', { l2: l2Lang.name })}
            placeholderTextColor={ICON_MUTED}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Button
            onPress={handleTokenizeCustom}
            disabled={!customText.trim()}
            variant="default"
            className="self-start"
          >
            <Sparkles size={16} color="#fff" />
            <Text className={buttonTextClass('default')}>
              {t('action.tokenize')}
            </Text>
          </Button>
        </View>

        {/* ── Custom text result ── */}
        {customLoading && (
          <View className="mt-4 flex-row items-center gap-2">
            <ActivityIndicator size="small" />
            <Text className="text-sm text-muted-foreground">{t('msg.loading')}</Text>
          </View>
        )}
        {customTokens && customTokens.length > 0 && (
          <Card className="mt-4">
            <CardContent>
              <TokenizedText
                text={customText.trim()}
                l2Code={l2Lang.code}
                tokens={customTokens}
                textScale={1}
              />
            </CardContent>
          </Card>
        )}
      </ScrollView>
    </PageContainer>
  );
}
