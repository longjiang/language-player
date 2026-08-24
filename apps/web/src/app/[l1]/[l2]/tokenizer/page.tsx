'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSettingsContext } from '@/providers/settings-provider';
import { useT } from '@/hooks/use-t';
import { SliderRow } from '../settings/_components/SliderRow';
import { ToggleRow } from '../settings/_components/ToggleRow';
import { POPULAR_L2S } from '@langplayer/shared';
import { Settings2, ChevronDown, ChevronUp } from 'lucide-react';
import { TokenizerLanguageCard } from './tokenizer-language-card';

const ZOOM_TO_REM = [1, 1.125, 1.25, 1.375, 1.5, 1.75, 2, 2.25] as const;

/** Persisted toggle: whether each card shows the long multi-paragraph sample. */
const TEXT_LENGTH_KEY = 'zthTokenizerTest:textLength';

/**
 * Curated display order for the tokenizer test screen (local to this screen
 * only — `POPULAR_L2S` stays the shared ADR-0030 source of truth). The
 * ruby-bearing scripts are the most useful to spot-check, so those lead,
 * then the rest of the popular list in its original order (mobile parity).
 */
const TOKENIZER_TEST_PREFERRED = ['zh', 'ja', 'ko', 'ru', 'ar', 'yue', 'hi'];

const tokenizerTestOrder = (() => {
  const preferred = new Set(TOKENIZER_TEST_PREFERRED);
  return [...TOKENIZER_TEST_PREFERRED, ...POPULAR_L2S.filter((c) => !preferred.has(c))];
})();

export default function TokenizerPage() {
  const { tokenizedText, updateTokenizedText, display, updateDisplay } = useSettingsContext();
  const t = useT();
  const zoomRem = ZOOM_TO_REM[tokenizedText.zoom] ?? 1;

  // ── Settings hidden behind a toggle ──
  const [showSettings, setShowSettings] = useState(false);

  // ── Long / short sample toggle, persisted across refreshes ──
  const [longSample, setLongSample] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (window.localStorage.getItem(TEXT_LENGTH_KEY) === 'long') setLongSample(true);
    } catch {
      /* localStorage unavailable — keep short default */
    }
  }, []);
  const onLongSampleChange = useCallback((v: boolean) => {
    setLongSample(v);
    try {
      window.localStorage.setItem(TEXT_LENGTH_KEY, v ? 'long' : 'short');
    } catch {
      /* ignore */
    }
  }, []);

  // ── Card height tracks the window (mobile parity: max(480, h * 0.62)) ──
  const [cardHeight, setCardHeight] = useState(480);
  useEffect(() => {
    const update = () => setCardHeight(Math.max(480, Math.round(window.innerHeight * 0.62)));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8">
      <h1 className="text-3xl font-bold">{t('title.tokenizer_test')}</h1>
      <p className="mt-2 text-muted-foreground">{t('msg.tokenizer_test_desc')}</p>

      {/* ── Settings, collapsed behind a toggle ── */}
      <button
        onClick={() => setShowSettings((s) => !s)}
        className="mt-5 flex w-full items-center justify-between rounded-lg border border-border bg-card px-4 py-3"
      >
        <span className="flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-muted-foreground" />
          <span className="text-base font-medium text-foreground">{t('label.settings')}</span>
        </span>
        {showSettings ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {showSettings && (
        <div className="mt-2 space-y-4 rounded-lg border border-border bg-card p-4">
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
          <ToggleRow
            label={t('label.show_translation')}
            description={t('msg.show_translation_desc')}
            checked={display.translation}
            onChange={(v) => updateDisplay({ translation: v })}
          />
          <ToggleRow
            label={t('setting.long_sample_text')}
            checked={longSample}
            onChange={onLongSampleChange}
          />
        </div>
      )}

      {/* ── All popular L2s in the curated order, one paginated reader each.
          Two columns at the mobile-parity 768px breakpoint (`md:`). ── */}
      <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
        {tokenizerTestOrder.map((code) => (
          <TokenizerLanguageCard key={code} code={code} height={cardHeight} longSample={longSample} />
        ))}
      </div>
    </div>
  );
}
