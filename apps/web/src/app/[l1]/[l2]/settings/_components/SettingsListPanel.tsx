'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLanguage } from '@/providers/language-provider';
import { useSettingsContext } from '@/providers/settings-provider';
import { useT } from '@/hooks/use-t';
import { SETTINGS_SEARCH_KEYS } from '@langplayer/shared';
import { SearchBar } from './SearchBar';
import { Palette, Play, Mic, Repeat, Search, ChevronRight } from 'lucide-react';

interface SettingsRow {
  key: string;
  icon: typeof Palette;
  title: string;
  subtitle: string;
  href: string;
}

interface SettingsSection {
  title: string;
  rows: SettingsRow[];
}

interface SettingsListPanelProps {
  /** Renders without the "Settings" heading (shown in sidebar where title is elsewhere) */
  hideTitle?: boolean;
}

export function SettingsListPanel({ hideTitle = false }: SettingsListPanelProps) {
  const { l1, l2 } = useLanguage();
  const { display, playback, review, search } = useSettingsContext();
  const pathname = usePathname();
  const t = useT();
  const [query, setQuery] = useState('');
  const [localizedLabels, setLocalizedLabels] = useState<Record<string, string[]>>({});

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
        {
          key: 'display',
          icon: Palette,
          title: t('title.display'),
          subtitle: t(`setting.${display.theme}`),
          href: `/${l1.code}/${l2.code}/settings/display`,
        },
        {
          key: 'playback',
          icon: Play,
          title: t('title.playback'),
          subtitle: t(playback.transcriptMode === 'transcript' ? 'title.transcript' : 'label.subtitles'),
          href: `/${l1.code}/${l2.code}/settings/playback`,
        },
        {
          key: 'speech',
          icon: Mic,
          title: t('title.speech'),
          subtitle: t('setting.speech_rate', { rate: playback.speed.toFixed(1) }),
          href: `/${l1.code}/${l2.code}/settings/speech`,
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
          href: `/${l1.code}/${l2.code}/settings/review`,
        },
        {
          key: 'search',
          icon: Search,
          title: t('setting.subs_search'),
          subtitle: t('setting.subs_search_hits', { n: search.expandSubsSearch ? 500 : 50 }),
          href: `/${l1.code}/${l2.code}/settings/search`,
        },
      ],
    },
  ], [l1.code, l2.code, display.theme, playback.transcriptMode, playback.speed, review.dailyNewLimit, search.expandSubsSearch, t]);

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
    <div>
      {!hideTitle && (
        <h1 className="text-3xl font-bold mb-1">{t('title.settings')}</h1>
      )}

      <div className={hideTitle ? '' : 'mt-6 mb-8'}>
        <SearchBar
          value={query}
          onChange={setQuery}
          placeholder={t('msg.search_settings')}
        />
      </div>

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
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                {section.title}
              </h2>
              <div className="rounded-lg border border-border overflow-hidden">
                {section.rows.map((row, i) => {
                  const Icon = row.icon;
                  const isActive = pathname === row.href;
                  return (
                    <Link
                      key={row.key}
                      href={row.href}
                      className={`flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors
                        ${isActive ? 'bg-muted/30' : ''}
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
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
