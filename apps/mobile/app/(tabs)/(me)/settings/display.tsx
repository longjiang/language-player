import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useT } from '@/hooks/use-t';
import { getSampleSentence } from '@langplayer/shared';
import { TokenizedText } from '@/components/TokenizedText';
import { PYTHON_API_URL } from '@/lib/api-url';
import { SectionHeader } from '@/components/settings/SectionHeader';
import { ToggleRow } from '@/components/settings/ToggleRow';
import { SliderRow } from '@/components/settings/SliderRow';
import { SegmentedRow } from '@/components/settings/SegmentedRow';

export function DisplaySettings() {
  const { l1Lang, l2Lang } = useLanguage();
  const {
    tokenizedText,
    updateTokenizedText,
    display,
    updateDisplay,
    getL2,
    updateL2,
    ensureL2,
    loaded,
  } = useSettingsContext();
  const t = useT();

  React.useEffect(() => {
    if (loaded) ensureL2(l2Lang.code);
  }, [l2Lang.code, loaded]);

  const l2Settings = getL2(l2Lang.code);
  const popupEnabled = tokenizedText.enabled;
  const previewText = getSampleSentence(l2Lang.code);
  const isChinese = l2Lang.code === 'zh';
  const isKorean = l2Lang.code === 'ko';
  const isVietnamese = l2Lang.code === 'vi';

  // G2: Fetch L1 translation of the sample sentence when translation is enabled
  const [previewTranslation, setPreviewTranslation] = useState('');
  useEffect(() => {
    if (!previewText || !display.translation || !popupEnabled) {
      setPreviewTranslation('');
      return;
    }
    let cancelled = false;
    fetch(`${PYTHON_API_URL}/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: previewText, l1: l1Lang.code, l2: l2Lang.code }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setPreviewTranslation(data.translated_text ?? '');
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [previewText, l1Lang.code, l2Lang.code, display.translation, popupEnabled]);

  if (!loaded) return null;

  return (
    <ScrollView className="flex-1 bg-background">
      <View className="px-4 pt-6 pb-8">
        {/* Theme */}
        <View className="mb-5">
          <SectionHeader title={t('setting.theme')} />
          <Text className="text-sm font-medium text-foreground mb-1.5">{t('label.theme')}</Text>
          <SegmentedRow
            options={['light', 'dark', 'system'] as const}
            value={display.theme}
            onChange={(v) => updateDisplay({ theme: v })}
            renderLabel={(v) =>
              v === 'light' ? `☀️ ${t('setting.light')}` : v === 'dark' ? `🌙 ${t('setting.dark')}` : `💻 ${t('setting.system')}`
            }
          />
        </View>

        {/* Basic toggles */}
        <View className="mb-5">
          <ToggleRow
            label={t('label.show_translation')}
            desc={t('msg.show_translation_desc')}
            value={display.translation}
            onValueChange={(v) => updateDisplay({ translation: v })}
          />
          <ToggleRow
            label={t('label.enable_popup_dictionary')}
            desc={t('msg.enable_popup_dictionary_desc')}
            value={tokenizedText.enabled}
            onValueChange={(v) => updateTokenizedText({ enabled: v })}
          />
        </View>

        {/* Tokenized text preview */}
        {popupEnabled && (
          <View className="mb-5">
            <SectionHeader title={t('label.tokenized_text_preview')} />
            <View className="rounded-lg border border-border bg-muted p-3">
              <TokenizedText text={previewText} l2Code={l2Lang.code} />
              {previewTranslation ? (
                <Text className="pt-1 text-sm text-muted-foreground leading-relaxed">
                  {previewTranslation}
                </Text>
              ) : null}
            </View>
          </View>
        )}

        {/* Text appearance */}
        {popupEnabled && (
          <>
            <View className="mb-5">
              <SectionHeader title={t('setting.text_appearance')} />
              <Text className="text-sm font-medium text-foreground mb-1.5">{t('label.font')}</Text>
              <SegmentedRow
                options={['default', 'serif', 'sans-serif'] as const}
                value={tokenizedText.typeFace}
                onChange={(v) => updateTokenizedText({ typeFace: v })}
                renderLabel={(v) => t(`setting.font_${v === 'default' ? 'default' : v === 'serif' ? 'serif' : 'sans_serif'}`)}
              />
              <SliderRow
                label={t('label.text_size')}
                value={tokenizedText.zoom}
                min={0}
                max={7}
                onValueChange={(v) => updateTokenizedText({ zoom: v })}
                valueDisplay={`${Math.round(([1, 1.125, 1.25, 1.375, 1.5, 1.75, 2, 2.25] as const)[tokenizedText.zoom] * 16)}px`}
                leftLabel={t('setting.smaller')}
                rightLabel={t('setting.bigger')}
                centerLabel={`${Math.round(1 * 16)}–${Math.round(2.25 * 16)}px`}
              />
            </View>

            {/* Phonetics */}
            <View className="mb-5">
              <SectionHeader title={t('setting.phonetics')} />
              <Text className="text-sm font-medium text-foreground mb-1.5">{t('label.show_phonetics')}</Text>
              <SegmentedRow
                options={['ruby', 'word', 'off'] as const}
                value={l2Settings.tokenSpan.phonetics.show === false ? 'off' : l2Settings.tokenSpan.phonetics.show}
                onChange={(v) => {
                  const ts = l2Settings.tokenSpan;
                  updateL2(l2Lang.code, {
                    tokenSpan: { ...ts, phonetics: { ...ts.phonetics, show: v === 'off' ? false : (v as any), conditions: v === 'word' ? ('always' as const) : ts.phonetics.conditions } },
                  });
                }}
                renderLabel={(v) => t(v === 'ruby' ? 'setting.phonetics_on_top' : v === 'word' ? 'setting.phonetics_replace' : 'setting.off')}
              />
              {l2Settings.tokenSpan.phonetics.show === 'ruby' && (
                <>
                  <Text className="text-sm font-medium text-foreground mt-4 mb-1.5">{t('label.phonetics_conditions')}</Text>
                  <SegmentedRow
                    options={['always', 'hardWords'] as const}
                    value={l2Settings.tokenSpan.phonetics.conditions}
                    onChange={(v) => {
                      const ts = l2Settings.tokenSpan;
                      updateL2(l2Lang.code, { tokenSpan: { ...ts, phonetics: { ...ts.phonetics, conditions: v } } });
                    }}
                    renderLabel={(v) => t(v === 'always' ? 'setting.all_words' : 'setting.hard_words_only')}
                  />
                </>
              )}
            </View>

            {/* Word-level display */}
            <View className="mb-5">
              <SectionHeader title={t('setting.word_level_display')} />
              <ToggleRow
                label={t('label.show_interlinear_gloss')}
                desc={t('msg.show_definition_desc')}
                value={l2Settings.tokenSpan.definition.show}
                onValueChange={(v) => {
                  updateL2(l2Lang.code, {
                    tokenSpan: { ...l2Settings.tokenSpan, definition: { ...l2Settings.tokenSpan.definition, show: v } },
                  });
                  // Interlinear makes quick gloss redundant — force it off
                  if (v && tokenizedText.quickGloss) {
                    updateTokenizedText({ quickGloss: false });
                  }
                }}
              />
              <ToggleRow
                label={t('label.show_gloss_saved')}
                desc={t('msg.show_gloss_saved_desc')}
                value={tokenizedText.quickGloss}
                onValueChange={(v) => updateTokenizedText({ quickGloss: v })}
                disabled={l2Settings.tokenSpan.definition.show}
              />
              {isChinese && (
                <>
                  <Text className="text-sm font-medium text-foreground mt-2 mb-1.5">{t('label.character_set')}</Text>
                  <View className="flex-row rounded-lg border border-border bg-muted p-0.5">
                    {([{ v: 'false', l: `简 ${t('setting.simplified')}` }, { v: 'true', l: `繁 ${t('setting.traditional')}` }] as const).map((o) => (
                      <Pressable
                        key={o.v}
                        onPress={() => updateL2(l2Lang.code, { display: { ...l2Settings.display, traditional: o.v === 'true' } })}
                        className={`flex-1 py-2 items-center rounded-md ${String(l2Settings.display.traditional) === o.v ? 'bg-card' : ''}`}
                      >
                        <Text className={`text-xs font-semibold ${String(l2Settings.display.traditional) === o.v ? 'text-foreground' : 'text-muted-foreground'}`}>
                          {o.l}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              )}
              {isKorean && (
                <ToggleRow
                  label={t('label.show_hanja')}
                  value={l2Settings.display.byeonggi !== false}
                  onValueChange={(v) => updateL2(l2Lang.code, { display: { ...l2Settings.display, byeonggi: v } })}
                />
              )}
              {isVietnamese && (
                <ToggleRow
                  label={t('label.show_hantu')}
                  value={l2Settings.display.byeonggi !== false}
                  onValueChange={(v) => updateL2(l2Lang.code, { display: { ...l2Settings.display, byeonggi: v } })}
                />
              )}
            </View>

            {/* Interaction */}
            <View className="mb-5">
              <SectionHeader title={t('setting.interaction')} />
              <ToggleRow
                label={t('setting.quiz_mode')}
                desc={t('msg.quiz_mode_desc')}
                value={tokenizedText.mode === 'quiz'}
                onValueChange={(v) => updateTokenizedText({ mode: v ? 'quiz' : 'normal' })}
              />
            </View>
          </>
        )}
      </View>
    </ScrollView>
  );
}

export default DisplaySettings;
