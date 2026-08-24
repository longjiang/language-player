import React from 'react';
import { FlatList, Text, View, useWindowDimensions } from 'react-native';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useT } from '@/hooks/use-t';
import { SliderRow } from '@/components/settings/SliderRow';
import { ToggleRow } from '@/components/settings/ToggleRow';
import { PageContainer } from '@/components/layout/PageContainer';
import { POPULAR_L2S } from '@langplayer/shared';
import { TokenizerLanguageCard } from './tokenizer-language-card';

const ZOOM_TO_REM = [1, 1.125, 1.25, 1.375, 1.5, 1.75, 2, 2.25] as const;

/**
 * Curated display order for the tokenizer test screen (local to this screen
 * only — `POPULAR_L2S` stays the shared ADR-0030 source of truth). The
 * ruby-bearing scripts are the most useful to spot-check, so those lead,
 * then the rest of the popular list in its original order.
 */
const TOKENIZER_TEST_PREFERRED = ['zh', 'ja', 'ko', 'ru', 'ar', 'yue', 'hi'];

/** One language per line (full width) so a side-by-side translation column
 *  fits inside each card, exactly like the reader. */
const tokenizerTestOrder = (() => {
  const preferred = new Set(TOKENIZER_TEST_PREFERRED);
  return [...TOKENIZER_TEST_PREFERRED, ...POPULAR_L2S.filter((c) => !preferred.has(c))];
})();

export default function TokenizerScreen() {
  const { tokenizedText, updateTokenizedText, display, updateDisplay } = useSettingsContext();
  const t = useT();
  const { height } = useWindowDimensions();
  // One full-width card per language: tall enough to hold a paged block with
  // an optional side-by-side translation column (~60% of the screen height).
  const cardHeight = Math.round(Math.max(480, height * 0.62));

  const zoomRem = ZOOM_TO_REM[tokenizedText.zoom] ?? 1;

  const header = (
    <View>
      <Text className="text-3xl font-bold text-foreground">{t('title.tokenizer_test')}</Text>
      <Text className="mt-2 text-base text-muted-foreground">{t('msg.tokenizer_test_desc')}</Text>

      {/* ── Text size + line spacing sliders + translation toggle (tied to settings) ── */}
      <View className="mt-5 rounded-lg border border-border bg-card px-4 py-3">
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
      </View>
    </View>
  );

  return (
    <PageContainer maxWidth="7xl">
      <FlatList
        data={tokenizerTestOrder}
        keyExtractor={(code) => code}
        numColumns={1}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        className="flex-1"
        ListHeaderComponent={header}
        renderItem={({ item }) => <TokenizerLanguageCard code={item} height={cardHeight} />}
      />
    </PageContainer>
  );
}
