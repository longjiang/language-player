'use client';

import { useState, useEffect, useMemo } from 'react';
import { useLanguage } from '@/providers/language-provider';
import { useSettingsContext } from '@/providers/settings-provider';
import { useSubscriptionContext } from '@/providers/subscription-provider';
import { useT } from '@/hooks/use-t';
import { SETTINGS_SEARCH_KEYS } from '@langplayer/shared';
import { SearchBar } from '@/components/settings/SearchBar';
import { Palette, Play, Mic, Repeat, Search, ChevronRight } from 'lucide-react';
import type { SettingsCategory } from '@/components/settings/settings-categories';

interface SettingsRow {
  key: SettingsCategory;
  icon: typeof Palette;
  title: string;
  subtitle: string;
}

interface SettingsSection {
  title: string;
  rows: SettingsRow[];
}

/**
 * Settings list — search bar + grouped category rows. Rendered as the modal's
 * list view on narrow screens and as the sidebar on wide screens (ADR-0042).
 * Selecting a row swaps the modal's detail pane instead of navigating.
 */
export function SettingsList({
  selectedKey,
  onSelect,
}: {
  selectedKey: SettingsCategory | null;
  onSelect: (key: SettingsCategory) => void;
}) {
  const { l1, l2 } = useLanguage();
  const { display, playback, review, search, getL2 } = useSettingsContext();
  const { isPro } = useSubscriptionContext();
  const t = useT();
  const [query, setQuery] = useState('');
  const [localizedLabels, setLocalizedLabels] = useState<Record<string, string[]>>({});

  // The Speech row previews the per-L2 TTS rate the Speech page actually edits
  // (`l2[code].speech.rate`). It previously rendered `playback.speed` — the
  // GLOBAL video playback speed, which no control writes in either app, so the
  // row sat at its 1.0 default and disagreed with mobile's SettingsList, which
  // reads the speech rate.
  const speechRate = getL2(l2.code).speech.rate;

  // Pre-resolve search keys on locale change
  useEffect(() => {
    const result: Record<string, string[]> = {};
    for (const [category, keys] of Object.entries(SETTINGS_SEARCH_KEYS)) {
      result[category] = keys
        .map((key) => {
          const raw = t.raw(key);
          // Skip messages with ICU placeholders ({l2}, {count}, …) — they need
          // values at translate time and don't make useful search terms anyway.
          return typeof raw === 'string' && !raw.includes('{') ? raw.toLowerCase() : '';
        })
        .filter(Boolean);
    }
    setLocalizedLabels(result);
  }, [l1.code, t]);

  const sections: SettingsSection[] = useMemo(() => [
    {
      title: t('setting.appearance'),
      rows: [
        { key: 'display', icon: Palette, title: t('title.display'), subtitle: t(`setting.${display.theme}`) },
        {
          key: 'playback',
          icon: Play,
          title: t('title.playback'),
          subtitle: t(playback.transcriptMode === 'transcript' ? 'title.transcript' : 'label.subtitles'),
        },
        {
          key: 'speech',
          icon: Mic,
          title: t('title.speech'),
          subtitle: t('setting.speech_rate', { rate: speechRate.toFixed(1) }),
        },
      ],
    },
    {
      title: t('setting.learning'),
      rows: [
        {
          key: 'review',
          icon: Repeat,
          title: t('title.review'),
          subtitle: t('msg.cards_per_day', { n: review.dailyNewLimit }),
        },
        {
          key: 'search',
          icon: Search,
          title: t('setting.subs_search'),
          subtitle: t('setting.subs_search_hits', { n: isPro && search.expandSubsSearch ? 500 : 50 }),
        },
      ],
    },
  ], [display.theme, playback.transcriptMode, speechRate, review.dailyNewLimit, isPro, search.expandSubsSearch, t]);

  const filteredSections = useMemo(() => {
    if (!query.trim()) return sections;
    const q = query.toLowerCase();
    return sections
      .map(s => ({
        ...s,
        rows: s.rows.filter(row => {
          if (row.title.toLowerCase().includes(q)) return true;
          if (row.subtitle?.toLowerCase().includes(q)) return true;
          const labels = localizedLabels[row.key];
          if (labels?.some(label => label.includes(q))) return true;
          return false;
        }),
      }))
      .filter(s => s.rows.length > 0);
  }, [query, sections, localizedLabels]);

  const hasResults = filteredSections.some(s => s.rows.length > 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <h2 className="px-5 pt-5 pb-1 text-2xl font-bold">{t('title.settings')}</h2>

      <div className="px-5 pt-4 pb-4">
        <SearchBar
          value={query}
          onChange={setQuery}
          placeholder={t('msg.search_settings')}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
        {!hasResults ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>{t('msg.no_settings_match', { query })}</p>
            <button
              onClick={() => setQuery('')}
              className="mt-2 text-sm text-primary underline underline-offset-2 hover:no-underline"
            >
              {t('msg.clear_search')}
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {filteredSections.map(section => (
              <div key={section.title}>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  {section.title}
                </h3>
                <div className="rounded-lg border border-border overflow-hidden">
                  {section.rows.map((row, i) => {
                    const Icon = row.icon;
                    const isActive = selectedKey === row.key;
                    return (
                      <button
                        key={row.key}
                        type="button"
                        onClick={() => onSelect(row.key)}
                        className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors
                          ${isActive ? 'bg-muted/40' : ''}
                          ${i < section.rows.length - 1 ? 'border-b border-border' : ''}`}
                      >
                        <Icon className="w-5 h-5 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium ${isActive ? 'text-foreground' : ''}`}>
                            {row.title}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">{row.subtitle}</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
