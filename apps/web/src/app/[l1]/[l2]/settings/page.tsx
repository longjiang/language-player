'use client';

import { useState } from 'react';
import { useLanguage } from '@/providers/language-provider';
import { useSrs } from '@/hooks/use-srs';
import { DEFAULT_DAILY_NEW_LIMIT } from '@langplayer/utils';
import { languageName } from '@/lib/language-data';
import { useT } from '@/hooks/use-t';
import { VoicePicker } from '@/components/voice-picker';

export default function SettingsPage() {
  const { l1, l2 } = useLanguage();
  const { dailyNewLimit, updateSettings } = useSrs();
  const t = useT();
  const [tab, setTab] = useState<'pronunciation' | 'review'>('pronunciation');

  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <h1 className="text-3xl font-bold">{t('title.settings')}</h1>
      <p className="mt-2 text-muted-foreground">
        {t('msg.settings_desc', { l1: languageName(l1.code), l2: languageName(l2.code, l1.code) })}
      </p>

      {/* Tab bar */}
      <div className="mt-8 flex border-b border-border">
        <button
          onClick={() => setTab('pronunciation')}
          className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
            tab === 'pronunciation'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Pronunciation
        </button>
        <button
          onClick={() => setTab('review')}
          className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
            tab === 'review'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Review
        </button>
      </div>

      {/* Pronunciation tab */}
      {tab === 'pronunciation' && (
        <section className="rounded-b-xl rounded-tr-xl border border-t-0 border-border bg-card p-5 shadow-sm">
          <VoicePicker />
        </section>
      )}

      {/* Review tab */}
      {tab === 'review' && (
        <section className="rounded-b-xl rounded-tr-xl border border-t-0 border-border bg-card p-5 shadow-sm space-y-6">
          <div>
            <label className="block text-sm font-medium mb-1">
              New cards per day
            </label>
            <p className="text-sm text-muted-foreground mb-3">
              Maximum number of new words introduced into your review deck each day.
            </p>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={1}
                max={50}
                step={1}
                value={dailyNewLimit}
                onChange={(e) => updateSettings({ dailyNewLimit: Number(e.target.value) })}
                className="flex-1 h-2 rounded-full appearance-none bg-muted cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5
                  [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:cursor-pointer"
              />
              <span className="w-12 text-center text-lg font-semibold tabular-nums">
                {dailyNewLimit}
              </span>
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-xs text-muted-foreground">1</span>
              <span className="text-xs text-muted-foreground">{DEFAULT_DAILY_NEW_LIMIT} (default)</span>
              <span className="text-xs text-muted-foreground">50</span>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
