import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Pressable,
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
import { SliderRow } from '@/components/settings/SliderRow';
import { bootLogger, logwarn } from '@/lib/logger';
import { lemmatizeText } from '@/lib/tokenizer';
import { loadSampleContent, POPULAR_L2S, nativeLanguageName, flagEmoji } from '@langplayer/shared';
import type { LemmatizedToken } from '@langplayer/shared';

const { log: appLog } = bootLogger;

const ZOOM_TO_REM = [1, 1.125, 1.25, 1.375, 1.5, 1.75, 2, 2.25] as const;

/** Test languages: the current L2 first, then all POPULAR_L2S (deduped). */
function testLanguages(current: string): string[] {
  return [current, ...POPULAR_L2S.filter((code) => code !== current)];
}

export default function TokenizerScreen() {
  const { l1Lang, l2Lang } = useLanguage();
  const { display, updateDisplay, tokenizedText, updateTokenizedText } = useSettingsContext();
  const t = useT();
  // The language whose tokenization this page currently tests. Defaults to the
  // current L2, but any POPULAR_L2S language can be selected.
  const [selectedL2, setSelectedL2] = useState(l2Lang.code);
  const [customText, setCustomText] = useState('');

  const languages = useMemo(() => testLanguages(l2Lang.code), [l2Lang.code]);

  // ── Sample: long per-language reader text (lazy-loaded), short text as the
  //    instant fallback while it's loading or when a language lacks one. ──
  const [longSample, setLongSample] = useState<{ text: string; title: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLongSample(null);
    appLog(`[tokenizer-test] loading long sample l2=${selectedL2}`);
    loadSampleContent(selectedL2)
      .then((content) => {
        if (cancelled) return;
        appLog(`[tokenizer-test] sample loaded l2=${selectedL2} title="${content.title}" long=${content.long ? 'yes' : 'no'}`);
        setLongSample({ text: content.long ?? content.short, title: content.title });
      })
      .catch((err) => {
        if (cancelled) return;
        logwarn(`[tokenizer-test] sample load failed l2=${selectedL2} — using legacy short fallback`, err);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedL2]);

  const sampleMarkdown = longSample?.text ?? '';
  const sampleTitle = longSample?.title ?? nativeLanguageName(selectedL2);
  const samplePagination = useEpubPagination({
    text: sampleMarkdown,
    l1Code: l1Lang.code,
    l2Code: selectedL2,
    showTranslation: display.translation,
    resetKey: `${selectedL2}:${longSample ? 'long' : 'loading'}`,
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
      const tokens = await lemmatizeText(text, selectedL2, controller.signal);
      if (!controller.signal.aborted) setCustomTokens(tokens);
    } catch {
      // aborted
    } finally {
      if (!controller.signal.aborted) setCustomLoading(false);
    }
  };

  const handleSelectLanguage = (code: string) => {
    if (code === selectedL2) return;
    setSelectedL2(code);
    setCustomText('');
    setCustomTokens(null);
  };

  const zoomRem = ZOOM_TO_REM[tokenizedText.zoom] ?? 1;

  return (
    <PageContainer maxWidth="2xl">
      <ScrollView className="flex-1 px-4 py-5">
        <Text className="text-3xl font-bold text-foreground">
          {t('title.tokenizer_test')}
        </Text>
        <Text className="mt-2 text-base text-muted-foreground">
          {t('msg.tokenizer_desc', { l2: nativeLanguageName(selectedL2) })}
        </Text>

        {/* ── Text size + line spacing sliders (tied to settings) ── */}
        <Card className="mt-5">
          <CardContent>
            <SliderRow
              label={t('label.text_size')}
              value={tokenizedText.zoom}
              min={0}
              max={7}
              onValueChange={(v) => updateTokenizedText({ zoom: v })}
              valueDisplay={`${Math.round(zoomRem * 16)}px`}
              leftLabel={t('setting.smaller')}
              rightLabel={t('setting.bigger')}
              centerLabel={`${Math.round(ZOOM_TO_REM[0] * 16)}–${Math.round(ZOOM_TO_REM[7] * 16)}px`}
            />
            <SliderRow
              label={t('setting.leading')}
              value={tokenizedText.leading ?? 1.625}
              min={1}
              max={2}
              step={0.125}
              onValueChange={(v) => updateTokenizedText({ leading: v })}
              valueDisplay={`×${(tokenizedText.leading ?? 1.625).toFixed(2)}`}
              leftLabel="1×"
              rightLabel="2×"
            />
          </CardContent>
        </Card>

        {/* ── Language selector: current L2 + all POPULAR_L2S ── */}
        <View className="mt-6">
          <Text className="mb-2 text-sm font-medium text-foreground">{t('label.languages')}</Text>
          <View className="flex-row flex-wrap gap-2">
            {languages.map((code) => {
              const active = code === selectedL2;
              return (
                <Pressable
                  key={code}
                  onPress={() => handleSelectLanguage(code)}
                  className={`rounded-full border px-3 py-1.5 ${active ? 'border-primary bg-primary' : 'border-border bg-background'}`}
                >
                  <Text className={`text-sm ${active ? 'text-primary-foreground' : 'text-muted-foreground'}`}>
                    {flagEmoji(code)} {nativeLanguageName(code)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

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
                l2Code={selectedL2}
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
            placeholder={t('placeholder.enter_text', { l2: nativeLanguageName(selectedL2) })}
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
                l2Code={selectedL2}
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
