'use client';

import { useState, useEffect, useRef } from 'react';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';
import { useLanguage } from '@/providers/language-provider';
import { useSettingsContext } from '@/providers/settings-provider';
import { useT } from '@/hooks/use-t';
import { getSampleSentence, loadSampleShort } from '@langplayer/shared';
import { translateText } from '@/lib/translate';
import { TokenizedText } from '@/components/tokenized-text';
import { TextActionMenu } from '@/components/text-action-menu';
import { renderInlineMarkdown } from '@/components/text-action-panels';
import { clampTranslationSize } from '@/lib/reader-text-size';
import { SectionHeader } from '../_components/SectionHeader';
import { SegmentedRow } from '../_components/SegmentedRow';
import { ToggleRow } from '../_components/ToggleRow';
import { SliderRow } from '../_components/SliderRow';

/** Split simple inline markdown (**bold**, *italic*, `code`) into segments. */
function parsePreviewSegments(text: string): { text: string; bold?: boolean; italic?: boolean; code?: boolean }[] {
  const out: { text: string; bold?: boolean; italic?: boolean; code?: boolean }[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    const token = m[0];
    if (token.length >= 4 && token.startsWith('**') && token.endsWith('**')) {
      out.push({ text: token.slice(2, -2), bold: true });
    } else if (token.startsWith('`') && token.endsWith('`')) {
      out.push({ text: token.slice(1, -1), code: true });
    } else {
      out.push({ text: token.slice(1, -1), italic: true });
    }
    last = m.index + token.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

export default function DisplaySettingsPage() {
  const { l1, l2 } = useLanguage();
  const {
    tokenizedText, updateTokenizedText,
    display, updateDisplay,
    getL2, updateL2, ensureL2,
    loaded,
  } = useSettingsContext();
  const { setTheme } = useTheme();
  const t = useT();

  const isChinese = l2.code === 'zh';
  const isKorean = l2.code === 'ko';
  const isVietnamese = l2.code === 'vi';

  useEffect(() => { if (loaded) ensureL2(l2.code); }, [l2.code, loaded, ensureL2]);

  const l2Settings = getL2(l2.code);
  const popupEnabled = tokenizedText.enabled;

  const [previewText, setPreviewText] = useState('');
  const [previewTranslation, setPreviewTranslation] = useState('');

  const ZOOM_TO_REM = [1, 1.125, 1.25, 1.375, 1.5, 1.75, 2, 2.25] as const;
  const zoomRem = ZOOM_TO_REM[tokenizedText.zoom] ?? 1;

  // Lazy-load the per-language sample paragraph (famous place), with the old
  // sentence as a fallback if the chunk fails to load.
  useEffect(() => {
    let cancelled = false;
    loadSampleShort(l2.code)
      .then((text) => { if (!cancelled) setPreviewText(text); })
      .catch(() => { if (!cancelled) setPreviewText(getSampleSentence(l2.code)); });
    return () => { cancelled = true; };
  }, [l2.code]);

  useEffect(() => {
    if (!previewText || !display.translation) {
      setPreviewTranslation('');
      return;
    }
    let cancelled = false;
    translateText(previewText, l1.code, l2.code).then(result => {
      if (!cancelled) setPreviewTranslation(result);
    });
    return () => { cancelled = true; };
  }, [previewText, l1.code, l2.code, display.translation]);

  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    const timer = setTimeout(() => {
      toast.success(t('msg.settings_saved'));
    }, 1200);
    return () => clearTimeout(timer);
  }, [tokenizedText, display, l2Settings, t]);

  if (!loaded) {
    return <div className="mx-auto max-w-lg px-4 py-12 text-center text-muted-foreground">{t('msg.loading')}</div>;
  }

  return (
    <div className="mx-auto max-w-lg py-12">
      <h1 className="text-3xl font-bold mb-8">{t('title.display')}</h1>

      <div className="space-y-8">
        {/* Theme */}
        <SectionHeader title={t('setting.theme')}>
          <SegmentedRow
            label={t('label.theme')}
            value={display.theme}
            onChange={(v: string) => {
              const theme = v as 'light' | 'dark' | 'system';
              updateDisplay({ theme });
              setTheme(theme);
            }}
            options={[
              { value: 'light', label: '☀️ ' + t('setting.light') },
              { value: 'dark', label: '🌙 ' + t('setting.dark') },
              { value: 'system', label: '💻 ' + t('setting.system') },
            ]}
          />
        </SectionHeader>

        {/* Tokenized Text Preview */}
        <SectionHeader title={t('label.tokenized_text_preview')}>
          <div className="rounded-lg border border-border bg-muted/50 p-4">
            <TextActionMenu text={previewText} l2Code={l2.code} l1Code={l1.code} alwaysShow>
              <span
                style={{
                  fontSize: `${zoomRem}rem`,
                  lineHeight: String(tokenizedText.leading ?? 1.625),
                }}
              >
                {parsePreviewSegments(previewText).map((seg, i) =>
                  seg.bold ? (
                    <strong key={i}>
                      <TokenizedText text={seg.text} l2Code={l2.code} inline typeFace={tokenizedText.typeFace} />
                    </strong>
                  ) : seg.italic ? (
                    <em key={i}>
                      <TokenizedText text={seg.text} l2Code={l2.code} inline typeFace={tokenizedText.typeFace} />
                    </em>
                  ) : (
                    <TokenizedText key={i} text={seg.text} l2Code={l2.code} inline typeFace={tokenizedText.typeFace} />
                  ),
                )}
              </span>
            </TextActionMenu>
            {previewTranslation && (
              <p
                className="pt-1 text-muted-foreground leading-relaxed"
                style={{ fontSize: `${clampTranslationSize(tokenizedText.translationSize) * zoomRem}rem` }}
              >
                {renderInlineMarkdown(previewTranslation, { markBold: true })}
              </p>
            )}
          </div>
        </SectionHeader>

        {/* General toggles */}
        <div className="space-y-4">
          <ToggleRow
            label={t('label.show_translation')}
            description={t('msg.show_translation_desc')}
            checked={display.translation}
            onChange={v => updateDisplay({ translation: v })}
          />
          <ToggleRow
            label={t('label.enable_popup_dictionary')}
            description={t('msg.enable_popup_dictionary_desc')}
            checked={tokenizedText.enabled}
            onChange={v => updateTokenizedText({ enabled: v })}
          />
        </div>

        {/* Popup-enabled controls */}
        {popupEnabled && (
          <>
            {/* Text Appearance */}
            <SectionHeader title={t('setting.text_appearance')}>
              <SegmentedRow
                label={t('label.font')}
                value={tokenizedText.typeFace}
                onChange={(v: string) => updateTokenizedText({ typeFace: v as 'default' | 'serif' | 'sans-serif' })}
                options={[
                  { value: 'default', label: t('setting.font_default') },
                  { value: 'serif', label: t('setting.font_serif') },
                  { value: 'sans-serif', label: t('setting.font_sans_serif') },
                ]}
              />
              <SliderRow
                label={t('label.text_size')}
                min={0} max={7} step={1} value={tokenizedText.zoom}
                onChange={v => updateTokenizedText({ zoom: v })}
                valueDisplay={`${Math.round(zoomRem * 16)}px`}
                leftLabel={t('setting.smaller')}
                rightLabel={t('setting.bigger')}
                centerLabel={`${Math.round(ZOOM_TO_REM[0] * 16)}–${Math.round(ZOOM_TO_REM[7] * 16)}px`}
              />
              <SliderRow
                label={t('label.translation_size')}
                description={t('msg.translation_size_desc')}
                min={0.5} max={1} step={0.05} value={clampTranslationSize(tokenizedText.translationSize)}
                onChange={v => updateTokenizedText({ translationSize: clampTranslationSize(v) })}
                valueDisplay={`${Math.round(clampTranslationSize(tokenizedText.translationSize) * 100)}%`}
                leftLabel="50%"
                rightLabel="100%"
              />
              <SliderRow
                label={t('setting.leading')}
                min={1} max={2} step={0.125} value={tokenizedText.leading ?? 1.625}
                onChange={v => updateTokenizedText({ leading: v })}
                valueDisplay={`×${(tokenizedText.leading ?? 1.625).toFixed(2)}`}
                leftLabel="1×"
                rightLabel="2×"
              />
            </SectionHeader>

            {/* Phonetics */}
            <SectionHeader title={t('setting.phonetics')}>
              <SegmentedRow
                label={t('label.show_phonetics')}
                value={l2Settings.tokenSpan.phonetics.show === false ? 'off' : l2Settings.tokenSpan.phonetics.show}
                onChange={(v: string) => {
                  const ts = l2Settings.tokenSpan;
                  const show = v === 'off' ? false : v as 'ruby' | 'word';
                  const conditions = show === 'word' ? 'always' : ts.phonetics.conditions;
                  updateL2(l2.code, { tokenSpan: { ...ts, phonetics: { ...ts.phonetics, show, conditions } } });
                }}
                options={[
                  { value: 'ruby', label: t('setting.phonetics_on_top') },
                  { value: 'word', label: t('setting.phonetics_replace') },
                  { value: 'off', label: t('setting.off') },
                ]}
              />
              {l2Settings.tokenSpan.phonetics.show === 'ruby' && (
                <SegmentedRow
                  label={t('label.phonetics_conditions')}
                  value={l2Settings.tokenSpan.phonetics.conditions}
                  onChange={(v: string) => {
                    const ts = l2Settings.tokenSpan;
                    updateL2(l2.code, { tokenSpan: { ...ts, phonetics: { ...ts.phonetics, conditions: v as 'always' | 'hardWords' } } });
                  }}
                  options={[
                    { value: 'always', label: t('setting.all_words') },
                    { value: 'hardWords', label: t('setting.hard_words_only') },
                  ]}
                />
              )}
            </SectionHeader>

            {/* Word-Level Display */}
            <SectionHeader title={t('setting.word_level_display')}>
              <div className="space-y-4">
                <ToggleRow
                  label={t('label.show_gloss_saved')}
                  description={t('msg.show_gloss_saved_desc')}
                  checked={tokenizedText.quickGloss}
                  onChange={v => updateTokenizedText({ quickGloss: v })}
                />
                <ToggleRow
                  label={t('label.show_interlinear_gloss')}
                  description={t('msg.show_definition_desc')}
                  checked={l2Settings.tokenSpan.definition.show}
                  onChange={v => {
                    const ts = l2Settings.tokenSpan;
                    updateL2(l2.code, { tokenSpan: { ...ts, definition: { show: v } } });
                  }}
                />
                {isChinese && (
                  <SegmentedRow
                    label={t('label.character_set')}
                    value={l2Settings.display.traditional}
                    onChange={(v: boolean) => updateL2(l2.code, { display: { ...l2Settings.display, traditional: v } })}
                    options={[
                      { value: false, label: '简 ' + t('setting.simplified') },
                      { value: true, label: '繁 ' + t('setting.traditional') },
                    ]}
                  />
                )}
                {isKorean && (
                  <ToggleRow
                    label={t('label.show_hanja')}
                    checked={l2Settings.display.byeonggi}
                    onChange={v => updateL2(l2.code, { display: { ...l2Settings.display, byeonggi: v } })}
                  />
                )}
                {isVietnamese && (
                  <ToggleRow
                    label={t('label.show_hantu')}
                    checked={l2Settings.display.byeonggi}
                    onChange={v => updateL2(l2.code, { display: { ...l2Settings.display, byeonggi: v } })}
                  />
                )}
              </div>
            </SectionHeader>

            {/* Interaction */}
            <SectionHeader title={t('setting.interaction')}>
              <ToggleRow
                label={t('setting.quiz_mode')}
                description={t('msg.quiz_mode_desc')}
                checked={tokenizedText.mode === 'quiz'}
                onChange={v => updateTokenizedText({ mode: v ? 'quiz' : 'normal' })}
              />
            </SectionHeader>
          </>
        )}
      </div>
    </div>
  );
}
