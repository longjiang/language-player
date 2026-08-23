import React from 'react';
import { FlatList, Text, View, useWindowDimensions } from 'react-native';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useT } from '@/hooks/use-t';
import { SliderRow } from '@/components/settings/SliderRow';
import { PageContainer } from '@/components/layout/PageContainer';
import { POPULAR_L2S } from '@langplayer/shared';
import { TokenizerLanguageCard } from './tokenizer-language-card';

const ZOOM_TO_REM = [1, 1.125, 1.25, 1.375, 1.5, 1.75, 2, 2.25] as const;

/** Two columns on wide (tablet/landscape) screens, one column on phones. */
const WIDE_BREAKPOINT = 768;

export default function TokenizerScreen() {
  const { tokenizedText, updateTokenizedText } = useSettingsContext();
  const t = useT();
  const { width } = useWindowDimensions();
  const cols = width >= WIDE_BREAKPOINT ? 2 : 1;
  const cardHeight = Math.round(Math.max(420, Math.min(width * 1.5, 640)));

  const zoomRem = ZOOM_TO_REM[tokenizedText.zoom] ?? 1;

  const header = (
    <View>
      <Text className="text-3xl font-bold text-foreground">{t('title.tokenizer_test')}</Text>
      <Text className="mt-2 text-base text-muted-foreground">{t('msg.tokenizer_test_desc')}</Text>

      {/* ── Text size + line spacing sliders (tied to settings) ── */}
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
      </View>
    </View>
  );

  return (
    <PageContainer maxWidth="7xl">
      <FlatList
        key={cols}
        data={POPULAR_L2S}
        keyExtractor={(code) => code}
        numColumns={cols}
        columnWrapperStyle={cols > 1 ? { gap: 12 } : undefined}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        className="flex-1"
        ListHeaderComponent={header}
        renderItem={({ item }) => <TokenizerLanguageCard code={item} height={cardHeight} />}
      />
    </PageContainer>
  );
}
