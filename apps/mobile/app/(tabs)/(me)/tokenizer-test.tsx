import React, { useEffect, useState } from 'react';
import { FlatList, Pressable, Text, View, useWindowDimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Settings2, ChevronDown, ChevronUp } from 'lucide-react-native';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useT } from '@/hooks/use-t';
import { SliderRow } from '@/components/settings/SliderRow';
import { ToggleRow } from '@/components/settings/ToggleRow';
import { PageContainer } from '@/components/layout/PageContainer';
import { ICON_MUTED } from '@/lib/theme-colors';
import { POPULAR_L2S } from '@langplayer/shared';
import { TokenizerLanguageCard } from './tokenizer-language-card';

const ZOOM_TO_REM = [1, 1.125, 1.25, 1.375, 1.5, 1.75, 2, 2.25] as const;

/** Persisted toggle: whether each card shows the long multi-paragraph sample. */
const TEXT_LENGTH_KEY = 'zthTokenizerTest:textLength';

/**
 * Curated display order for the tokenizer test screen (local to this screen
 * only — `POPULAR_L2S` stays the shared ADR-0030 source of truth). The
 * ruby-bearing scripts are the most useful to spot-check, so those lead,
 * then the rest of the popular list in its original order.
 */
const TOKENIZER_TEST_PREFERRED = ['zh', 'ja', 'ko', 'ru', 'ar', 'yue', 'hi'];

const tokenizerTestOrder = (() => {
  const preferred = new Set(TOKENIZER_TEST_PREFERRED);
  return [...TOKENIZER_TEST_PREFERRED, ...POPULAR_L2S.filter((c) => !preferred.has(c))];
})();

/** Two languages per row on wide screens; one column on narrow screens. */
const WIDE_BREAKPOINT = 768;

export default function TokenizerScreen() {
  const { tokenizedText, updateTokenizedText, display, updateDisplay } = useSettingsContext();
  const t = useT();
  const { width, height } = useWindowDimensions();
  const cols = width >= WIDE_BREAKPOINT ? 2 : 1;
  const cardHeight = Math.round(Math.max(480, height * 0.62));

  // ── Settings hidden behind a toggle ──
  const [showSettings, setShowSettings] = useState(false);

  // ── Long / short sample toggle, persisted across refreshes ──
  const [longSample, setLongSample] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(TEXT_LENGTH_KEY)
      .then((v) => { if (v === 'long') setLongSample(true); })
      .catch(() => {});
  }, []);
  const onLongSampleChange = (v: boolean) => {
    setLongSample(v);
    AsyncStorage.setItem(TEXT_LENGTH_KEY, v ? 'long' : 'short').catch(() => {});
  };

  const zoomRem = ZOOM_TO_REM[tokenizedText.zoom] ?? 1;

  const header = (
    <View>
      <Text className="text-3xl font-bold text-foreground">{t('title.tokenizer_test')}</Text>
      <Text className="mt-2 text-base text-muted-foreground">{t('msg.tokenizer_test_desc')}</Text>

      {/* ── Settings, collapsed behind a toggle ── */}
      <Pressable
        onPress={() => setShowSettings((s) => !s)}
        className="mt-5 flex-row items-center justify-between rounded-lg border border-border bg-card px-4 py-3"
      >
        <View className="flex-row items-center gap-2">
          <Settings2 size={16} color={ICON_MUTED} />
          <Text className="text-base font-medium text-foreground">{t('label.settings')}</Text>
        </View>
        {showSettings ? <ChevronUp size={16} color={ICON_MUTED} /> : <ChevronDown size={16} color={ICON_MUTED} />}
      </Pressable>

      {showSettings && (
        <View className="mt-2 rounded-lg border border-border bg-card px-4 py-3">
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
          <ToggleRow
            label={t('label.show_translation')}
            desc={t('msg.show_translation_desc')}
            value={display.translation}
            onValueChange={(v) => updateDisplay({ translation: v })}
          />
          <ToggleRow
            label={t('setting.long_sample_text')}
            value={longSample}
            onValueChange={onLongSampleChange}
          />
        </View>
      )}
    </View>
  );

  return (
    <PageContainer maxWidth="7xl">
      <FlatList
        key={cols}
        data={tokenizerTestOrder}
        keyExtractor={(code) => code}
        numColumns={cols}
        columnWrapperStyle={cols > 1 ? { gap: 12 } : undefined}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        className="flex-1"
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <TokenizerLanguageCard code={item} height={cardHeight} longSample={longSample} />
        )}
      />
    </PageContainer>
  );
}
