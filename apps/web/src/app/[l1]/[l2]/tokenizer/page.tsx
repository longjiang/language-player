'use client';

import { useSettingsContext } from '@/providers/settings-provider';
import { useT } from '@/hooks/use-t';
import { SliderRow } from '../settings/_components/SliderRow';
import { POPULAR_L2S } from '@langplayer/shared';
import { TokenizerLanguageCard } from './tokenizer-language-card';

const ZOOM_TO_REM = [1, 1.125, 1.25, 1.375, 1.5, 1.75, 2, 2.25] as const;

export default function TokenizerPage() {
  const { tokenizedText, updateTokenizedText } = useSettingsContext();
  const t = useT();
  const zoomRem = ZOOM_TO_REM[tokenizedText.zoom] ?? 1;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8">
      <h1 className="text-3xl font-bold">{t('title.tokenizer_test')}</h1>
      <p className="mt-2 text-muted-foreground">{t('msg.tokenizer_test_desc')}</p>

      {/* ── Text size + line spacing sliders (tied to settings) ── */}
      <div className="mt-8 rounded-lg border border-border bg-card p-4 space-y-5">
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
          label={t('setting.leading')}
          min={1} max={2} step={0.125} value={tokenizedText.leading ?? 1.625}
          onChange={v => updateTokenizedText({ leading: v })}
          valueDisplay={`×${(tokenizedText.leading ?? 1.625).toFixed(2)}`}
          leftLabel="1×"
          rightLabel="2×"
        />
      </div>

      {/* ── All popular L2s, one paginated reader each (lazy loaded) ── */}
      <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-2">
        {POPULAR_L2S.map((code) => (
          <TokenizerLanguageCard key={code} code={code} />
        ))}
      </div>
    </div>
  );
}
